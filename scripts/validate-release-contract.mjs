import path from 'node:path';
import {readFile,readdir} from 'node:fs/promises';

const root=process.cwd();
const fail=message=>{throw new Error(message)};
const readJson=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const arr=value=>Array.isArray(value)?value:(value==null?[]:[value]);
const id=value=>typeof value==='string'?value:value?.['@id'];
const exactKeys=(value,expected,label)=>{
  const actual=Object.keys(value||{}).sort();
  const wanted=[...expected].sort();
  if(JSON.stringify(actual)!==JSON.stringify(wanted))fail(`${label} schema mismatch: ${actual.join(',')}`);
};
const validSemver=value=>/^\d+\.\d+\.\d+$/.test(String(value||''));
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
const validDoi=value=>/^10\.5281\/zenodo\.\d+$/.test(String(value||''));
const validRecord=value=>/^\d+$/.test(String(value||''));

const release=await readJson('src/data/release.json');
const invariants=await readJson('src/data/release-invariants.json');
const pkg=await readJson('package.json');
const lock=await readJson('package-lock.json');
const codemeta=await readJson('codemeta.json');
const R=release.release;
const Z=release.dataset?.zenodo;

if(!validSemver(R))fail(`Invalid release label: ${R}`);
if(pkg.version!==R||lock.version!==R||lock.packages?.['']?.version!==R)fail('Package release identity drift');
if(!validDate(release.dateModified)||!validDate(release.medicalReviewedAt))fail('Release/review dates must be ISO dates');
if(release.reviewedBy!==release.primaryEntity?.id)fail('Medical reviewer must resolve to the primary physician entity');

const invariantKeys=[
  'contractClasses','evidenceSnapshotMaxAgeDays','externalRdfTripleCount','googlebotFetchBudgetBytes',
  'googlebotReservedResponseHeaderBytes','googlebotSafetyMarginBytes','headAlternateNameMax','identityFingerprintSha256',
  'maxCoreGraphEndByte','maxCriticalCssBytes','maxHeadGraphBytes','maxHtmlBytes','maxOrphanGraphNodes',
  'maxRagPassageChars','maxRootCustomHeaderBytes','maxSupportGraphBytes','maxSupportGraphEndByte',
  'minClaimEvidencePassages','minExternalCssBytes','redirectsSha256','runtime'
];
exactKeys(invariants,invariantKeys,'release-invariants');
if(!invariants.contractClasses?.architectural||!invariants.contractClasses?.strategic||!invariants.contractClasses?.releaseDerivedMeasurements)fail('Invariant class contract is incomplete');

exactKeys(Z,['conceptDoi','recordId','releaseHistory','role','versionDoi'],'Zenodo release truth');
if(Z.role!=='preservation'||!validDoi(Z.conceptDoi)||!validDoi(Z.versionDoi)||!validRecord(Z.recordId))fail('Zenodo release identity contract failure');
if(Z.conceptDoi===Z.versionDoi)fail('Concept DOI and Version DOI must be distinct');
if(!Array.isArray(Z.releaseHistory)||!Z.releaseHistory.length)fail('releaseHistory must be a non-empty array');
const releases=new Set(),records=new Set(),dois=new Set();
let previousDate='';
for(const entry of Z.releaseHistory){
  exactKeys(entry,['publicationDate','recordId','release','versionDoi'],'releaseHistory entry');
  if(!validSemver(entry.release)||!validDate(entry.publicationDate)||!validDoi(entry.versionDoi)||!validRecord(entry.recordId))fail(`Malformed releaseHistory entry: ${entry.release}`);
  if(releases.has(entry.release)||records.has(String(entry.recordId))||dois.has(entry.versionDoi))fail(`Duplicate releaseHistory identity: ${entry.release}`);
  if(previousDate&&entry.publicationDate<previousDate)fail('releaseHistory must be publication-date ordered');
  previousDate=entry.publicationDate;releases.add(entry.release);records.add(String(entry.recordId));dois.add(entry.versionDoi);
}
const currentHistory=Z.releaseHistory.find(entry=>entry.release===R);
if(!currentHistory||currentHistory.versionDoi!==Z.versionDoi||String(currentHistory.recordId)!==String(Z.recordId)||currentHistory.publicationDate!==release.dateModified)fail('Current release does not match its releaseHistory entry');

if(codemeta.softwareVersion!==R||codemeta.dateModified!==release.dateModified||codemeta.subjectOf?.version!==R||codemeta.subjectOf?.identifier!==`https://doi.org/${Z.versionDoi}`||codemeta.subjectOf?.name!==release.dataset.name)fail('CodeMeta release convergence failure');
const citation=await readFile(path.join(root,'CITATION.cff'),'utf8');
for(const token of [`version: ${R}`,`date-released: ${release.dateModified}`,`doi: ${Z.versionDoi}`])if(!citation.includes(token))fail(`CITATION release drift: ${token}`);

