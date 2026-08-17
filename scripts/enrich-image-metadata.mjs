import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {access,copyFile,mkdtemp,readFile,readdir,rm,unlink,writeFile} from 'node:fs/promises';

const root=process.cwd();
const mediaRoot=path.join(root,'public/media');
const exiftool=process.env.EXIFTOOL_PATH||path.join(root,'node_modules','.bin','exiftool');
const exiftoolConfig=path.join(root,'scripts/exiftool-entity.config');
const imagePattern=/\.(?:avif|webp|jpe?g|png)$/i;
const textPattern=/\.(?:astro|css|html|js|json|jsonld|md|mjs|ts|txt|vcf|xml|yaml|yml)$/i;
const hashPattern=/\.([0-9a-f]{12})\.[^.]+$/;
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8'));
const personWikidataIri=`https://www.wikidata.org/entity/${release.primaryEntity.wikidata}`;
const clinicWikidataIri=`https://www.wikidata.org/entity/${release.dataset.supportingClinicWikidata}`;
const canonicalPersonWebIri=release.primaryEntity.id,canonicalClinicWebIri=release.clinic.id;
const personKgId=release.primaryEntity.googleKnowledgeGraphId,clinicKgId=release.clinic.googleLocalKgmid;
const placeId=release.clinic.placeId,clinicCid=release.clinic.cid,irimc=release.primaryEntity.irimc,postalCode=release.clinic.postalCode;
if(!/^ChIJ[\w-]+$/.test(placeId)||!personKgId?.startsWith('/g/')||!clinicKgId?.startsWith('/g/'))throw new Error('Release media identity contract is incomplete');

await access(exiftool).catch(()=>{
  throw new Error(`ExifTool executable not found: ${exiftool}. Run npm install or set EXIFTOOL_PATH.`);
});
await access(exiftoolConfig);
const runExiftool=(args,options={})=>spawnSync(exiftool,['-config',exiftoolConfig,...args],options);

async function walk(directory,{skip=[]}={}){
  const output=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    if(skip.includes(entry.name))continue;
    const absolute=path.join(directory,entry.name);
    if(entry.isDirectory())output.push(...await walk(absolute,{skip}));
    else output.push(absolute);
  }
  return output;
}

const commonSubjects=[
  'Saeed Ghezelbash','Dr. Saeed Ghezelbash','دکتر سعید قزلباش','Mohammad Saeed Ghezelbash',
  'Iranian physician','aesthetic medicine','Kermanshah','Iran',release.primaryEntity.wikidata,release.dataset.supportingClinicWikidata,
  `IRIMC ${irimc}`,`Google KG ${personKgId}`,`Google Place ${placeId}`
];

