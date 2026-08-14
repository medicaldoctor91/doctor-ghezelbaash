import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const fail=m=>{throw new Error(m)};
const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
const id=v=>typeof v==='string'?v:v?.['@id'];
const strings=x=>{const out=[];const walk=v=>{if(typeof v==='string')out.push(v);else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk)};walk(x);return out};
const release=await readJson('src/data/release.json'),inv=await readJson('src/data/release-invariants.json'),pkg=await readJson('package.json'),lock=await readJson('package-lock.json'),codemeta=await readJson('codemeta.json');
const R=release.release,Z=release.dataset?.zenodo;
if(!/^\d+\.\d+\.\d+$/.test(R)||inv.release!==R||pkg.version!==R||lock.version!==R||lock.packages?.['']?.version!==R)fail('Release version convergence failure');
if(release.dateModified!==inv.date)fail('Release publication date convergence failure');
if(!/^\d{4}-\d{2}-\d{2}$/.test(release.medicalReviewedAt||''))fail('medicalReviewedAt must be an explicit ISO date');
if(!Z||Z.role!=='preservation'||Z.conceptDoi!=='10.5281/zenodo.18765168'||!/^10\.5281\/zenodo\.\d+$/.test(Z.versionDoi)||!/^[0-9]+$/.test(String(Z.recordId)))fail('Zenodo identity contract failure');
for(const forbidden of ['state','draftApi','publishedApi','previousVersion','historicalVersion'])if(Object.hasOwn(Z,forbidden))fail(`Operational/legacy Zenodo field remains in release truth: ${forbidden}`);
if(!Array.isArray(Z.releaseHistory)||Z.releaseHistory.length<3)fail('releaseHistory[] missing or incomplete');
const hist=new Map(Z.releaseHistory.map(x=>[x.release,x]));
for(const v of ['1.0.0','1.2.0','1.2.1']){const h=hist.get(v);if(!h||!/^10\.5281\/zenodo\.\d+$/.test(h.versionDoi)||!/^[0-9]+$/.test(String(h.recordId))||!/^\d{4}-\d{2}-\d{2}$/.test(h.publicationDate))fail(`Historical release malformed: ${v}`)}
const currentHist=hist.get(R);if(!currentHist||currentHist.versionDoi!==Z.versionDoi||String(currentHist.recordId)!==String(Z.recordId)||currentHist.publicationDate!==release.dateModified)fail('Current releaseHistory entry drift');
if(Z.conceptDoi===Z.versionDoi)fail('Concept DOI collapsed with Version DOI');
if(codemeta.softwareVersion!==R||codemeta.dateModified!==release.dateModified||codemeta.subjectOf?.version!==R||codemeta.subjectOf?.identifier!==`https://doi.org/${Z.versionDoi}`)fail('CodeMeta convergence failure');
const citation=await readFile(path.join(root,'CITATION.cff'),'utf8');for(const t of [`version: ${R}`,`date-released: ${release.dateModified}`,`doi: ${Z.versionDoi}`])if(!citation.includes(t))fail(`CITATION drift: ${t}`);
const graph=await readJson('src/data/semantic/knowledge-graph.jsonld'),nodes=graph['@graph']||[],byId=new Map(nodes.filter(n=>n?.['@id']).map(n=>[n['@id'],n]));
const person=byId.get(release.primaryEntity.id),clinic=byId.get(release.clinic.id),dataset=byId.get(release.dataset.id);if(!person||!clinic||!dataset)fail('Core entity missing');
if(dataset.version!==R||dataset.dateModified!==release.dateModified)fail('Dataset current release drift');
if(id(dataset.creator)!==release.primaryEntity.id||id(dataset.publisher)!==release.primaryEntity.id)fail('Dataset physician-first creator/publisher drift');
const sameAs=new Set(arr(dataset.sameAs).map(id));if(!sameAs.has(`https://www.wikidata.org/entity/${release.dataset.wikidata}`)||[...sameAs].some(x=>/github\.com|huggingface\.co|doi\.org|zenodo\.org/.test(x)))fail('Dataset identity/distribution collapse');
const gStrings=strings(graph),currentDoiHits=gStrings.filter(x=>x.includes(Z.versionDoi)).length,conceptHits=gStrings.filter(x=>x.includes(Z.conceptDoi)).length;if(!currentDoiHits||!conceptHits)fail('Canonical graph lacks current Version DOI or Concept DOI');
for(const h of Z.releaseHistory.filter(x=>x.release!==R)){const occurrences=gStrings.filter(x=>x.includes(h.versionDoi));for(const s of occurrences){if(!/release-history|historical|version/i.test(s)&&!JSON.stringify(graph).includes(`\"release\":\"${h.release}\"`)){} } }
const zen=byId.get('https://www.ghezelbaash.ir/#project-zenodo-release'),hf=byId.get('https://www.ghezelbaash.ir/#project-huggingface-dataset'),gh=byId.get('https://www.ghezelbaash.ir/#project-github-source');
if(!zen||zen.version!==R||!String(zen.url||'').includes(Z.versionDoi)||!String(zen.identifier||'').includes(Z.versionDoi)||String(zen.sameAs||'')!==`https://zenodo.org/records/${Z.recordId}`)fail('Zenodo distribution node drift');
if(!hf||hf.version!==R)fail('HF distribution node version drift');
if(!gh||gh.version!==R)fail('GitHub source node version drift');
const forbiddenWording=['secondary ai/ml distribution','derived, synthetic retrieval material','not canonical factual evidence','canonical_factual_authority=false'];const graphLower=JSON.stringify(graph).toLowerCase();for(const f of forbiddenWording)if(graphLower.includes(f))fail(`Self-devaluing HF wording remains in canonical graph: ${f}`);
const svc=await readJson('src/data/service-registry.json');const registered=new Set(svc.services.filter(x=>x.publishable).map(x=>x.id)),offered=new Set([...arr(person.availableService).map(id),...arr(clinic.availableService).map(id)].filter(Boolean));const missing=[...registered].filter(x=>!offered.has(x)),extra=[...offered].filter(x=>!registered.has(x));if(missing.length||extra.length)fail(`Service set mismatch missing=${missing.length} extra=${extra.length}`);if(![...registered].some(x=>x.includes('botulinum-toxin-chronic-migraine')))fail('Migraine Botox offered service missing');
const ans=await readJson('src/data/answer-registry.json');for(const r of ans.answers){if(!byId.has(r.questionId)||!byId.has(r.answerId)||id(byId.get(r.questionId)?.acceptedAnswer)!==r.answerId)fail(`Answer registry drift ${r.questionId}`)}
const visible=await readJson('src/data/visible-contract.json');const sourceDir=path.join(root,'src/content-source'),names=(await readdir(sourceDir)).filter(x=>/\.(html|md)$/i.test(x)).sort();let content='';for(const n of names)content+=await readFile(path.join(sourceDir,n),'utf8');if(!content.includes('id="saeed-ghezelbash"'))fail('Protected H1 missing');for(const h of visible.protected.aggressiveHeadings){if(h.id&&!content.includes(`id="${h.id}"`))fail(`Protected aggressive heading missing ${h.id}`)}for(const h of visible.protected.instagramHeadingLinks){if(h.id&&!content.includes(`id="${h.id}"`))fail(`Protected Instagram heading missing ${h.id}`)}
if(!content.includes('Google Maps')||!content.includes('google-maps-clinic-reputation-current'))fail('Visible reputation slot missing');
const volatile=await readJson('src/data/volatile-facts.json');const rating=volatile.rating??volatile.facts?.find(x=>x.property==='ratingValue')?.value,reviews=volatile.reviewCount??volatile.facts?.find(x=>x.property==='reviewCount')?.value,place=volatile.placeId??volatile.facts?.find(x=>x.placeId)?.placeId;if(!(Number(rating)>=1&&Number(rating)<=5)||!Number.isInteger(Number(reviews))||Number(reviews)<0||place!==release.clinic.placeId)fail('Dynamic reputation contract failure');
const hfPolicy=await readJson('.release/policy/hf-authority-contract.json');for(const t of ['question-answering','text-retrieval','text-generation'])if(!hfPolicy.taskCategories.includes(t))fail(`HF task missing ${t}`);for(const l of ['fa','en','ar','ckb'])if(!hfPolicy.languages.includes(l))fail(`HF language missing ${l}`);
for(const file of ['scripts/promote-release.mjs','scripts/prepare-huggingface-distribution.mjs']){const s=(await readFile(path.join(root,file),'utf8')).toLowerCase();for(const f of forbiddenWording)if(s.includes(f))fail(`${file} retains forbidden regression wording: ${f}`)}
console.log(JSON.stringify({stage:'V122_CONTRACT',release:R,conceptDoi:Z.conceptDoi,versionDoi:Z.versionDoi,recordId:String(Z.recordId),releaseHistory:Z.releaseHistory.length,services:registered.size,answers:ans.answers.length,medicalReviewedAt:release.medicalReviewedAt,integrity:'PASS'},null,2));
