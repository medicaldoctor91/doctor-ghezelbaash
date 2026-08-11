import { readFile } from 'node:fs/promises';

const fail=m=>{throw new Error(m)};
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
const scalar=x=>typeof x==='string'?x:(x?.['@id']||x?.value||'');
const flattenStrings=x=>{
  const out=[];
  const walk=v=>{if(typeof v==='string')out.push(v);else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk)};
  walk(x);return out;
};

const EXPECT={
  release:'1.1.0',
  date:'2026-08-11',
  dataset:'https://www.ghezelbaash.ir/graph.jsonld#dataset',
  person:'https://www.ghezelbaash.ir/#saeed-ghezelbash',
  clinic:'https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah',
  qDataset:'Q140304972',qPerson:'Q140287622',qClinic:'Q140288589',
  concept:'10.5281/zenodo.18765168',
  version:'10.5281/zenodo.21886743',
  record:'21886743',
  historical:'10.5281/zenodo.18765169',
  historicalRecord:'18765169',
  hf:'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data',
  github:'https://github.com/medicaldoctor91/doctor-ghezelbaash'
};

const release=await readJson('src/data/release.json');
const inv=await readJson('src/data/release-invariants.json');
const pkg=await readJson('package.json');
const pkgLock=await readJson('package-lock.json');

if(release.release!==EXPECT.release||inv.release!==EXPECT.release||pkg.version!==EXPECT.release||pkgLock.version!==EXPECT.release||pkgLock.packages?.['']?.version!==EXPECT.release) fail('Release version convergence failure');
if(release.dateModified!==EXPECT.date||inv.date!==EXPECT.date) fail('Release date convergence failure');
if(release.dataset?.id!==EXPECT.dataset||release.dataset?.wikidata!==EXPECT.qDataset) fail('Canonical Dataset IRI/Wikidata contract failure');
if(release.dataset?.creator!==EXPECT.person||release.dataset?.publisher!==EXPECT.person||release.dataset?.creatorWikidata!==EXPECT.qPerson) fail('Physician-first creator/publisher contract failure');
if(release.dataset?.supportingClinic!==EXPECT.clinic||release.dataset?.supportingClinicWikidata!==EXPECT.qClinic) fail('Supporting clinic contract failure');
if(release.dataset?.github?.role!=='source'||release.dataset?.github?.repository!==EXPECT.github) fail('GitHub source-role contract failure');
if(release.dataset?.huggingFace?.role!=='ai-distribution'||release.dataset?.huggingFace?.dataset!==EXPECT.hf) fail('Hugging Face distribution-role contract failure');
const z=release.dataset?.zenodo;
if(z?.role!=='preservation'||z?.conceptDoi!==EXPECT.concept||z?.versionDoi!==EXPECT.version||String(z?.recordId)!==EXPECT.record||z?.state!=='doi-locked-draft') fail('Zenodo locked current-release contract failure');
if(z?.conceptDoi===z?.versionDoi||z?.versionDoi===EXPECT.historical) fail('Concept/Version/historical DOI scopes collapsed');
if(z?.historicalVersion?.release!=='1.0.0'||z?.historicalVersion?.versionDoi!==EXPECT.historical||String(z?.historicalVersion?.recordId)!==EXPECT.historicalRecord) fail('Historical v1.0.0 provenance contract failure');