const profiles=[
  {
    test:name=>name.includes('doctor-ghezelbaash-symbol'),
    title:'Doctor Ghezelbaash visual identity symbol',
    description:'Official visual identity symbol of Dr. Saeed Ghezelbash and Dr. Saeed Ghezelbash Aesthetic Clinic.',
    role:'Official physician and clinic identity symbol',
    subjects:['official symbol','physician identity','clinic identity'],
    acquire:'https://www.ghezelbaash.ir/#media-license'
  },
  {
    test:name=>name.includes('clinic-interior'),
    title:'Interior of Dr. Saeed Ghezelbash Aesthetic Clinic in Kermanshah',
    description:'فضای داخلی کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه، ایران | Interior of Dr. Saeed Ghezelbash Aesthetic Clinic in Kermanshah, Iran.',
    role:'Clinic interior',
    subjects:['clinic interior','فضای داخلی کلینیک زیبایی','aesthetic clinic Kermanshah'],
    acquire:'https://www.ghezelbaash.ir/#media-license'
  },
  {
    test:name=>name.includes('clinic-reception'),
    title:'Reception of Dr. Saeed Ghezelbash Aesthetic Clinic in Kermanshah',
    description:'بخش پذیرش کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه، ایران | Reception of Dr. Saeed Ghezelbash Aesthetic Clinic in Kermanshah, Iran.',
    role:'Clinic reception',
    subjects:['clinic reception','پذیرش کلینیک زیبایی','aesthetic clinic Kermanshah'],
    acquire:'https://www.ghezelbaash.ir/#media-license'
  },
  {
    test:name=>name.includes('jalupro-vs-profhilo'),
    title:'Dr. Saeed Ghezelbash explains Jalupro versus Profhilo',
    description:'Poster for physician-led education by Dr. Saeed Ghezelbash comparing Jalupro, Profhilo and injectable skin rejuvenation.',
    role:'Physician education video poster',
    subjects:['Jalupro','Profhilo','injectable rejuvenation','physician education'],
    acquire:'https://www.ghezelbaash.ir/#media-license'
  },
  {
    test:name=>name.includes('subcision-technique'),
    title:'Dr. Saeed Ghezelbash demonstrates subcision technique',
    description:'Poster for physician-led education by Dr. Saeed Ghezelbash about subcision for tethered acne scars.',
    role:'Physician education video poster',
    subjects:['subcision','acne scars','scar revision','physician education'],
    acquire:'https://www.ghezelbaash.ir/#media-license'
  },
  {
    test:name=>name.includes('thread-lift-workshop'),
    title:'Dr. Saeed Ghezelbash advanced thread-lift workshop',
    description:'Poster for an advanced physician workshop led by Dr. Saeed Ghezelbash on thread-lift anatomy, vectors and technique.',
    role:'Advanced physician workshop video poster',
    subjects:['thread lift','medical workshop','facial anatomy','physician education'],
    acquire:'https://www.ghezelbaash.ir/#media-license'
  },
  {
    test:name=>name.includes('kurdish-patient-review'),
    title:'Kurdish patient experience with Dr. Saeed Ghezelbash',
    description:'Poster for a Kurdish-language patient experience concerning Dr. Saeed Ghezelbash Aesthetic Clinic.',
    role:'Kurdish patient-experience video poster',
    subjects:['Kurdish patient experience','کوردی','patient review','Kermanshah clinic'],
    acquire:'https://www.ghezelbaash.ir/#media-license'
  },
  {
    test:name=>name.includes('clinical-team')||name.includes('clinic-team')||name.includes('social-1200x630'),
    title:'Saeed Ghezelbash with the clinical team of Dr. Saeed Ghezelbash Aesthetic Clinic',
    description:'دکتر سعید قزلباش همراه تیم بالینی کلینیک زیبایی در کرمانشاه | Saeed Ghezelbash with his clinical team in Kermanshah, Iran.',
    role:'Physician with clinical team',
    subjects:['clinical team','medical team','aesthetic clinic','physician portrait'],
    acquire:'https://commons.wikimedia.org/wiki/File:Saeed-Ghezelbaash-with-clinical-team.jpg'
  },
  {
    test:name=>name.includes('clinical-office')||name.includes('clinical-examination'),
    title:'Saeed Ghezelbash at Dr. Saeed Ghezelbash Aesthetic Clinic',
    description:'دکتر سعید قزلباش در محیط بالینی کلینیک زیبایی در کرمانشاه | Saeed Ghezelbash in his clinical office at Dr. Saeed Ghezelbash Aesthetic Clinic in Kermanshah, Iran.',
    role:'Physician in clinical office',
    subjects:['clinical office','physician at work','medical examination','aesthetic clinic'],
    acquire:'https://commons.wikimedia.org/wiki/File:Saeed-Ghezelbaash-in-clinical-office.jpg'
  },
  {
    test:name=>name.includes('portrait'),
    title:'Saeed Ghezelbash — canonical physician portrait',
    description:'Canonical portrait of Saeed Ghezelbash, also known as Mohammad Saeed Ghezelbash, an Iranian physician and medical researcher working in aesthetic medicine in Kermanshah, Iran.',
    role:'Canonical physician portrait',
    subjects:['canonical portrait','Iranian physician','medical researcher','aesthetic medicine physician'],
    acquire:'https://commons.wikimedia.org/wiki/File:Saeed-Ghezelbaash-physician-portrait.jpg'
  }
];

const images=(await walk(mediaRoot)).filter(file=>imagePattern.test(file)).sort();
if(images.length!==49)throw new Error(`Expected exactly 49 raster images, found ${images.length}`);

