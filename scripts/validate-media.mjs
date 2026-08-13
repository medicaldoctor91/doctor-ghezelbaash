import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';

const project=process.cwd();
const root=path.join(project,'public/media');
const exiftool=path.join(project,'node_modules','.bin','exiftool');
const exiftoolConfig=path.join(project,'scripts/exiftool-entity.config');
const stale=['ChIJBT','OYDOTt-j8RD-7mAPy6Zas'].join('');
const current='ChIJBT0YDOTt-j8RD-7mAPy6Zas';
const rasterPattern=/\.(?:avif|webp|jpe?g|png)$/i;
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const fail=message=>{throw new Error(message)};
const stableMediaInventory=JSON.parse(await readFile(path.join(project,'src/data/stable-media-aliases.json'),'utf8'));
const stableSubject=stableMediaInventory.subject||{};
const authorityMasterTargets=new Set((stableMediaInventory.aliases||[]).map(item=>path.resolve(project,'public',item.target)));
if(authorityMasterTargets.size!==6)fail(`Authority-master inventory drift: ${authorityMasterTargets.size}`);

async function walk(directory){
  const output=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const absolute=path.join(directory,entry.name);
    if(entry.isDirectory())output.push(...await walk(absolute));
    else output.push(absolute);
  }
  return output;
}

const dimensionRows=(await readFile(path.join(project,'src/data/media-dimensions.tsv'),'utf8')).trim().split('\n');
const expectedDimensions=new Map(dimensionRows.map(line=>{
  const [logical,width,height]=line.split('|');
  return [logical,{width:Number(width),height:Number(height)}];
}));
if(expectedDimensions.size!==49)fail(`Expected dimension inventory drift: ${expectedDimensions.size}`);

const all=await walk(root);
const rasters=all.filter(file=>rasterPattern.test(file)).sort();
if(rasters.length!==49)fail(`Expected exactly 49 raster images, found ${rasters.length}`);
let currentHits=0,selfReferencedSvg=0;
const logicalAssets=new Set();
for(const file of all){
  const bytes=await readFile(file);
  if(bytes.includes(Buffer.from(stale)))fail(`Stale Place ID metadata ${file}`);
  if(bytes.includes(Buffer.from(current)))currentHits++;
  const match=path.basename(file).match(/\.([0-9a-f]{12})\.[^.]+$/);
  if(!match)fail(`Unfingerprinted media ${file}`);
  const selfSvg=file.endsWith('.svg')&&bytes.includes(Buffer.from(path.basename(file)));
  if(selfSvg){
    selfReferencedSvg++;
    const expected=`https://www.ghezelbaash.ir/media/brand/${path.basename(file)}`;
    if(!bytes.includes(Buffer.from(expected)))fail(`Self-referential SVG canonical URL mismatch ${file}`);
  }else if(sha(bytes).slice(0,12)!==match[1])fail(`Fingerprint mismatch ${file}`);
  if(rasterPattern.test(file)){
    const logical=path.relative(project,file).replace(/\.[0-9a-f]{12}(\.[^.]+)$/,'$1');
    if(logicalAssets.has(logical))fail(`Duplicate logical raster asset ${logical}`);
    logicalAssets.add(logical);
  }
}
if(logicalAssets.size!==49)fail(`Logical raster inventory drift: ${logicalAssets.size}`);

