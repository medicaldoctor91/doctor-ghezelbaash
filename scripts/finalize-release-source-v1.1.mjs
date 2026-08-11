import { readFile, writeFile } from 'node:fs/promises';

const RELEASE='1.1.0';
const DATE='2026-08-11';
const CANONICAL='https://www.ghezelbaash.ir/';
const DATASET_ID='https://www.ghezelbaash.ir/graph.jsonld#dataset';
const PERSON_ID='https://www.ghezelbaash.ir/#saeed-ghezelbash';
const CLINIC_ID='https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const PROJECT_ID='https://www.ghezelbaash.ir/#doctor-ghezelbaash-structured-data-project';
const DATASET_Q='Q140304972';
const PERSON_Q='Q140287622';
const CLINIC_Q='Q140288589';
const CONCEPT_DOI='10.5281/zenodo.18765168';
const VERSION_DOI='10.5281/zenodo.21886743';
const RECORD_ID='21886743';
const HISTORICAL_DOI='10.5281/zenodo.18765169';
const DOI_BASE='https://doi.org/';
const ZENODO_RECORD=`https://zenodo.org/records/${RECORD_ID}`;
const HF='https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data';
const GITHUB='https://github.com/medicaldoctor91/doctor-ghezelbaash';
const WIKIDATA_DATASET=`https://www.wikidata.org/entity/${DATASET_Q}`;

const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const writeJson=(p,x)=>writeFile(p,JSON.stringify(x,null,2)+'\n');
const fail=m=>{throw new Error(m)};
const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
const ref=id=>({'@id':id});
const scalar=x=>typeof x==='string'?x:(x?.['@id']||x?.value||'');

function assertLocked(release){
  const z=release?.dataset?.zenodo;
  if(release.release!==RELEASE) fail(`release.json must already be DOI-gated at ${RELEASE}`);
  if(release.dateModified!==DATE) fail(`release.json dateModified must be ${DATE}`);
  if(release.dataset?.id!==DATASET_ID||release.dataset?.wikidata!==DATASET_Q) fail('Dataset identity is not DOI-gate canonical');
  if(release.dataset?.creatorWikidata!==PERSON_Q||release.dataset?.supportingClinicWikidata!==CLINIC_Q) fail('Entity hierarchy drift before source finalization');
  if(z?.conceptDoi!==CONCEPT_DOI||z?.versionDoi!==VERSION_DOI||String(z?.recordId)!==RECORD_ID||z?.state!=='doi-locked-draft') fail('Locked Zenodo DOI contract mismatch');
  if(z?.historicalVersion?.versionDoi!==HISTORICAL_DOI||String(z?.historicalVersion?.recordId)!=='18765169') fail('Historical Zenodo provenance mismatch');
}

function uniqueStrings(values){return [...new Set(values.filter(x=>typeof x==='string'&&x))]}
function ensureRefList(value,ids){
  const existing=arr(value).filter(Boolean);
  const seen=new Set(existing.map(scalar));
  for(const id of ids) if(!seen.has(id)) existing.push(ref(id));
  return existing;
}
function ensureStringList(value,values){return uniqueStrings([...arr(value).map(scalar),...values])}
function replaceAllString(value,from,to){
  if(typeof value==='string') return value.replaceAll(from,to);
  if(Array.isArray(value)) return value.map(x=>replaceAllString(x,from,to));
  if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replaceAllString(v,from,to)]));
  return value;
}
function dedupeIdentifiers(values){
  const out=[],seen=new Set();
  for(const x of arr(values)){
    const key=typeof x==='string'?`s:${x}`:JSON.stringify([x?.propertyID,x?.value,x?.url,x?.['@id']]);
    if(!seen.has(key)){seen.add(key);out.push(x)}
  }
  return out;
}

const release=await readJson('src/data/release.json');
assertLocked(release);

// Release invariants are the public version/date lock consumed by the existing validator.
const inv=await readJson('src/data/release-invariants.json');
inv.release=RELEASE;
inv.date=DATE;
await writeJson('src/data/release-invariants.json',inv);

// Package metadata must agree with the release lock.
const pkg=await readJson('package.json');
pkg.version=RELEASE;
pkg.scripts={
  ...pkg.scripts,
  'validate:release-contract':'node scripts/validate-release-contract.mjs'
};
if(typeof pkg.scripts['release:prepare']!=='string') fail('package.json release:prepare script missing');
if(!pkg.scripts['release:prepare'].includes('validate:release-contract')) pkg.scripts['release:prepare']=`npm run validate:release-contract && ${pkg.scripts['release:prepare']}`;
if(typeof pkg.scripts.check!=='string') fail('package.json check script missing');
if(!pkg.scripts.check.includes('validate:release-contract')) pkg.scripts.check=`npm run validate:release-contract && ${pkg.scripts.check}`;
await writeJson('package.json',pkg);

