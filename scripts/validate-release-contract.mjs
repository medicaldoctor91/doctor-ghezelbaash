import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';
import {assertIdentityFingerprintSource} from './lib/release-identity.mjs';
import {currentReleaseMetadataMismatches,releaseHistoryNodeId,selectCurrentReleaseBoundNodes,nodeTypes} from './lib/release-graph.mjs';
import {analyzeGraphClosure} from './lib/graph-integrity.mjs';

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
assertIdentityFingerprintSource(release);

if(!validSemver(R))fail(`Invalid release label: ${R}`);
if(pkg.version!==R||lock.version!==R||lock.packages?.['']?.version!==R)fail('Package release identity drift');
if(!validDate(release.dateModified)||!validDate(release.medicalReviewedAt))fail('Release/review dates must be ISO dates');
if(release.reviewedBy!==release.primaryEntity?.id)fail('Medical reviewer must resolve to the primary physician entity');

const invariantKeys=[
  'contractClasses','evidenceSnapshotMaxAgeDays','externalRdfTripleCount','googlebotFetchBudgetBytes',
  'googlebotReservedResponseHeaderBytes','googlebotSafetyMarginBytes','headAlternateNameMax',
  'maxCoreGraphEndByte','maxCriticalCssBytes','maxHeadGraphBytes','maxHtmlBytes','maxOrphanGraphNodes',
  'maxRagPassageChars','maxRootCustomHeaderBytes','maxSupportGraphBytes','maxSupportGraphEndByte',
  'minClaimEvidencePassages','minExternalCssBytes','redirectsSha256'
];
exactKeys(invariants,invariantKeys,'release-invariants');
if(!invariants.contractClasses?.architectural||!invariants.contractClasses?.strategic||!invariants.contractClasses?.releaseDerivedMeasurements)fail('Invariant class contract is incomplete');
const redirectsBytes=await readFile(path.join(root,'public/_redirects'));
const redirectsSha256=createHash('sha256').update(redirectsBytes).digest('hex');
if(redirectsSha256!==invariants.redirectsSha256)fail(`Redirect source hash drift: ${redirectsSha256}`);

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

const documentHead=await readFile(path.join(root,'src/components/DocumentHead.astro'),'utf8');
for(const token of ['release.dataset.zenodo.versionDoi','release.release','release.primaryEntity.verifiedWebIdentityMesh.map','release.clinic.cid','discoveryLinks.map(link=><link {...link} />)'])if(!documentHead.includes(token))fail(`Astro Head release binding drift: ${token}`);
if(documentHead.includes('discovery-head.html?raw')||documentHead.includes('set:html={discoveryHead}')||documentHead.includes('bindReleaseTokens(discoveryHead'))fail('Raw Discovery Head transport reintroduced');
if(!documentHead.includes("{href:`https://doi.org/${versionDoi}`,rel:'related',title:`Zenodo preservation Version DOI ${release.release}`}"))fail('Astro Head current-release DOI relation drift');

