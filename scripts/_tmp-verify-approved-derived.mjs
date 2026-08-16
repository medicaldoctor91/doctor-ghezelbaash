import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const [beforeDir,afterDir]=process.argv.slice(2);
if(!beforeDir||!afterDir)throw new Error('Usage: verify-approved-derived <beforeDir> <afterDir>');
const read=(dir,file)=>readFile(path.join(dir,file),'utf8');
const release=JSON.parse(await readFile('src/data/release.json','utf8'));
const history=release.dataset.zenodo.releaseHistory||[];
const currentIndex=history.findIndex(row=>row.release===release.release);
const previous=currentIndex>0?history[currentIndex-1]:null;
if(!previous)throw new Error('Previous release metadata unavailable for approved correction verification');
const sha=value=>createHash('sha256').update(value).digest('hex');

function approvedText(oldText){
  let text=oldText.replaceAll('آخرین دریافت از Google:','آخرین تغییر ثبت‌شده در Google:');
  const startToken='The project publishes canonical entity identifiers';
  const hfUrl='https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data';
  const start=text.indexOf(startToken);
  if(start>=0){
    const end=text.indexOf(hfUrl,start);
    if(end<0)throw new Error('Approved release correction boundary missing');
    let segment=text.slice(start,end);
    segment=segment.replaceAll(`Version ${previous.release}`,`Version ${release.release}`)
      .replaceAll(`version ${previous.release}`,`version ${release.release}`)
      .replaceAll(`https://doi.org/${previous.versionDoi}`,`https://doi.org/${release.dataset.zenodo.versionDoi}`)
      .replaceAll(previous.versionDoi,release.dataset.zenodo.versionDoi)
      .replaceAll(encodeURIComponent(previous.versionDoi),encodeURIComponent(release.dataset.zenodo.versionDoi));
    text=text.slice(0,start)+segment+text.slice(end);
  }
  return text;
}

const beforeIndex=await read(beforeDir,'index.md'),afterIndex=await read(afterDir,'index.md');
if(approvedText(beforeIndex)!==afterIndex)throw new Error('index.md changed outside the two approved visible corrections');

function passages(raw){
  const map=new Map();
  for(const match of raw.matchAll(/\[PASSAGE\]\n([\s\S]*?)\n\[\/PASSAGE\]/g)){
    const block=match[1],marker='TEXT:\n',cut=block.indexOf(marker);
    if(cut<0)throw new Error('Malformed llms-full passage');
    const header=block.slice(0,cut).split('\n').filter(Boolean),text=block.slice(cut+marker.length),fields={};
    for(const line of header){const i=line.indexOf(': ');if(i>0)fields[line.slice(0,i)]=line.slice(i+2);}
    const key=`${fields.ANCHOR}|${fields.PART}`;
    if(map.has(key))throw new Error(`Duplicate passage key ${key}`);
    map.set(key,{fields,text});
  }
  return map;
}
const oldPassages=passages(await read(beforeDir,'llms-full.txt')),newPassages=passages(await read(afterDir,'llms-full.txt'));
if(oldPassages.size!==newPassages.size)throw new Error(`Passage count changed ${oldPassages.size} -> ${newPassages.size}`);
const changed=[];
for(const [key,oldP] of oldPassages){
  const next=newPassages.get(key);if(!next)throw new Error(`Passage key disappeared ${key}`);
  const expectedText=approvedText(oldP.text);
  if(next.text!==expectedText)throw new Error(`Passage text changed outside approved corrections: ${key}`);
  for(const field of Object.keys(oldP.fields)){
    if(['PASSAGE_ID','SOURCE_HASH_SHA256'].includes(field))continue;
    if(next.fields[field]!==oldP.fields[field])throw new Error(`Passage metadata drift ${key} ${field}`);
  }
  const partIndex=Number(String(next.fields.PART).split('/')[0])-1;
  const expectedId=sha(`${next.fields.ANCHOR}|${partIndex}|${next.text}`).slice(0,16);
  const expectedSource=sha(next.text);
  if(next.fields.PASSAGE_ID!==expectedId||next.fields.SOURCE_HASH_SHA256!==expectedSource)throw new Error(`Passage hash lineage drift ${key}`);
  if(oldP.text!==next.text)changed.push({key,oldId:oldP.fields.PASSAGE_ID,newId:next.fields.PASSAGE_ID,oldSource:oldP.fields.SOURCE_HASH_SHA256,newSource:next.fields.SOURCE_HASH_SHA256});
}

const oldProv=JSON.parse(await read(beforeDir,'provenance.jsonld')),newProv=JSON.parse(await read(afterDir,'provenance.jsonld'));
const oldNodes=oldProv['@graph']||[],newNodes=newProv['@graph']||[];
const isPassage=node=>String(node?.['@id']||'').includes('provenance.jsonld#passage-');
const oldStable=oldNodes.filter(node=>!isPassage(node)),newStable=newNodes.filter(node=>!isPassage(node));
if(JSON.stringify(oldStable)!==JSON.stringify(newStable))throw new Error('Non-passage provenance changed during visible-only correction');
const oldProvById=new Map(oldNodes.filter(isPassage).map(node=>[node['@id'],node])),newProvById=new Map(newNodes.filter(isPassage).map(node=>[node['@id'],node]));
if(oldProvById.size!==oldPassages.size||newProvById.size!==newPassages.size)throw new Error('Passage/provenance cardinality drift');
for(const [key,oldP] of oldPassages){
  const next=newPassages.get(key),oldNode=oldProvById.get(`${release.canonicalUrl}provenance.jsonld#passage-${oldP.fields.PASSAGE_ID}`),newNode=newProvById.get(`${release.canonicalUrl}provenance.jsonld#passage-${next.fields.PASSAGE_ID}`);
  if(!oldNode||!newNode)throw new Error(`Missing passage provenance lineage ${key}`);
  const expected=structuredClone(oldNode);expected['@id']=newNode['@id'];
  if(expected.identifier?.propertyID==='SHA-256')expected.identifier.value=next.fields.SOURCE_HASH_SHA256;
  if(JSON.stringify(expected)!==JSON.stringify(newNode))throw new Error(`Passage provenance changed outside hash identity ${key}`);
}

if(!changed.length)throw new Error('No derived passage reflected the approved corrections');
console.log(JSON.stringify({approvedDerivedClosure:'PASS',indexMarkdownExact:true,passageCount:newPassages.size,changedPassages:changed.length,stableProvenanceNodes:newStable.length,descriptorChangesAreHashClosure:['dcat.ttl','datapackage.json','croissant.json']},null,2));