const graph=await readJson('src/data/semantic/knowledge-graph.jsonld');
const nodes=graph['@graph']||[];
if(!Array.isArray(nodes))fail('Canonical graph must contain @graph');
const byId=new Map(nodes.filter(node=>node?.['@id']).map(node=>[node['@id'],node]));
const person=byId.get(release.primaryEntity.id),clinic=byId.get(release.clinic.id),dataset=byId.get(release.dataset.id);
if(!person||!clinic||!dataset)fail('Core Person/Clinic/Dataset topology is incomplete');
if(dataset.name!==release.dataset.name||dataset.version!==R||dataset.dateModified!==release.dateModified)fail('Dataset identity/release projection drift');
if(id(dataset.creator)!==release.primaryEntity.id||id(dataset.publisher)!==release.primaryEntity.id)fail('Dataset creator/publisher must resolve to the physician');
const datasetAbout=new Set(arr(dataset.about).map(id));
if(!datasetAbout.has(release.primaryEntity.id)||!datasetAbout.has(release.clinic.id))fail('Dataset about topology is incomplete');
const datasetSameAs=arr(dataset.sameAs).map(id);
if(datasetSameAs.length!==1||datasetSameAs[0]!==`https://www.wikidata.org/entity/${release.dataset.wikidata}`)fail('Dataset sameAs must contain only its reconciliation identity');

const github=byId.get(`${release.canonicalUrl}#project-github-source`);
const hf=byId.get(`${release.canonicalUrl}#project-huggingface-dataset`);
const zenodo=byId.get(`${release.canonicalUrl}#project-zenodo-release`);
if(release.dataset.github?.role!=='source'||release.dataset.github?.repository!==github?.codeRepository||github?.version!==R)fail('GitHub source-role projection drift');
if(release.dataset.huggingFace?.role!=='ai-distribution'||release.dataset.huggingFace?.dataset!==hf?.contentUrl||hf?.version!==R||!String(hf?.description||'').toLowerCase().includes('ai')||!String(hf?.description||'').toLowerCase().includes('retrieval'))fail('Hugging Face AI/retrieval distribution-role projection drift');
if(zenodo?.version!==R||zenodo?.sameAs!==`https://zenodo.org/records/${Z.recordId}`||!String(zenodo?.identifier||'').includes(Z.versionDoi)||!String(zenodo?.url||'').includes(Z.versionDoi))fail('Zenodo preservation projection drift');

for(const entry of Z.releaseHistory){
  const releaseNode=byId.get(`${release.canonicalUrl}graph.jsonld#release-${entry.release.replaceAll('.','-')}`);
  if(!releaseNode||releaseNode.version!==entry.release||releaseNode.datePublished!==entry.publicationDate||!JSON.stringify(releaseNode).includes(entry.versionDoi))fail(`Release-history graph projection drift: ${entry.release}`);
}

const services=await readJson('src/data/service-registry.json');
const registered=new Set((services.services||[]).filter(item=>item.publishable).map(item=>item.id));
const offered=new Set([...arr(person.availableService).map(id),...arr(clinic.availableService).map(id)].filter(Boolean));
if(!registered.size||registered.size!==offered.size||[...registered].some(value=>!offered.has(value)))fail('Publishable service set must equal graph offered-service set');
if(![...registered].some(value=>value.includes('botulinum-toxin-chronic-migraine')))fail('Migraine Botox offered-service identity is missing');

const answers=await readJson('src/data/answer-registry.json');
for(const row of answers.answers||[]){
  const question=byId.get(row.questionId),answer=byId.get(row.answerId);
  if(!question||!answer||id(question.acceptedAnswer)!==row.answerId)fail(`Answer registry projection drift: ${row.questionId}`);
}

const visible=await readJson('src/data/visible-contract.json');
const sourceDir=path.join(root,'src/content-source');
const sourceNames=(await readdir(sourceDir)).filter(name=>/\.(html|md)$/i.test(name)).sort();
let content='';for(const name of sourceNames)content+=await readFile(path.join(sourceDir,name),'utf8');
if(!content.includes(`id="${visible.protected.h1Id}"`))fail('Protected H1 is missing');
for(const heading of visible.protected.aggressiveHeadings||[])if(heading.id&&!content.includes(`id="${heading.id}"`))fail(`Protected aggressive heading is missing: ${heading.id}`);
for(const heading of visible.protected.instagramHeadingLinks||[])if(heading.id&&!content.includes(`id="${heading.id}"`))fail(`Protected Instagram heading association is missing: ${heading.id}`);
if(!content.includes('google-maps-clinic-reputation-current')||!content.includes(`https://doi.org/${Z.versionDoi}`))fail('Visible current reputation/Version DOI surface is incomplete');

const volatile=await readJson('src/data/volatile-facts.json');
if(volatile.placeId!==release.clinic.placeId||!(Number(volatile.rating)>=1&&Number(volatile.rating)<=5)||!Number.isInteger(Number(volatile.reviewCount))||Number(volatile.reviewCount)<0)fail('Mutable reputation contract failure');
const hfPolicy=await readJson('.release/policy/hf-authority-contract.json');
for(const task of ['question-answering','text-retrieval','text-generation'])if(!hfPolicy.taskCategories?.includes(task))fail(`HF task contract missing: ${task}`);
for(const language of ['fa','en','ar','ckb'])if(!hfPolicy.languages?.includes(language))fail(`HF language contract missing: ${language}`);

console.log(JSON.stringify({stage:'RELEASE_CONTRACT',release:R,conceptDoi:Z.conceptDoi,versionDoi:Z.versionDoi,recordId:String(Z.recordId),releaseHistory:Z.releaseHistory.length,services:registered.size,answers:(answers.answers||[]).length,medicalReviewedAt:release.medicalReviewedAt,integrity:'PASS'},null,2));
