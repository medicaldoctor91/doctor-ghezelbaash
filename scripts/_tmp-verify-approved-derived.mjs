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
const norm=value=>String(value).replace(/\s+/gu,' ').trim();
const list=value=>String(value||'').split(' | ').map(x=>x.trim()).filter(Boolean);
const unique=value=>[...new Set(value)].sort();
const sameSet=(a,b)=>JSON.stringify(unique(a))===JSON.stringify(unique(b));

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

function parsePassages(raw){
  const rows=[];
  for(const match of raw.matchAll(/\[PASSAGE\]\n([\s\S]*?)\n\[\/PASSAGE\]/g)){
    const block=match[1],marker='TEXT:\n',cut=block.indexOf(marker);
    if(cut<0)throw new Error('Malformed llms-full passage');
    const header=block.slice(0,cut).split('\n').filter(Boolean),text=block.slice(cut+marker.length),fields={};
    for(const line of header){const i=line.indexOf(': ');if(i>0)fields[line.slice(0,i)]=line.slice(i+2);}
    if(!fields.ANCHOR||!fields.PART||!fields.PASSAGE_ID||!fields.SOURCE_HASH_SHA256)throw new Error('Incomplete llms-full passage metadata');
    rows.push({fields,text});
  }
  return rows;
}
const partNo=row=>Number(String(row.fields.PART).split('/')[0]);
const sectionKey=row=>[row.fields.LEVEL,row.fields.TITLE,row.fields.ANCHOR,row.fields.GRAPH_NODE_ID,row.fields.LANGUAGE,row.fields.RETRIEVAL_ALIASES||''].join('\u001f');
const group=rows=>{const map=new Map();for(const row of rows){const key=sectionKey(row);if(!map.has(key))map.set(key,[]);map.get(key).push(row)}for(const rows of map.values())rows.sort((a,b)=>partNo(a)-partNo(b));return map};
const oldRows=parsePassages(await read(beforeDir,'llms-full.txt')),newRows=parsePassages(await read(afterDir,'llms-full.txt'));
if(oldRows.length!==newRows.length)throw new Error(`Passage count changed ${oldRows.length} -> ${newRows.length}`);
const oldGroups=group(oldRows),newGroups=group(newRows);
if(oldGroups.size!==newGroups.size)throw new Error(`Section count changed ${oldGroups.size} -> ${newGroups.size}`);
const aggregateFields=['ENTITY_IDS','EVIDENCE_IDS','CLAIM_EVIDENCE_IDS','ENTITY_EVIDENCE_IDS','TIER_A_EVIDENCE_IDS'];
const changedSections=[],aggregateDrifts=[];
for(const [key,oldGroup] of oldGroups){
  const nextGroup=newGroups.get(key);if(!nextGroup)throw new Error(`Passage section disappeared: ${key}`);
  if(oldGroup.length!==nextGroup.length)throw new Error(`Passage partition count changed for ${key}: ${oldGroup.length} -> ${nextGroup.length}`);
  const oldText=oldGroup.map(row=>row.text).join(' '),nextText=nextGroup.map(row=>row.text).join(' '),expected=approvedText(oldText);
  if(norm(expected)!==norm(nextText))throw new Error(`Passage section text changed outside approved corrections: ${key}`);
  for(const field of aggregateFields){
    const oldUnion=unique(oldGroup.flatMap(row=>list(row.fields[field]))),nextUnion=unique(nextGroup.flatMap(row=>list(row.fields[field])));
    if(!sameSet(oldUnion,nextUnion))aggregateDrifts.push({key,field,oldOnly:oldUnion.filter(x=>!nextUnion.includes(x)),newOnly:nextUnion.filter(x=>!oldUnion.includes(x))});
  }
  for(let i=0;i<nextGroup.length;i++){
    const row=nextGroup[i],expectedPart=`${i+1}/${nextGroup.length}`;
    if(row.fields.PART!==expectedPart)throw new Error(`Passage PART sequence drift ${key}: ${row.fields.PART} != ${expectedPart}`);
    const expectedId=sha(`${row.fields.ANCHOR}|${i}|${row.text}`).slice(0,16),expectedSource=sha(row.text);
    if(row.fields.PASSAGE_ID!==expectedId||row.fields.SOURCE_HASH_SHA256!==expectedSource)throw new Error(`Passage hash lineage drift ${key} part ${i+1}`);
  }
  if(norm(oldText)!==norm(nextText))changedSections.push(key);
}
if(aggregateDrifts.length)throw new Error(`Passage aggregate evidence/entity drift:\n${JSON.stringify(aggregateDrifts,null,2)}`);
if(!changedSections.length)throw new Error('No passage section reflected the approved corrections');

const oldProv=JSON.parse(await read(beforeDir,'provenance.jsonld')),newProv=JSON.parse(await read(afterDir,'provenance.jsonld'));
const oldNodes=oldProv['@graph']||[],newNodes=newProv['@graph']||[];
const isPassage=node=>String(node?.['@id']||'').includes('provenance.jsonld#passage-');
const oldStable=oldNodes.filter(node=>!isPassage(node)),newStable=newNodes.filter(node=>!isPassage(node));
if(JSON.stringify(oldStable)!==JSON.stringify(newStable))throw new Error('Non-passage provenance changed during visible-only correction');
const newPassageNodes=new Map(newNodes.filter(isPassage).map(node=>[node['@id'],node]));
if(newPassageNodes.size!==newRows.length)throw new Error('New passage/provenance cardinality drift');
const refs=values=>list(values).map(id=>({'@id':id}));
for(const row of newRows){
  const id=`${release.canonicalUrl}provenance.jsonld#passage-${row.fields.PASSAGE_ID}`,node=newPassageNodes.get(id);
  if(!node)throw new Error(`Missing new passage provenance ${id}`);
  const expected={
    '@id':id,
    '@type':['CreativeWork','prov:Entity'],
    name:`Passage provenance — ${row.fields.TITLE}`,
    url:row.fields.ANCHOR,
    inLanguage:row.fields.LANGUAGE,
    about:refs(row.fields.ENTITY_IDS),
    isPartOf:{'@id':`${release.canonicalUrl}provenance.jsonld#dataset`},
    identifier:{'@type':'PropertyValue',propertyID:'SHA-256',value:row.fields.SOURCE_HASH_SHA256},
    ...(row.fields.GRAPH_NODE_ID?{isBasedOn:{'@id':row.fields.GRAPH_NODE_ID}}:{}),
    'prov:wasDerivedFrom':[{'@id':row.fields.ANCHOR}],
    ...(list(row.fields.CLAIM_EVIDENCE_IDS).length?{'prov:hadPrimarySource':refs(row.fields.CLAIM_EVIDENCE_IDS)}:{}),
    additionalProperty:[{'@type':'PropertyValue',propertyID:'Entity evidence IDs',value:row.fields.ENTITY_EVIDENCE_IDS||''}],
    dateModified:release.dateModified
  };
  if(JSON.stringify(expected)!==JSON.stringify(node))throw new Error(`Passage provenance is not an exact projection of llms-full metadata: ${id}`);
}

console.log(JSON.stringify({approvedDerivedClosure:'PASS',indexMarkdownExact:true,passageCount:newRows.length,sectionCount:newGroups.size,rechunkedOrChangedSections:changedSections.length,stableProvenanceNodes:newStable.length,descriptorChangesAreHashClosure:['dcat.ttl','datapackage.json','croissant.json']},null,2));