const metadata=spawnSync(exiftool,[
  '-config',exiftoolConfig,'-j','-G1','-s','-ImageWidth','-ImageHeight','-XMP-dc:Creator','-XMP-dc:Rights',
  '-XMP-dc:Title','-XMP-dc:Description','-XMP-dc:Subject','-XMP-xmpRights:Marked',
  '-XMP-xmpRights:WebStatement','-XMP-xmpRights:UsageTerms','-XMP-photoshop:Credit',
  '-XMP-iptcCore:CreatorWorkURL','-XMP-plus:ImageCreatorName','-XMP-plus:CopyrightOwnerName',
  '-XMP-plus:LicensorName','-XMP-plus:LicensorURL','-XMP-plus:LicenseID',
  '-XMP-plus:TermsAndConditionsURL','-XMP-plus:TermsAndConditionsText',
  '-XMP-entity:CanonicalPersonIRI','-XMP-entity:CanonicalPersonWebIRI','-XMP-entity:CanonicalClinicIRI',
  '-XMP-entity:GoogleKnowledgeGraphPersonID','-XMP-entity:GoogleMapsPlaceID','-XMP-entity:ImageRole',
  '-XMP-entity:MetadataProfileVersion','-XMP-iptcExt:PersonInImageId','-XMP-dc:Relation',
  '-XMP-sem:DoctorIdentifiers','-XMP-sem:EntityGraphJSONLD',...rasters
],{encoding:'utf8',maxBuffer:100*1024*1024});
if(metadata.status!==0)fail(`ExifTool metadata validation failed: ${metadata.stderr}`);
const rows=JSON.parse(metadata.stdout);
if(rows.length!==49)fail(`Embedded metadata row count drift: ${rows.length}`);
const scalar=(row,key)=>row[key]??Object.entries(row).find(([candidate])=>candidate.endsWith(`:${key}`))?.[1];
const values=value=>Array.isArray(value)?value:value===undefined?[]:[value];
const universalSubjects=['Saeed Ghezelbash','Dr. Saeed Ghezelbash','دکتر سعید قزلباش','Q140287622','Q140288589','IRIMC 167430','Google KG /g/11nqdfk76c',`Google Place ${current}`];
const rights='© Saeed Ghezelbash. Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).';
const usage='CC BY 4.0; attribution required: Saeed Ghezelbash / Dr. Saeed Ghezelbash Aesthetic Clinic.';
const authorityIdentityIris=[stableSubject.canonicalPersonIri,stableSubject.wikidataPersonIri,stableSubject.googleKnowledgeGraphUrl];
if(authorityIdentityIris.some(value=>!value)||stableSubject.googleKnowledgeGraphId!=='/g/11nqdfk76c')fail('Authority-master subject contract is incomplete');
const validatedAuthorityMasters=new Set();
for(const row of rows){
  const file=row.SourceFile;
  const logical=path.relative(project,file).replace(/\.[0-9a-f]{12}(\.[^.]+)$/,'$1');
  const expected=expectedDimensions.get(logical);
  if(!expected)fail(`Raster missing from dimension inventory: ${logical}`);
  if(scalar(row,'ImageWidth')!==expected.width||scalar(row,'ImageHeight')!==expected.height)fail(`Raster dimensions drift: ${logical}`);
  const exact={
    'XMP-dc:Creator':'Saeed Ghezelbash','XMP-dc:Rights':rights,'XMP-xmpRights:Marked':true,
    'XMP-xmpRights:UsageTerms':usage,'XMP-photoshop:Credit':'Saeed Ghezelbash / Dr. Saeed Ghezelbash Aesthetic Clinic',
    'XMP-iptcCore:CreatorWorkURL':'https://www.ghezelbaash.ir/#saeed-ghezelbash',
    'XMP-plus:ImageCreatorName':'Saeed Ghezelbash','XMP-plus:CopyrightOwnerName':'Saeed Ghezelbash',
    'XMP-plus:LicensorName':'Saeed Ghezelbash','XMP-plus:LicenseID':'https://creativecommons.org/licenses/by/4.0/',
    'XMP-plus:TermsAndConditionsText':usage,'XMP-entity:CanonicalPersonIRI':stableSubject.wikidataPersonIri,
    'XMP-entity:CanonicalPersonWebIRI':stableSubject.canonicalPersonIri,
    'XMP-entity:GoogleKnowledgeGraphPersonID':stableSubject.googleKnowledgeGraphId,
    'XMP-entity:CanonicalClinicIRI':'https://www.wikidata.org/entity/Q140288589','XMP-entity:GoogleMapsPlaceID':current,
    'XMP-entity:MetadataProfileVersion':'3.1.0'
  };
  for(const [key,value] of Object.entries(exact))if(row[key]!==value)fail(`Embedded metadata ${key} drift: ${file}`);
  for(const key of ['XMP-dc:Title','XMP-dc:Description','XMP-xmpRights:WebStatement','XMP-plus:LicensorURL','XMP-plus:TermsAndConditionsURL','XMP-entity:ImageRole'])if(!row[key])fail(`Embedded metadata ${key} missing: ${file}`);
  const subjects=values(row['XMP-dc:Subject']);
  if(new Set(subjects).size!==subjects.length)fail(`Duplicate XMP subject terms: ${file}`);
  for(const subject of universalSubjects)if(!subjects.includes(subject))fail(`Required XMP subject ${subject} missing: ${file}`);
  const absoluteFile=path.resolve(file);
  if(authorityMasterTargets.has(absoluteFile)){
    for(const field of ['XMP-iptcExt:PersonInImageId','XMP-dc:Relation','XMP-sem:DoctorIdentifiers']){
      const identifiers=values(row[field]);
      for(const iri of authorityIdentityIris)if(!identifiers.includes(iri))fail(`Authority-master ${field} missing ${iri}: ${file}`);
    }
    let embeddedGraph;
    try{embeddedGraph=JSON.parse(row['XMP-sem:EntityGraphJSONLD'])}catch{fail(`Authority-master embedded entity graph is invalid JSON: ${file}`)}
    const embeddedPerson=(embeddedGraph?.['@graph']||[]).find(node=>node?.['@id']===stableSubject.wikidataPersonIri),embeddedIdentifiers=values(embeddedPerson?.identifiers);
    for(const iri of authorityIdentityIris)if(!embeddedIdentifiers.includes(iri))fail(`Authority-master embedded person graph missing ${iri}: ${file}`);
    validatedAuthorityMasters.add(absoluteFile);
  }
}
if(validatedAuthorityMasters.size!==authorityMasterTargets.size)fail(`Authority-master Google KG URL coverage drift: ${validatedAuthorityMasters.size}/${authorityMasterTargets.size}`);