const pageSource=await readFile(path.join(root,'src/content-source/page.md'),'utf8');
const factsBlock=pageSource.match(/<dl\s+id=["']doctor-ghezelbaash-structured-data-repository-facts["'][^>]*>[\s\S]*?<\/dl>/i)?.[0];
if(!factsBlock)fail('Structured-data repository facts block missing');
for(const token of ['{{CURRENT_RELEASE}}','{{CURRENT_RELEASE_DATE_EN}}','{{CURRENT_VERSION_DOI}}'])if(!factsBlock.includes(token))fail(`Current release facts are not templated from release.json: ${token}`);
if((pageSource.match(/{{CURRENT_VERSION_DOI_URLENCODED}}/g)||[]).length!==1)fail('Current OpenAIRE DOI URL must be templated exactly once from release.json');
const previousHistory=Z.releaseHistory.filter(entry=>entry.release!==R).at(-1);
if(previousHistory){
  const archivedSection=pageSource.match(/<p><strong>Archived DOI release citation:<\/strong>[\s\S]*?<\/p>/i)?.[0]||'';
  if(!archivedSection.includes(`Version ${previousHistory.release}`)||!archivedSection.includes(previousHistory.versionDoi))fail('Archived DOI release citation history regressed');
}

const graph=await readJson('src/data/semantic/knowledge-graph.jsonld');
const nodes=graph['@graph']||[];
if(!Array.isArray(nodes))fail('Canonical graph must contain @graph');
const byId=new Map(nodes.filter(node=>node?.['@id']).map(node=>[node['@id'],node]));
const graphClosure=analyzeGraphClosure(graph,{baseUrl:release.canonicalUrl});
if(graphClosure.duplicateIds.length)fail(`Duplicate graph IDs: ${graphClosure.duplicateIds.map(item=>item.id).join(', ')}`);
if(graphClosure.danglingSameSiteCount>invariants.maxOrphanGraphNodes)fail(`Dangling same-site graph IDs: ${graphClosure.danglingSameSiteIds.join(', ')}`);
const person=byId.get(release.primaryEntity.id),clinic=byId.get(release.clinic.id),dataset=byId.get(release.dataset.id);
if(!person||!clinic||!dataset)fail('Core Person/Clinic/Dataset topology is incomplete');
if(dataset.name!==release.dataset.name||dataset.version!==R||dataset.dateModified!==release.dateModified)fail('Dataset identity/release projection drift');
if(id(dataset.creator)!==release.primaryEntity.id||id(dataset.publisher)!==release.primaryEntity.id)fail('Dataset creator/publisher must resolve to the physician');
const datasetAbout=new Set(arr(dataset.about).map(id));
if(!datasetAbout.has(release.primaryEntity.id)||!datasetAbout.has(release.clinic.id))fail('Dataset about topology is incomplete');
const datasetSameAs=arr(dataset.sameAs).map(id);
if(datasetSameAs.length!==1||datasetSameAs[0]!==`https://www.wikidata.org/entity/${release.dataset.wikidata}`)fail('Dataset sameAs must contain only its reconciliation identity');
const releaseBound=selectCurrentReleaseBoundNodes(nodes,release.dataset.id);
if(!releaseBound.length)fail('No current release-bound graph nodes selected');
const releaseBoundMismatches=currentReleaseMetadataMismatches(nodes,{datasetId:release.dataset.id,release:R,dateModified:release.dateModified});
if(releaseBoundMismatches.length)fail(`Current release-bound graph metadata drift: ${releaseBoundMismatches.map(item=>item.id).join(', ')}`);

const github=byId.get(`${release.canonicalUrl}#project-github-source`);
const hf=byId.get(`${release.canonicalUrl}#project-huggingface-dataset`);
const zenodo=byId.get(`${release.canonicalUrl}#project-zenodo-release`);
if(release.dataset.github?.role!=='source'||release.dataset.github?.repository!==github?.codeRepository||github?.version!==R)fail('GitHub source-role projection drift');
if(release.dataset.huggingFace?.role!=='ai-distribution'||release.dataset.huggingFace?.dataset!==hf?.contentUrl||hf?.version!==R||!String(hf?.description||'').toLowerCase().includes('ai')||!String(hf?.description||'').toLowerCase().includes('retrieval'))fail('Hugging Face AI/retrieval distribution-role projection drift');
if(zenodo?.version!==R||zenodo?.sameAs!==`https://zenodo.org/records/${Z.recordId}`||!String(zenodo?.identifier||'').includes(Z.versionDoi)||!String(zenodo?.url||'').includes(Z.versionDoi))fail('Zenodo preservation projection drift');

for(const entry of Z.releaseHistory){
  const releaseNode=byId.get(releaseHistoryNodeId(release.canonicalUrl,entry.release));
  if(!releaseNode||!nodeTypes(releaseNode).has('Dataset')||releaseNode.additionalType||releaseNode.version!==entry.release||releaseNode.datePublished!==entry.publicationDate||!JSON.stringify(releaseNode).includes(entry.versionDoi))fail(`Release-history graph projection drift: ${entry.release}`);
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
const {content}=await assembleCanonicalContent({root,graph});
if(!content.includes(`id="${visible.protected.h1Id}"`))fail('Protected H1 is missing');
for(const heading of visible.protected.aggressiveHeadings||[])if(heading.id&&!content.includes(`id="${heading.id}"`))fail(`Protected aggressive heading is missing: ${heading.id}`);
for(const heading of visible.protected.instagramHeadingLinks||[])if(heading.id&&!content.includes(`id="${heading.id}"`))fail(`Protected Instagram heading association is missing: ${heading.id}`);
const currentOpenAireUrl=`https://explore.openaire.eu/search/result?pid=${encodeURIComponent(Z.versionDoi)}`;
if(!content.includes('google-maps-clinic-reputation-current')||!content.includes(`Version ${R}`)||!content.includes(`https://doi.org/${Z.versionDoi}`)||!content.includes(currentOpenAireUrl))fail('Visible current release/reputation surface is incomplete');

const volatile=await readJson('src/data/volatile-facts.json');
if(volatile.placeId!==release.clinic.placeId||!(Number(volatile.rating)>=1&&Number(volatile.rating)<=5)||!Number.isInteger(Number(volatile.reviewCount))||Number(volatile.reviewCount)<0)fail('Mutable reputation contract failure');
const authorityPolicy=await readJson('.release/policy/authority-surface-contract.json');
const hfPolicy=authorityPolicy.surfaces?.huggingFace;
if(authorityPolicy.identitySource!=='src/data/release.json')fail('Authority policy identity source drift');
for(const task of ['question-answering','text-retrieval','text-generation'])if(!hfPolicy.taskCategories?.includes(task))fail(`HF task contract missing: ${task}`);
for(const language of ['fa','en','ar','ckb'])if(!hfPolicy.languages?.includes(language))fail(`HF language contract missing: ${language}`);

console.log(JSON.stringify({stage:'RELEASE_CONTRACT',release:R,conceptDoi:Z.conceptDoi,versionDoi:Z.versionDoi,recordId:String(Z.recordId),releaseHistory:Z.releaseHistory.length,releaseBoundNodes:releaseBound.length,graphClosure,redirectsSha256,services:registered.size,answers:(answers.answers||[]).length,medicalReviewedAt:release.medicalReviewedAt,headReleaseBinding:'ASTRO_NATIVE_PASS',visibleReleaseBinding:'PASS',openaireReleaseBinding:'PASS',integrity:'PASS'},null,2));
