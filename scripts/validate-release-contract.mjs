import { readFile } from 'node:fs/promises';

const fail=m=>{throw new Error(m)};
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
const scalar=x=>typeof x==='string'?x:(x?.['@id']||x?.value||'');
const flattenStrings=x=>{const out=[];const walk=v=>{if(typeof v==='string')out.push(v);else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk)};walk(x);return out};
const stable={
  dataset:'https://www.ghezelbaash.ir/graph.jsonld#dataset',
  person:'https://www.ghezelbaash.ir/#saeed-ghezelbash',
  clinic:'https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah',
  qDataset:'Q140304972',qPerson:'Q140287622',qClinic:'Q140288589',
  concept:'10.5281/zenodo.18765168',
  hf:'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data',
  github:'https://github.com/medicaldoctor91/doctor-ghezelbaash'
};

const release=await readJson('src/data/release.json');
const inv=await readJson('src/data/release-invariants.json');
const pkg=await readJson('package.json');
const pkgLock=await readJson('package-lock.json');
const R=release.release, Z=release.dataset?.zenodo;
if(!/^\d+\.\d+\.\d+$/.test(String(R||''))) fail(`Invalid release label ${R}`);
if(inv.release!==R||pkg.version!==R||pkgLock.version!==R||pkgLock.packages?.['']?.version!==R) fail('Release version convergence failure');
if(release.dateModified!==inv.date) fail('Release date convergence failure');
if(release.dataset?.id!==stable.dataset||release.dataset?.wikidata!==stable.qDataset) fail('Canonical Dataset IRI/Wikidata contract failure');
if(release.dataset?.creator!==stable.person||release.dataset?.publisher!==stable.person||release.dataset?.creatorWikidata!==stable.qPerson) fail('Physician-first creator/publisher contract failure');
if(release.dataset?.supportingClinic!==stable.clinic||release.dataset?.supportingClinicWikidata!==stable.qClinic) fail('Supporting clinic contract failure');
if(release.dataset?.github?.role!=='source'||release.dataset?.github?.repository!==stable.github) fail('GitHub source-role contract failure');
if(release.dataset?.huggingFace?.role!=='ai-distribution'||release.dataset?.huggingFace?.dataset!==stable.hf) fail('Hugging Face distribution-role contract failure');
if(Z?.role!=='preservation'||Z?.conceptDoi!==stable.concept||!/^10\.5281\/zenodo\.\d+$/.test(String(Z?.versionDoi||''))||!/^[0-9]+$/.test(String(Z?.recordId||''))||Z?.state!=='doi-locked-draft') fail('Zenodo current-release lock contract failure');
if(Z.conceptDoi===Z.versionDoi) fail('Concept DOI and Version DOI collapsed');
for(const old of [Z?.previousVersion,Z?.historicalVersion].filter(Boolean)){
  if(!/^\d+\.\d+\.\d+$/.test(String(old.release||''))||!/^10\.5281\/zenodo\.\d+$/.test(String(old.versionDoi||''))||!/^[0-9]+$/.test(String(old.recordId||''))) fail('Historical Zenodo provenance malformed');
  if(old.versionDoi===Z.versionDoi||String(old.recordId)===String(Z.recordId)) fail('Current and historical Zenodo identity collapsed');
}
if(Z?.previousVersion?.release!=='1.1.0'||Z?.previousVersion?.versionDoi!=='10.5281/zenodo.21886743'||String(Z?.previousVersion?.recordId)!=='21886743') fail('Immediate previous release provenance failure');
if(Z?.historicalVersion?.release!=='1.0.0'||Z?.historicalVersion?.versionDoi!=='10.5281/zenodo.18765169'||String(Z?.historicalVersion?.recordId)!=='18765169') fail('Historical v1.0.0 provenance failure');