const ffprobe=spawnSync('ffprobe',['-version']);
let videoFiles=0,imageFiles=0;
if(ffprobe.status===0){
  for(const file of all.filter(candidate=>/\.(?:mp4|webm)$/i.test(candidate))){
    videoFiles++;
    const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name:format_tags','-of','json',file],{encoding:'utf8'});
    if(probe.status)fail(`ffprobe failed ${file}`);
    const streams=JSON.parse(probe.stdout).streams||[];
    if(streams.filter(stream=>stream.codec_type==='video').length!==1||streams.filter(stream=>stream.codec_type==='audio').length!==1||streams.some(stream=>!['video','audio'].includes(stream.codec_type)))fail(`Unexpected streams ${file}`);
  }
  for(const file of rasters){
    imageFiles++;
    const probe=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_type,codec_name,width,height','-of','json',file],{encoding:'utf8'});
    if(probe.status)fail(`Image decode/probe failed ${file}`);
    const stream=(JSON.parse(probe.stdout).streams||[])[0];
    if(!stream||stream.codec_type!=='video'||!stream.width||!stream.height)fail(`Invalid image stream ${file}`);
  }
}
if(currentHits<49)fail(`Entity Place ID metadata unexpectedly sparse: ${currentHits}`);
console.log(JSON.stringify({valid:true,mediaFiles:all.length,videoFiles,imageFiles,rasterImages:rasters.length,currentPlaceIdMetadataFiles:currentHits,embeddedMetadataCoverage:'49/49',googleKnowledgeGraphRawIdCoverage:'49/49',authorityMasterGoogleKgUrlCoverage:`${validatedAuthorityMasters.size}/${authorityMasterTargets.size}`,authorityMasterIdentityFields:['IPTC PersonInImageId','Dublin Core relation','embedded DoctorIdentifiers','embedded EntityGraphJSONLD'],metadataProfile:'XMP/IPTC Core/PLUS 3.1.0',dimensionsLocked:true,selfReferencedSvgIntegrityChecks:selfReferencedSvg},null,2));
