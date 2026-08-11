import { readFile, writeFile } from 'node:fs/promises';

const DATE='2026-08-11';
const PREV_RELEASE='1.1.0';
const PREV_DOI='10.5281/zenodo.21886743';
const PREV_RECORD='21886743';
const HIST_DOI='10.5281/zenodo.18765169';
const DATASET_ID='https://www.ghezelbaash.ir/graph.jsonld#dataset';
const PERSON_ID='https://www.ghezelbaash.ir/#saeed-ghezelbash';
const CLINIC_ID='https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const PROJECT_ID='https://www.ghezelbaash.ir/#doctor-ghezelbaash-structured-data-project';
const WIKIDATA_DATASET='https://www.wikidata.org/entity/Q140304972';
const fail=m=>{throw new Error(m)};
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const writeJson=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
const scalar=x=>typeof x==='string'?x:(x?.['@id']||x?.value||'');
const replaceDeep=(value,from,to)=>{
  if(typeof value==='string') return value.replaceAll(from,to);
  if(Array.isArray(value)) return value.map(x=>replaceDeep(x,from,to));
  if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replaceDeep(v,from,to)]));
  return value;
};

const release=await readJson('src/data/release.json');
const RELEASE=release.release;
const z=release?.dataset?.zenodo;
if(RELEASE!=='1.1.1') fail(`Expected DOI-gated final release 1.1.1, got ${RELEASE}`);
if(release.dateModified!==DATE) fail('Final release date lock mismatch');
if(z?.conceptDoi!=='10.5281/zenodo.18765168'||!String(z?.versionDoi||'').startsWith('10.5281/zenodo.')||!String(z?.recordId||'').match(/^\d+$/)||z?.state!=='doi-locked-draft') fail('Final Zenodo DOI lock incomplete');
if(z.versionDoi===PREV_DOI||String(z.recordId)===PREV_RECORD) fail('Final DOI/record did not advance');
if(z?.previousVersion?.release!==PREV_RELEASE||z?.previousVersion?.versionDoi!==PREV_DOI||String(z?.previousVersion?.recordId)!==PREV_RECORD) fail('Previous v1.1.0 provenance missing');
const FINAL_DOI=z.versionDoi, FINAL_RECORD=String(z.recordId);
const FINAL_RECORD_URL=`https://zenodo.org/records/${FINAL_RECORD}`;
const FINAL_DOI_URL=`https://doi.org/${FINAL_DOI}`;

// Package/release invariant convergence.
const inv=await readJson('src/data/release-invariants.json');
inv.release=RELEASE; inv.date=DATE;
await writeJson('src/data/release-invariants.json',inv);
const pkg=await readJson('package.json'); pkg.version=RELEASE; await writeJson('package.json',pkg);
const lock=await readJson('package-lock.json'); lock.version=RELEASE; if(lock.packages?.['']) lock.packages[''].version=RELEASE; await writeJson('package-lock.json',lock);

// Current release evidence surfaces: advance only release identity + exact archive identifier.
for(const p of ['src/data/volatile-facts.json','src/data/evidence-registry.json','src/data/evidence-snapshot.json']){
  let x=await readJson(p);
  if(Object.hasOwn(x,'release')) x.release=RELEASE;
  if(Object.hasOwn(x,'dateModified')) x.dateModified=DATE;
  x=replaceDeep(x,PREV_DOI,FINAL_DOI);
  x=replaceDeep(x,`https://doi.org/${PREV_DOI}`,FINAL_DOI_URL);
  x=replaceDeep(x,`https://zenodo.org/records/${PREV_RECORD}`,FINAL_RECORD_URL);
  await writeJson(p,x);
}