const lock=await readJson('package-lock.json');
lock.version=RELEASE;
if(lock.packages?.['']) lock.packages[''].version=RELEASE;
await writeJson('package-lock.json',lock);

// All first-party release snapshots move together; unrelated evidence timestamps are preserved.
for(const p of ['src/data/volatile-facts.json','src/data/evidence-registry.json','src/data/evidence-snapshot.json']){
  let x=await readJson(p);
  if(Object.hasOwn(x,'release')) x.release=RELEASE;
  if(Object.hasOwn(x,'dateModified')) x.dateModified=DATE;
  // In v1.0 these files treated the old Version DOI as current. In v1.1 the current exact archive is the locked Version DOI.
  x=replaceAllString(x,`${DOI_BASE}${HISTORICAL_DOI}`,`${DOI_BASE}${VERSION_DOI}`);
  x=replaceAllString(x,HISTORICAL_DOI,VERSION_DOI);
  await writeJson(p,x);
}

// Canonical graph: update current-release identity without creating a second Dataset.
let graph=await readJson('src/data/semantic/knowledge-graph.jsonld');
graph=replaceAllString(graph,`${DOI_BASE}${HISTORICAL_DOI}`,`${DOI_BASE}${VERSION_DOI}`);
graph=replaceAllString(graph,HISTORICAL_DOI,VERSION_DOI);
const nodes=graph['@graph'];
if(!Array.isArray(nodes)) fail('Canonical graph has no @graph array');
const byId=new Map(nodes.filter(n=>n?.['@id']).map(n=>[n['@id'],n]));
const dataset=byId.get(DATASET_ID),person=byId.get(PERSON_ID),clinic=byId.get(CLINIC_ID),webpage=byId.get(`${CANONICAL}#webpage`),website=byId.get(`${CANONICAL}#website`);
if(!dataset||!person||!clinic||!webpage||!website) fail('Expected canonical Dataset/Person/Clinic/WebPage/WebSite node missing');

dataset.name='Dr. Saeed Ghezelbash Public Knowledge Graph';
dataset.version=RELEASE;
dataset.dateModified=DATE;
dataset.creator=ref(PERSON_ID);
dataset.publisher=ref(PERSON_ID);
dataset.about=ensureRefList(dataset.about,[PERSON_ID,CLINIC_ID]);
dataset.license='https://creativecommons.org/licenses/by/4.0/';
dataset.sameAs=ensureStringList(dataset.sameAs,[WIKIDATA_DATASET]);
dataset.isBasedOn=ensureStringList(dataset.isBasedOn,[GITHUB]);
dataset.subjectOf=ensureStringList(dataset.subjectOf,[ZENODO_RECORD,HF]);
dataset.identifier=dedupeIdentifiers([
  ...arr(dataset.identifier),
  {'@type':'PropertyValue',propertyID:'Wikidata',value:DATASET_Q,url:`https://www.wikidata.org/wiki/${DATASET_Q}`},
  {'@type':'PropertyValue',propertyID:'DOI',name:'Zenodo Concept DOI',value:CONCEPT_DOI,url:`${DOI_BASE}${CONCEPT_DOI}`},
  {'@type':'PropertyValue',propertyID:'DOI',name:`Zenodo Version DOI ${RELEASE}`,value:VERSION_DOI,url:`${DOI_BASE}${VERSION_DOI}`}
]);
webpage.dateModified=DATE;
website.dateModified=DATE;

// Q140304972 has one canonical first-party identity: graph.jsonld#dataset. Do not let the legacy supporting project node compete for sameAs.
const project=byId.get(PROJECT_ID);
if(project?.sameAs){
  const cleaned=arr(project.sameAs).filter(x=>scalar(x)!==WIKIDATA_DATASET&&scalar(x)!==`https://www.wikidata.org/wiki/${DATASET_Q}`);
  if(cleaned.length) project.sameAs=cleaned; else delete project.sameAs;
}
await writeJson('src/data/semantic/knowledge-graph.jsonld',graph);

