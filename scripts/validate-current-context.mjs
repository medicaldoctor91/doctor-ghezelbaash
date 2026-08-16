import path from 'node:path';
import {readFile} from 'node:fs/promises';

const root=process.cwd();
const dist=path.resolve(root,process.argv[2]||'dist');
const release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8'));
const serviceRegistry=JSON.parse(await readFile(path.join(root,'src/data/service-registry.json'),'utf8'));
const fail=message=>{throw new Error(message)};
const readDistJson=async file=>JSON.parse(await readFile(path.join(dist,file),'utf8'));
const Z=release.dataset.zenodo;
const history=Z.releaseHistory||[];

if(!history.length)fail('Release history is empty');
const currentHistory=history.find(entry=>entry.release===release.release);
if(!currentHistory||currentHistory.versionDoi!==Z.versionDoi||String(currentHistory.recordId)!==String(Z.recordId)||currentHistory.publicationDate!==release.dateModified)fail('Current release/history identity drift');

const publishableIds=new Set((serviceRegistry.services||[]).filter(item=>item.publishable).map(item=>item.id));
if(!publishableIds.size)fail('Publishable service registry is empty');

const matrix=await readDistJson('current-release-matrix.json');
const manifest=await readDistJson('artifact-manifest.json');
const attestation=await readDistJson('live-serving-attestation.json');
const dataPackage=await readDistJson('datapackage.json');
const croissant=await readDistJson('croissant.json');

const expectedMatrix={
  release:release.release,
  conceptDoi:Z.conceptDoi,
  versionDoi:Z.versionDoi,
  recordId:String(Z.recordId),
  datasetIri:release.dataset.id,
  personWikidata:release.primaryEntity.wikidata,
  clinicWikidata:release.dataset.supportingClinicWikidata,
  datasetWikidata:release.dataset.wikidata,
};
for(const [key,value] of Object.entries(expectedMatrix))if(String(matrix[key])!==String(value))fail(`Current matrix ${key} drift`);
if(matrix.servicesWithAliasCoverage!==publishableIds.size||matrix.serviceCount!==publishableIds.size)fail(`Service retrieval coverage drift matrix=${matrix.servicesWithAliasCoverage}/${matrix.serviceCount} registry=${publishableIds.size}`);

if(manifest.release!==release.release||manifest.baseRelease!==release.release||manifest.dataset?.id!==release.dataset.id||manifest.dataset?.name!==release.dataset.name||manifest.dataset?.versionDoi!==Z.versionDoi||manifest.dataset?.conceptDoi!==Z.conceptDoi||String(manifest.dataset?.zenodoRecordId)!==String(Z.recordId))fail('Serving manifest release/Dataset/DOI drift');
if(matrix.sourceCommit!==manifest.liveRevision||attestation.sourceCommit!==manifest.liveRevision||attestation.baseRelease!==release.release||attestation.versionDoi!==Z.versionDoi||attestation.conceptDoi!==Z.conceptDoi)fail('Current source revision/attestation binding drift');
if(dataPackage.version!==release.release||!String(dataPackage.title||'').startsWith(release.dataset.name))fail('Data Package current identity drift');
if(croissant.version!==release.release||croissant.name!==release.dataset.name)fail('Croissant current identity drift');

for(const file of ['dcat.ttl','answers.txt','llms.txt','llms-full.txt','index.md']){
  const text=await readFile(path.join(dist,file),'utf8');
  if(!text.includes(release.dataset.name))fail(`Canonical Dataset name missing from ${file}`);
  if(!text.includes(release.release))fail(`Current release marker missing from ${file}`);
}

const volatile=JSON.parse(await readFile(path.join(root,'src/data/volatile-facts.json'),'utf8'));
if(volatile.placeId!==release.clinic.placeId)fail('Current Place ID drift');

console.log(JSON.stringify({
  currentContextScanner:'PASS',
  release:release.release,
  conceptDoi:Z.conceptDoi,
  versionDoi:Z.versionDoi,
  recordId:String(Z.recordId),
  history:history.map(entry=>entry.release),
  publishableServiceCount:publishableIds.size,
  serviceCoverage:`${matrix.servicesWithAliasCoverage}/${matrix.serviceCount}`,
  liveRevision:matrix.liveRevision,
}));