// Canonical graph structure is preserved; only current release stamps/DOI distribution identity advance.
let graph=await readJson('src/data/semantic/knowledge-graph.jsonld');
graph=replaceDeep(graph,PREV_DOI,FINAL_DOI);
graph=replaceDeep(graph,`https://doi.org/${PREV_DOI}`,FINAL_DOI_URL);
graph=replaceDeep(graph,`https://zenodo.org/records/${PREV_RECORD}`,FINAL_RECORD_URL);
const nodes=graph['@graph']; if(!Array.isArray(nodes)) fail('Canonical @graph missing');
const byId=new Map(nodes.filter(n=>n?.['@id']).map(n=>[n['@id'],n]));
const dataset=byId.get(DATASET_ID),person=byId.get(PERSON_ID),clinic=byId.get(CLINIC_ID),project=byId.get(PROJECT_ID);
if(!dataset||!person||!clinic||!project) fail('Canonical identity nodes missing');
for(const node of nodes) if(Object.hasOwn(node,'version')) node.version=RELEASE;
dataset.version=RELEASE; dataset.dateModified=DATE; project.version=RELEASE; project.dateModified=DATE;
if(scalar(dataset.creator)!==PERSON_ID||scalar(dataset.publisher)!==PERSON_ID) fail('Physician-first Dataset creator/publisher drift');
if(!arr(dataset.sameAs).map(scalar).includes(WIKIDATA_DATASET)) fail('Dataset/Q140304972 exact reconciliation missing');
const graphText=JSON.stringify(graph);
if(!graphText.includes(z.conceptDoi)||!graphText.includes(FINAL_DOI)) fail('Final graph lacks Concept/Version DOI');
if(graphText.includes(PREV_DOI)||graphText.includes(HIST_DOI)) fail('Previous/historical Version DOI leaked into current canonical graph');
await writeJson('src/data/semantic/knowledge-graph.jsonld',graph);

// Current public structured-data section: keep final release current, not legacy version prose.
const contentPath='src/content-source/100-rc099.html';
let content=await readFile(contentPath,'utf8');
if(!content.includes(PREV_RELEASE)||!content.includes(PREV_DOI)) fail('Expected v1.1.0 current-release prose missing before final convergence');
content=content.replaceAll(PREV_DOI,FINAL_DOI).replaceAll(`https://doi.org/${PREV_DOI}`,FINAL_DOI_URL).replaceAll(PREV_RELEASE,RELEASE);
content=content.replaceAll('published on 25 February 2026','published on 11 August 2026');
content=content.replaceAll('Version 1.1.1, 25 February 2026','Version 1.1.1, 11 August 2026');
// Do not advertise a GitHub tag that is not guaranteed to exist; canonical source repository is the authority.
content=content.replaceAll('https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/v1.1.1','https://github.com/medicaldoctor91/doctor-ghezelbaash');
if(content.includes(PREV_DOI)) fail('Previous Version DOI remains in current structured-data content');
if(!content.includes(FINAL_DOI)||!content.includes('Version 1.1.1')) fail('Final structured-data current release identity missing');
await writeFile(contentPath,content);

// Release-aware SVG metadata advances without altering binary/raster media.
for(const p of ['public/favicon.svg','public/safari-pinned-tab.svg','public/media/brand/doctor-ghezelbaash-symbol.3a9e7509912d.svg']){
  let t=await readFile(p,'utf8');
  t=t.replaceAll(`<entity:Version>${PREV_RELEASE}</entity:Version>`,`<entity:Version>${RELEASE}</entity:Version>`);
  if(!t.includes(`<entity:Version>${RELEASE}</entity:Version>`)) fail(`Final release SVG stamp missing: ${p}`);
  await writeFile(p,t);
}

// Replace the one legacy hard-coded version assertion with a contract-driven equality gate.
const sourceValidatorPath='scripts/validate-source.mjs';
let sv=await readFile(sourceValidatorPath,'utf8');
sv=sv.replace('// Public release/entity truth: Version 1.1.0 must be coherent across canonical source surfaces.','// Public release/entity truth must be coherent across canonical source surfaces.');
sv=sv.replace("if(inv.release!=='1.1.0'||release.release!=='1.1.0') fail('Public release identity must be Version 1.1.0');","if(inv.release!==release.release) fail(`Public release identity mismatch ${inv.release}/${release.release}`);");
if(sv.includes("inv.release!=='1.1.0'")||sv.includes('Public release identity must be Version 1.1.0')) fail('Hard-coded v1.1.0 validator residue remains');
if(!sv.includes('if(inv.release!==release.release)')) fail('Contract-driven source release gate missing');
await writeFile(sourceValidatorPath,sv);

console.log(JSON.stringify({stage:'FINAL_CONVERGENCE_SOURCE_FINALIZED',release:RELEASE,conceptDoi:z.conceptDoi,versionDoi:FINAL_DOI,recordId:FINAL_RECORD,semanticStructure:'PRESERVED',uiConvergence:'PRESERVED',coreFrozen:false,integrity:'SOURCE_TRANSFORM_PASS'},null,2));