const rights='© Saeed Ghezelbash. Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).';
const usage='CC BY 4.0; attribution required: Saeed Ghezelbash / Dr. Saeed Ghezelbash Aesthetic Clinic.';
const license='https://creativecommons.org/licenses/by/4.0/';
const inspectMetadata=target=>runExiftool([
  '-j','-G1','-s','-ImageWidth','-ImageHeight','-XMP-dc:Creator','-XMP-dc:Rights','-XMP-dc:Title',
  '-XMP-dc:Description','-XMP-dc:Subject','-XMP-dc:Identifier','-XMP-xmpRights:Marked',
  '-XMP-xmpRights:WebStatement','-XMP-xmpRights:UsageTerms','-XMP-photoshop:Credit',
  '-XMP-iptcCore:CreatorWorkURL','-XMP-plus:ImageCreatorName','-XMP-plus:CopyrightOwnerName',
  '-XMP-plus:LicensorName','-XMP-plus:LicensorURL','-XMP-plus:LicenseID',
  '-XMP-plus:TermsAndConditionsURL','-XMP-plus:TermsAndConditionsText',
  '-XMP-entity:CanonicalPersonIRI','-XMP-entity:CanonicalClinicIRI','-XMP-entity:GoogleMapsPlaceID',
  '-XMP-entity:ClinicGooglePlaceID','-XMP-entity:ImageRole','-XMP-entity:MetadataProfileVersion',target
],{encoding:'utf8',maxBuffer:4*1024*1024});
const scalar=(row,key)=>row[key]??Object.entries(row).find(([candidate])=>candidate.endsWith(`:${key}`))?.[1];
const values=value=>Array.isArray(value)?value:value===undefined?[]:[value];
const metadataMatches=(row,profile,subjects)=>{
  const exact={
    'XMP-dc:Creator':'Saeed Ghezelbash','XMP-dc:Title':profile.title,'XMP-dc:Description':profile.description,
    'XMP-dc:Rights':rights,'XMP-xmpRights:Marked':true,'XMP-xmpRights:WebStatement':profile.acquire,
    'XMP-xmpRights:UsageTerms':usage,'XMP-photoshop:Credit':'Saeed Ghezelbash / Dr. Saeed Ghezelbash Aesthetic Clinic',
    'XMP-iptcCore:CreatorWorkURL':canonicalPersonWebIri,
    'XMP-plus:ImageCreatorName':'Saeed Ghezelbash','XMP-plus:CopyrightOwnerName':'Saeed Ghezelbash',
    'XMP-plus:LicensorName':'Saeed Ghezelbash','XMP-plus:LicensorURL':profile.acquire,
    'XMP-plus:LicenseID':license,'XMP-plus:TermsAndConditionsURL':profile.acquire,
    'XMP-plus:TermsAndConditionsText':usage,'XMP-entity:CanonicalPersonIRI':personWikidataIri,
    'XMP-entity:CanonicalClinicIRI':clinicWikidataIri,
    'XMP-entity:GoogleMapsPlaceID':placeId,'XMP-entity:ImageRole':profile.role,
    'XMP-entity:ClinicGooglePlaceID':placeId,
    'XMP-entity:MetadataProfileVersion':'3.1.0'
  };
  if(Object.entries(exact).some(([key,expected])=>row[key]!==expected))return false;
  const subjectValues=values(row['XMP-dc:Subject']);
  const embeddedSubjects=new Set(subjectValues);
  return subjectValues.length===subjects.length&&embeddedSubjects.size===subjects.length&&subjects.every(subject=>embeddedSubjects.has(subject));
};
const stagingRoot=await mkdtemp(path.join(tmpdir(),'ghezel-media-enrich-'));
const generated=[];
let changedFiles=0;

