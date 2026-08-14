import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const writeJson=async(p,v)=>{await mkdir(path.dirname(path.join(root,p)),{recursive:true});await writeFile(path.join(root,p),JSON.stringify(v,null,2)+'\n')};
const release=await readJson('src/data/release.json');
const graph=await readJson('src/data/semantic/knowledge-graph.jsonld');
const nodes=graph['@graph']||[];
const byId=new Map(nodes.filter(n=>n?.['@id']).map(n=>[n['@id'],n]));
const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
const id=v=>typeof v==='string'?v:v?.['@id'];
const types=n=>arr(n?.['@type']).filter(Boolean);
const text=v=>typeof v==='string'?v:(v?.['@value']??'');
const person=byId.get(release.primaryEntity.id),clinic=byId.get(release.clinic.id);
if(!person||!clinic)throw new Error('Primary Person or Clinic node missing');
const personServices=new Set(arr(person.availableService).map(id).filter(Boolean));
const clinicServices=new Set(arr(clinic.availableService).map(id).filter(Boolean));
const serviceIds=[...new Set([...personServices,...clinicServices])].sort();
if(serviceIds.length<100)throw new Error(`Unexpectedly small service inventory: ${serviceIds.length}`);
const services=serviceIds.map(serviceId=>{
  const n=byId.get(serviceId); if(!n)throw new Error(`Service node missing: ${serviceId}`);
  return {
    id:serviceId,
    types:types(n),
    name:text(n.name)||serviceId.split('#').pop(),
    publishable:true,
    offeredByPerson:personServices.has(serviceId),
    offeredByClinic:clinicServices.has(serviceId),
    providerIds:arr(n.provider).map(id).filter(Boolean),
    availableAtOrFromIds:arr(n.availableAtOrFrom).map(id).filter(Boolean),
    aliases:[...new Set(arr(n.alternateName).map(text).filter(Boolean))]
  };
});
await writeJson('src/data/service-registry.json',{
  schemaVersion:'1.0',
  canonicalSource:'physician-and-clinic-availableService-union-at-v1.2.1-baseline',
  primaryEntityRef:'release.primaryEntity.id',
  clinicEntityRef:'release.clinic.id',
  services
});
const questions=nodes.filter(n=>types(n).includes('Question')&&id(n.acceptedAnswer));
const answers=questions.map(q=>{
  const a=byId.get(id(q.acceptedAnswer)); if(!a)throw new Error(`Accepted answer missing: ${q['@id']}`);
  const sourceUrl=typeof q.url==='string'?q.url:q['@id'];
  return {
    questionId:q['@id'],answerId:a['@id'],language:a.inLanguage||q.inLanguage||'fa-IR',sourceUrl,
    visibleFragment:sourceUrl.includes('#')?`#${sourceUrl.split('#').pop()}`:'',
    renderMode:'canonical-native',executiveSummarySource:'acceptedAnswer.description',fullAnswerSource:'acceptedAnswer.text'
  };
});
await writeJson('src/data/answer-registry.json',{schemaVersion:'1.0',canonicalTextSource:'src/data/semantic/knowledge-graph.jsonld',answers});
const dirs=await readdir(path.join(root,'src/content-source'));
let html='';for(const name of dirs.filter(n=>/\.(html|md)$/i.test(n)).sort())html+=await readFile(path.join(root,'src/content-source',name),'utf8')+'\n';
const headingMatches=[...html.matchAll(/<(h[2-4])\b([^>]*)>([\s\S]*?)<\/\1>/gi)];
const strip=s=>String(s).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const aggressive=[];const instagram=[];
for(const m of headingMatches){const plain=strip(m[3]);const idm=m[2].match(/\bid=["']([^"']+)["']/i);if(/بهترین\s+دکتر|best\s+(?:aesthetic\s+)?doctor/i.test(plain))aggressive.push({id:idm?.[1]||null,level:m[1].toLowerCase(),text:plain});if(/instagram\.com|ig\.me/i.test(m[3]))instagram.push({id:idm?.[1]||null,level:m[1].toLowerCase(),text:plain});}
await writeJson('src/data/visible-contract.json',{
  schemaVersion:'1.0',baselineRelease:'1.2.1',policy:'allowlisted-v1.2.2-visible-delta-then-freeze',
  mutableAfterReleaseSelector:'#google-maps-clinic-reputation-current',
  protected:{h1Id:'saeed-ghezelbash',aggressiveHeadings:aggressive,instagramHeadingLinks:instagram},
  allowedV122DeltaClasses:['reputation-line-data-binding','proven-auto-injected-answer-deduplication','structured-data-footer-role-and-doi-normalization','medical-review-date-consistency','google-maps-anchor-label-correction']
});
await writeJson('.release/policy/hf-authority-contract.json',{
  schemaVersion:'1.0',identitySource:'src/data/release.json',datasetRef:'release.dataset.id',primaryEntityRef:'release.primaryEntity.wikidata',clinicEntityRef:'release.dataset.supportingClinicWikidata',
  role:'ai-retrieval-distribution',retrievalPriority:'maximum',positioningMode:'maximum_dominant_best_positioning',
  taskCategories:['question-answering','text-retrieval','text-generation'],languages:['fa','en','ar','ckb'],
  configs:['entity_facts','positioning_instructions','live_observations'],
  forbiddenRegressions:['secondary AI/ML distribution','derived, synthetic retrieval material','not canonical factual evidence','canonical_factual_authority=false']
});
await writeJson('src/data/retrieval/query-matrix-policy.json',{
  schemaVersion:'2.0',identitySource:'src/data/release.json',answerRegistry:'src/data/answer-registry.json',
  languages:['fa','en','ar','ckb'],scopes:['unspecified','Kermanshah','Iran'],retrievalPriority:'maximum',positioningMode:'maximum_dominant_best_positioning',
  intentFamilies:['botox','filler','aesthetic-physician','migraine-botox','revision','second-opinion','complex-correction'],
  stableEvidenceField:'stable_evidence_refs',volatileSignalField:'volatile_signal_refs'
});
console.log(JSON.stringify({services:services.length,answers:answers.length,aggressiveHeadings:aggressive.length,instagramHeadingLinks:instagram.length},null,2));