const graph=await readJson('src/data/semantic/knowledge-graph.jsonld');
const nodes=graph['@graph'];
if(!Array.isArray(nodes)) fail('Canonical graph missing @graph');
const byId=new Map(nodes.filter(x=>x?.['@id']).map(x=>[x['@id'],x]));
const dataset=byId.get(EXPECT.dataset),person=byId.get(EXPECT.person),clinic=byId.get(EXPECT.clinic);
if(!dataset||!person||!clinic) fail('Canonical core entities missing');
if(dataset.version!==EXPECT.release||dataset.dateModified!==EXPECT.date) fail('Dataset version/date not migrated');
if(scalar(dataset.creator)!==EXPECT.person||scalar(dataset.publisher)!==EXPECT.person) fail('Dataset creator/publisher not physician-first');
const about=new Set(arr(dataset.about).map(scalar));
if(!about.has(EXPECT.person)||!about.has(EXPECT.clinic)) fail('Dataset about relation missing physician or clinic');
const sameAs=new Set(arr(dataset.sameAs).map(scalar));
if(!sameAs.has(`https://www.wikidata.org/entity/${EXPECT.qDataset}`)&&!sameAs.has(`https://www.wikidata.org/wiki/${EXPECT.qDataset}`)) fail('Dataset lacks Q140304972 reconciliation');
const graphStrings=flattenStrings(graph);
if(!graphStrings.some(x=>x.includes(EXPECT.concept))||!graphStrings.some(x=>x.includes(EXPECT.version))) fail('Canonical graph does not expose both Concept and Version DOI');
if(graphStrings.some(x=>x.includes(EXPECT.historical))) fail('Historical v1.0 DOI leaked into current canonical graph');
const project=byId.get('https://www.ghezelbaash.ir/#doctor-ghezelbaash-structured-data-project');
if(project&&arr(project.sameAs).map(scalar).some(x=>x.includes(EXPECT.qDataset))) fail('Legacy project node competes with canonical Dataset IRI for Q140304972 identity');

const personSameAs=arr(person.sameAs).map(scalar);
for(const u of personSameAs){
  if(u.includes('/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data')||u.includes('zenodo.org/records/')||u.includes('doi.org/10.5281/zenodo.')) fail(`Dataset/archive URL leaked into Person.sameAs: ${u}`);
}

for(const p of ['src/data/volatile-facts.json','src/data/evidence-registry.json','src/data/evidence-snapshot.json']){
  const x=await readJson(p);
  if(Object.hasOwn(x,'release')&&x.release!==EXPECT.release) fail(`${p} release drift`);
  const strings=flattenStrings(x);
  if(strings.some(s=>s.includes(EXPECT.historical))) fail(`${p} still treats historical DOI as current evidence`);
}

const content=await readFile('src/content-source/100-rc099.html','utf8');
if(content.includes('1.0.0')) fail('Current structured-data content still exposes release 1.0.0');
if(content.includes(EXPECT.historical)) fail('Historical v1.0 DOI still exposed as current in structured-data content');
if(!content.includes(EXPECT.release)||!content.includes(EXPECT.version)) fail('Structured-data content lacks current release/Version DOI');
if(content.includes('no later release version is asserted')) fail('Obsolete no-later-release assertion remains');

const llms=await readFile('src/data/templates/llms.template.txt','utf8');
if(llms.includes(EXPECT.historical)) fail('llms template hard-codes historical DOI');
for(const ph of ['{{ZENODO_VERSION_DOI_URL}}','{{ZENODO_CONCEPT_DOI_URL}}','{{ZENODO_RECORD_ID}}']) if(!llms.includes(ph)) fail(`llms template missing ${ph}`);
const gen=await readFile('scripts/generate-projections.mjs','utf8');
for(const ph of ['ZENODO_VERSION_DOI_URL','ZENODO_CONCEPT_DOI_URL','ZENODO_RECORD_ID']) if(!gen.includes(ph)) fail(`projection generator does not resolve ${ph}`);

const sourceValidator=await readFile('scripts/validate-source.mjs','utf8');
if(sourceValidator.includes("inv.release!=='1.0.0'")||sourceValidator.includes('Public release/entity truth: Version 1.0.0')) fail('Existing source validator still hard-locks v1.0.0');
if(!sourceValidator.includes("inv.release!=='1.1.0'")) fail('Existing source validator lacks explicit v1.1.0 public release gate');

if(!pkg.scripts?.['validate:release-contract']?.includes('validate-release-contract.mjs')) fail('package.json release contract validator script missing');
if(!pkg.scripts?.['release:prepare']?.includes('validate:release-contract')||!pkg.scripts?.check?.includes('validate:release-contract')) fail('Release contract validator not wired into fail-closed source pipeline');

console.log(JSON.stringify({stage:'FINALIZE_SEMANTIC_SOURCE',release:EXPECT.release,conceptDoi:EXPECT.concept,versionDoi:EXPECT.version,recordId:EXPECT.record,coreFrozen:false,integrity:'PASS'},null,2));