try{
  for(const [index,file] of images.entries()){
    const basename=path.basename(file);
    const sourceBytes=await readFile(file);
    const fingerprint=basename.match(hashPattern)?.[1];
    if(!fingerprint||sha(sourceBytes).slice(0,12)!==fingerprint)throw new Error(`Input fingerprint mismatch: ${file}`);
    const profile=profiles.find(candidate=>candidate.test(basename));
    if(!profile)throw new Error(`No metadata profile for ${basename}`);
    const sourceProbe=runExiftool(['-j','-s','-ImageWidth','-ImageHeight',file],{encoding:'utf8'});
    if(sourceProbe.status!==0)throw new Error(`ExifTool source probe failed for ${file}: ${sourceProbe.stderr}`);
    const sourceDimensions=JSON.parse(sourceProbe.stdout)[0];
    const staged=path.join(stagingRoot,`${String(index).padStart(2,'0')}-${basename}`);
    await copyFile(file,staged);
    const subjects=[...new Set([...profile.subjects,...commonSubjects])];
    const args=[
      '-overwrite_original','-P','-charset','filename=UTF8','-sep','|',
      '-XMP-dc:Creator=Saeed Ghezelbash',`-XMP-dc:Title=${profile.title}`,
      `-XMP-dc:Description=${profile.description}`,`-XMP-dc:Rights=${rights}`,
      `-XMP-dc:Subject=${subjects.join('|')}`,
      '-XMP-xmpRights:Marked=True',`-XMP-xmpRights:WebStatement=${profile.acquire}`,
      `-XMP-xmpRights:UsageTerms=${usage}`,'-XMP-xmp:CreatorTool=Entity Media Pipeline 2026',
      '-XMP-xmp:MetadataDate=2026:08:07 00:00:00+03:30',`-XMP-photoshop:Headline=${profile.title}`,
      '-XMP-photoshop:Credit=Saeed Ghezelbash / Dr. Saeed Ghezelbash Aesthetic Clinic',
      '-XMP-photoshop:City=کرمانشاه','-XMP-photoshop:State=کرمانشاه','-XMP-photoshop:Country=ایران',
      `-XMP-iptcCore:CreatorWorkURL=${canonicalPersonWebIri}`,
      '-XMP-iptcCore:Location=Dr. Saeed Ghezelbash Aesthetic Clinic','-XMP-iptcCore:CountryCode=IR',
      '-XMP-plus:ImageCreatorName=Saeed Ghezelbash','-XMP-plus:CopyrightOwnerName=Saeed Ghezelbash',
      '-XMP-plus:LicensorName=Saeed Ghezelbash',`-XMP-plus:LicensorURL=${profile.acquire}`,
      `-XMP-plus:LicenseID=${license}`,`-XMP-plus:TermsAndConditionsURL=${profile.acquire}`,
      `-XMP-plus:TermsAndConditionsText=${usage}`,
      `-XMP-entity:CanonicalPersonIRI=${personWikidataIri}`,
      `-XMP-entity:CanonicalPersonWebIRI=${canonicalPersonWebIri}`,
      `-XMP-entity:CanonicalClinicIRI=${clinicWikidataIri}`,
      `-XMP-entity:CanonicalClinicWebIRI=${canonicalClinicWebIri}`,
      `-XMP-entity:GoogleKnowledgeGraphPersonID=${personKgId}`,`-XMP-entity:GoogleKnowledgeGraphClinicID=${clinicKgId}`,
      `-XMP-entity:GoogleMapsPlaceID=${placeId}`,`-XMP-entity:GoogleMapsCID=${clinicCid}`,
      `-XMP-entity:ClinicGooglePlaceID=${placeId}`,`-XMP-entity:ClinicGoogleMapsCID=${clinicCid}`,
      `-XMP-entity:ClinicGoogleKnowledgeGraphID=${clinicKgId}`,`-XMP-entity:PersonGoogleKnowledgeGraphID=${personKgId}`,
      `-XMP-entity:ClinicFounder=${personWikidataIri}`,
      `-XMP-entity:ClinicOwner=${personWikidataIri}`,
      `-XMP-entity:ClinicOperator=${personWikidataIri}`,
      `-XMP-entity:PersonWorkLocation=${clinicWikidataIri}`,
      '-XMP-entity:Latitude=34.3401243','-XMP-entity:Longitude=47.0851778',
      `-XMP-entity:PostalCode=${postalCode}`,'-XMP-entity:StreetAddress=کرمانشاه، میدان ۱۷ شهریور، ساختمان ویستا',
      `-XMP-entity:ImageRole=${profile.role}`,'-XMP-entity:TruthAuthority=owner-confirmed first-party release',
      '-XMP-entity:MetadataProfileVersion=3.1.0',staged
    ];
    let verification=inspectMetadata(staged);
    let row=verification.status===0?JSON.parse(verification.stdout)[0]:{};
    if(!metadataMatches(row,profile,subjects)){
      const clear=runExiftool(['-overwrite_original','-P','-XMP-dc:Subject=',staged],{encoding:'utf8',maxBuffer:4*1024*1024});
      if(clear.status!==0)throw new Error(`ExifTool array reset failed for ${file}: ${clear.stderr||clear.stdout}`);
      const write=runExiftool(args,{encoding:'utf8',maxBuffer:4*1024*1024});
      if(write.status!==0||!/^[ \t]*1 image files (?:updated|unchanged)/m.test(write.stdout)){
        throw new Error(`ExifTool write failed for ${file}:\nSTDOUT:\n${write.stdout}\nSTDERR:\n${write.stderr}`);
      }
      verification=inspectMetadata(staged);
      row=verification.status===0?JSON.parse(verification.stdout)[0]:{};
    }
    if(verification.status!==0)throw new Error(`ExifTool verification failed for ${file}`);
    if(!metadataMatches(row,profile,subjects))throw new Error(`Embedded metadata contract mismatch after write: ${file}`);
    if(scalar(row,'ImageWidth')!==sourceDimensions.ImageWidth||scalar(row,'ImageHeight')!==sourceDimensions.ImageHeight)throw new Error(`Image dimensions changed: ${file}`);
    const stagedBytes=await readFile(staged);
    const nextHash=sha(stagedBytes).slice(0,12);
    const nextBasename=basename.replace(hashPattern,`.${nextHash}${path.extname(basename)}`);
    generated.push({source:file,staged,nextPath:path.join(path.dirname(file),nextBasename),oldBasename:basename,newBasename:nextBasename});
  }

  const canonicalPaths=new Set(generated.map(item=>item.nextPath));
  if(canonicalPaths.size!==49)throw new Error('Metadata output paths are not unique');
  for(const item of generated)await copyFile(item.staged,item.nextPath);

  const mappings=generated.filter(item=>item.oldBasename!==item.newBasename);
  const textual=(await walk(root,{skip:['node_modules','dist','release','.astro']}))
    .filter(file=>textPattern.test(file)&&!file.startsWith(mediaRoot+path.sep));
  for(const file of textual){
    const original=await readFile(file,'utf8');
    let next=original;
    for(const item of mappings)next=next.replaceAll(item.oldBasename,item.newBasename);
    for(const item of generated){
      const extension=path.extname(item.newBasename);
      const logicalBasename=item.newBasename.replace(hashPattern,extension);
      const stem=logicalBasename.slice(0,-extension.length);
      next=next.replace(new RegExp(`${escapeRegExp(stem)}\\.[0-9a-f]{12}${escapeRegExp(extension)}`,'g'),item.newBasename);
    }
    if(next!==original){await writeFile(file,next);changedFiles++;}
  }

  for(let pass=0;pass<3;pass++){
    const current=(await walk(mediaRoot)).filter(file=>imagePattern.test(file));
    const extras=current.filter(file=>!canonicalPaths.has(file));
    if(!extras.length)break;
    for(const file of extras)await unlink(file);
  }
  const finalImages=(await walk(mediaRoot)).filter(file=>imagePattern.test(file)).sort();
  if(finalImages.length!==49)throw new Error(`Post-enrichment image count drift: ${finalImages.length}`);
  for(const file of finalImages){
    if(!canonicalPaths.has(file))throw new Error(`Unexpected post-enrichment image: ${file}`);
    const bytes=await readFile(file),fingerprint=path.basename(file).match(hashPattern)?.[1];
    if(!fingerprint||sha(bytes).slice(0,12)!==fingerprint)throw new Error(`Post-enrichment fingerprint mismatch: ${file}`);
  }
  console.log(JSON.stringify({images:49,renamed:mappings.length,textFilesUpdated:changedFiles,metadataProfile:'XMP/IPTC Core/PLUS 3.1.0',dimensionsPreserved:true,stagedBeforeCommit:true},null,2));
}finally{
  await rm(stagingRoot,{recursive:true,force:true});
}