const graph=await readJson('src/data/semantic/knowledge-graph.jsonld');
const nodes=graph['@graph']; if(!Array.isArray(nodes)) fail('Canonical graph missing @graph');
const byId=new Map(nodes.filter(x=>x?.['@id']).map(x=>[x['@id'],x]));
const dataset=byId.get(stable.dataset),person=byId.get(stable.person),clinic=byId.get(stable.clinic);
if(!dataset||!person||!clinic) fail('Canonical core entities missing');
if(dataset.version!==R||dataset.dateModified!==inv.date) fail('Dataset release/date drift');
if(scalar(dataset.creator)!==stable.person||scalar(dataset.publisher)!==stable.person) fail('Dataset creator/publisher not physician-first');
const about=new Set(arr(dataset.about).map(scalar)); if(!about.has(stable.person)||!about.has(stable.clinic)) fail('Dataset about relation incomplete');
const sameAs=new Set(arr(dataset.sameAs).map(scalar)); if(!sameAs.has(`https://www.wikidata.org/entity/${stable.qDataset}`)&&!sameAs.has(`https://www.wikidata.org/wiki/${stable.qDataset}`)) fail('Dataset lacks Q140304972 reconciliation');
const graphStrings=flattenStrings(graph);
if(!graphStrings.some(x=>x.includes(stable.concept))||!graphStrings.some(x=>x.includes(Z.versionDoi))) fail('Canonical graph lacks Concept or current Version DOI');
for(const old of [Z?.previousVersion?.versionDoi,Z?.historicalVersion?.versionDoi].filter(Boolean)) if(graphStrings.some(x=>x.includes(old))) fail(`Historical Version DOI leaked into current graph: ${old}`);
for(const n of nodes.filter(n=>Object.hasOwn(n,'version'))) if(n.version!==R) fail(`Version-bearing graph node drift ${n['@id']||'(anonymous)'}: ${n.version}/${R}`);
const project=byId.get('https://www.ghezelbaash.ir/#doctor-ghezelbaash-structured-data-project');
if(project&&arr(project.sameAs).map(scalar).some(x=>x.includes(stable.qDataset))) fail('Legacy project node competes with canonical Dataset IRI for Q140304972 identity');
for(const u of arr(person.sameAs).map(scalar)) if(u.includes('/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data')||u.includes('zenodo.org/records/')||u.includes('doi.org/10.5281/zenodo.')) fail(`Dataset/archive URL leaked into Person.sameAs: ${u}`);

for(const p of ['src/data/volatile-facts.json','src/data/evidence-registry.json','src/data/evidence-snapshot.json']){
  const x=await readJson(p); if(Object.hasOwn(x,'release')&&x.release!==R) fail(`${p} release drift`);
  const strings=flattenStrings(x); for(const old of [Z?.previousVersion?.versionDoi,Z?.historicalVersion?.versionDoi].filter(Boolean)) if(strings.some(s=>s.includes(old))) fail(`${p} contains historical DOI as current evidence: ${old}`);
}
const content=await readFile('src/content-source/100-rc099.html','utf8');
if(!content.includes(`Version ${R}`)||!content.includes(Z.versionDoi)) fail('Structured-data content lacks current release/Version DOI');
for(const old of [Z?.previousVersion?.versionDoi,Z?.historicalVersion?.versionDoi].filter(Boolean)) if(content.includes(old)) fail(`Historical DOI remains on current structured-data authority surface: ${old}`);
if(content.includes('no later release version is asserted')) fail('Obsolete no-later-release assertion remains');
const llms=await readFile('src/data/templates/llms.template.txt','utf8');
for(const ph of ['{{ZENODO_VERSION_DOI_URL}}','{{ZENODO_CONCEPT_DOI_URL}}','{{ZENODO_RECORD_ID}}']) if(!llms.includes(ph)) fail(`llms template missing ${ph}`);
const gen=await readFile('scripts/generate-projections.mjs','utf8');
for(const ph of ['ZENODO_VERSION_DOI_URL','ZENODO_CONCEPT_DOI_URL','ZENODO_RECORD_ID']) if(!gen.includes(ph)) fail(`projection generator does not resolve ${ph}`);
const sourceValidator=await readFile('scripts/validate-source.mjs','utf8');
if(/Public release\/entity truth: Version \d/.test(sourceValidator)||/inv\.release!==['"]\d+\.\d+\.\d+['"]/.test(sourceValidator)) fail('Source validator hard-codes a release version');
if(!sourceValidator.includes('if(inv.release!==release.release)')) fail('Source validator lacks contract-driven release equality gate');
if(!pkg.scripts?.['validate:release-contract']?.includes('validate-release-contract.mjs')||!pkg.scripts?.['release:prepare']?.includes('validate:release-contract')||!pkg.scripts?.check?.includes('validate:release-contract')) fail('Fail-closed release contract validator wiring missing');

console.log(JSON.stringify({stage:'FINAL_CONVERGENCE_SOURCE',release:R,conceptDoi:Z.conceptDoi,versionDoi:Z.versionDoi,recordId:String(Z.recordId),coreFrozen:false,integrity:'PASS'},null,2));