// Visible data-catalog source: promote v1.1/current Version DOI; old v1.0 DOI stays only in release.json historical provenance.
const contentPath='src/content-source/100-rc099.html';
let content=await readFile(contentPath,'utf8');
const oldVersionCount=(content.match(/\b1\.0\.0\b/g)||[]).length;
const oldDoiCount=(content.match(/10\.5281\/zenodo\.18765169/g)||[]).length;
if(oldVersionCount<1) fail('Expected current v1.0.0 assertion not found in structured-data content source');
if(oldDoiCount<1) fail('Expected historical DOI-as-current not found in structured-data content source');
content=content.replaceAll('1.0.0',RELEASE);
content=content.replaceAll(HISTORICAL_DOI,VERSION_DOI);
content=content.replaceAll('https://doi.org/10.5281/zenodo.18765169',`${DOI_BASE}${VERSION_DOI}`);
content=content.replaceAll('no later release version is asserted',`the current source release is ${RELEASE}; the exact archived release uses Version DOI ${VERSION_DOI}`);
await writeFile(contentPath,content);

// llms.txt template receives DOIs exclusively from release.json, never hard-coded current release identifiers.
const llmsPath='src/data/templates/llms.template.txt';
let llms=await readFile(llmsPath,'utf8');
if(!llms.includes(`https://doi.org/${HISTORICAL_DOI}`)) fail('Expected historical hard-coded Project DOI missing from llms template');
llms=llms.replaceAll(`https://doi.org/${HISTORICAL_DOI}`,'{{ZENODO_VERSION_DOI_URL}}');
const projectDoiLine='- [Project DOI]({{ZENODO_VERSION_DOI_URL}}): Version {{RELEASE}} archival project record.';
if(!llms.includes(projectDoiLine)) fail('Expected Project DOI template line not found after placeholder migration');
llms=llms.replace(projectDoiLine,`${projectDoiLine}\n- [Dataset lineage DOI]({{ZENODO_CONCEPT_DOI_URL}}): Zenodo Concept DOI for the continuing Dataset version lineage.\n- Zenodo record ID for Version {{RELEASE}}: \`{{ZENODO_RECORD_ID}}\``);
await writeFile(llmsPath,llms);

// Projection generator resolves all mutable release/distribution identifiers from release.json.
const genPath='scripts/generate-projections.mjs';
let gen=await readFile(genPath,'utf8');
const needle="  .replaceAll('{{RETRIEVAL_VARIANTS}}',release.primaryEntity.retrievalVariants.join(' | '));";
if(!gen.includes(needle)) fail('generate-projections llms replacement chain shape changed');
const replacement=`  .replaceAll('{{RETRIEVAL_VARIANTS}}',release.primaryEntity.retrievalVariants.join(' | '))\n  .replaceAll('{{ZENODO_CONCEPT_DOI}}',release.dataset.zenodo.conceptDoi)\n  .replaceAll('{{ZENODO_CONCEPT_DOI_URL}}',\`https://doi.org/\${release.dataset.zenodo.conceptDoi}\`)\n  .replaceAll('{{ZENODO_VERSION_DOI}}',release.dataset.zenodo.versionDoi)\n  .replaceAll('{{ZENODO_VERSION_DOI_URL}}',\`https://doi.org/\${release.dataset.zenodo.versionDoi}\`)\n  .replaceAll('{{ZENODO_RECORD_ID}}',String(release.dataset.zenodo.recordId))\n  .replaceAll('{{DATASET_WIKIDATA}}',release.dataset.wikidata)\n  .replaceAll('{{HUGGING_FACE_DATASET}}',release.dataset.huggingFace.dataset);`;
gen=gen.replace(needle,replacement);
await writeFile(genPath,gen);

// Existing source validator had an obsolete hard-coded public v1.0 assertion. Keep the gate, move it to v1.1.
const validatorPath='scripts/validate-source.mjs';
let validator=await readFile(validatorPath,'utf8');
const oldComment='// Public release/entity truth: Version 1.0.0 must be coherent across canonical source surfaces.';
const oldGate="if(inv.release!=='1.0.0'||release.release!=='1.0.0') fail('Public release identity must be Version 1.0.0');";
if(!validator.includes(oldComment)||!validator.includes(oldGate)) fail('Expected v1.0 public release gate not found in validate-source.mjs');
validator=validator.replace(oldComment,'// Public release/entity truth: Version 1.1.0 must be coherent across canonical source surfaces.');
validator=validator.replace(oldGate,"if(inv.release!=='1.1.0'||release.release!=='1.1.0') fail('Public release identity must be Version 1.1.0');");
await writeFile(validatorPath,validator);

console.log(JSON.stringify({stage:'FINALIZE_SEMANTIC_SOURCE',release:RELEASE,conceptDoi:CONCEPT_DOI,versionDoi:VERSION_DOI,recordId:RECORD_ID,coreFrozen:false,integrity:'SOURCE_MIGRATED'},null,2));
