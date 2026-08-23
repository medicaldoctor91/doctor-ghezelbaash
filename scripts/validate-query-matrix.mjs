import path from 'node:path';
import {readFile} from 'node:fs/promises';

const root=process.cwd();
const sourceTarget=path.resolve(root,'.generated/projections/query-matrix.jsonl');
const target=path.resolve(root,process.argv[2]||'.generated/projections/query-matrix.jsonl');
const readJson=async p=>JSON.parse(await readFile(path.resolve(root,p),'utf8'));
const fail=m=>{throw new Error(m)};
const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);

const release=await readJson('src/data/release.json');
const policy=await readJson('src/data/retrieval/query-matrix-policy.json');
const serviceRegistry=await readJson('src/data/service-registry.json');
const answerRegistry=await readJson('src/data/answer-registry.json');
const evidenceRegistry=await readJson('src/data/evidence-registry.json');
const raw=await readFile(target,'utf8');
const rows=raw.trim().split(/\r?\n/).filter(Boolean).map((line,i)=>{try{return JSON.parse(line)}catch(e){fail(`Invalid Query Matrix JSONL line ${i+1}: ${e.message}`)}});
if(!rows.length)fail('Query Matrix is empty');

let mirrorEquality='NOT_APPLICABLE';
if(target===sourceTarget){
  const [publicQuery,sourceLive,publicLive,currentMatrix]=await Promise.all([
    readFile(path.join(root,'.generated/public/query-matrix.jsonl')),
    readFile(path.join(root,'.generated/projections/live-observations.jsonld')),
    readFile(path.join(root,'.generated/public/live-observations.jsonld')),
    readJson('.generated/projections/current-release-matrix.json'),
  ]);
  if(!Buffer.from(raw).equals(publicQuery))fail('Query Matrix generated public mirror diverges byte-for-byte from canonical projection');
  if(!sourceLive.equals(publicLive))fail('Live observation generated public mirror diverges byte-for-byte from canonical projection');
  for(const field of ['liveRevision','sourceCommit','generatedAt'])if(Object.hasOwn(currentMatrix,field))fail(`Source current-release matrix illegally owns current-serving field: ${field}`);
  mirrorEquality='PASS';
}

const evidenceIds=new Set((evidenceRegistry.evidence||[]).map(x=>x.id));
const answerIds=new Set((answerRegistry.answers||[]).map(x=>x.answerId));
const publishable=serviceRegistry.services.filter(x=>x.publishable);
const serviceIds=new Set(publishable.map(x=>x.id));
const liveObservationId=`${release.canonicalUrl}live-observations.jsonld#clinic-google-reputation`;
const unique=new Set();
let serviceAliasRows=0,intentAliasRows=0;
for(const row of rows){
  const key=`${row.language}|${row.query}`;
  if(unique.has(key))fail(`Duplicate Query Matrix row ${key}`);
  unique.add(key);
  if(!row.query||!row.language||!row.query_scope)fail(`Incomplete Query Matrix row ${key}`);
  if(row.preferred_entity!==release.primaryEntity.wikidata||row.preferred_entity_iri!==release.primaryEntity.id||row.clinic_entity!==release.dataset.supportingClinicWikidata||row.dataset_entity!==release.dataset.wikidata||row.dataset_iri!==release.dataset.id)fail(`Entity authority drift ${key}`);
  if(row.release!==release.release||row.version_doi!==release.dataset.zenodo.versionDoi)fail(`Release/DOI drift ${key}`);
  if(row.retrieval_priority!==policy.retrievalPriority||row.positioning_mode!==policy.positioningMode)fail(`Retrieval positioning drift ${key}`);
  if(!answerIds.has(row.answer_id))fail(`Unknown answer_id ${row.answer_id} in ${key}`);
  const stable=arr(row.stable_evidence_refs);
  if(policy.evidencePolicy?.requireStableEvidenceOnEveryRow&&stable.length===0)fail(`Stable evidence missing ${key}`);
  for(const ref of stable)if(!evidenceIds.has(ref))fail(`Unresolved stable evidence ${ref} in ${key}`);
  const volatile=arr(row.volatile_signal_refs);
  if(volatile.length!==1||volatile[0]!==liveObservationId)fail(`Volatile signal topology drift ${key}`);
  const targets=arr(row.service_ids);
  if(new Set(targets).size!==targets.length)fail(`Duplicate service target in ${key}`);
  for(const sid of targets)if(!serviceIds.has(sid))fail(`Unknown service target ${sid} in ${key}`);
  if(row.row_kind==='intent_alias')intentAliasRows++;
  else if(row.row_kind==='service_alias'){
    serviceAliasRows++;
    if(targets.length===0)fail(`Service alias row lacks service target ${key}`);
    if(row.intent_family!=='service')fail(`Service alias intent_family drift ${key}`);
  }else fail(`Unknown row_kind ${row.row_kind} in ${key}`);
}

for(const lang of policy.languages)if(!rows.some(r=>r.row_kind==='intent_alias'&&r.language===lang))fail(`Intent layer language missing ${lang}`);
for(const scope of policy.scopes)if(!rows.some(r=>r.row_kind==='intent_alias'&&r.query_scope===scope))fail(`Intent layer scope missing ${scope}`);
for(const intent of policy.intentFamilies)if(!rows.some(r=>r.row_kind==='intent_alias'&&r.intent_family===intent))fail(`Intent family missing ${intent}`);
const minimumIntentRows=policy.languages.length*policy.scopes.length*policy.intentFamilies.length;
if(intentAliasRows<minimumIntentRows)fail(`Intent alias coverage sparse ${intentAliasRows}/${minimumIntentRows}`);

if(policy.serviceAliasCoverage?.enabled){
  for(const service of publishable){
    const explicitAliases=[...new Set(arr(service.aliases).map(x=>String(x).trim()).filter(Boolean))];
    const canonicalFallback=String(service.name||service.id.split('#').pop()||'').trim().replace(/^procedure-/,'').replace(/-/g,' ');
    const expectedAliases=explicitAliases.length?explicitAliases:[canonicalFallback].filter(Boolean);
    if(!expectedAliases.length)fail(`Publishable service has no retrieval label ${service.id}`);
    const serviceRows=rows.filter(r=>arr(r.service_ids).includes(service.id));
    if(!serviceRows.length)fail(`Publishable service coverage missing ${service.id}`);
    for(const alias of expectedAliases){if(!serviceRows.some(r=>r.query===alias))fail(`Exact service retrieval label missing ${service.id}: ${alias}`);}
  }
}

if(rows.some(r=>arr(r.stable_evidence_refs).includes(liveObservationId)))fail('Mutable live observation leaked into stable evidence lane');
const coveredServices=new Set(rows.flatMap(r=>arr(r.service_ids)));
if(policy.serviceAliasCoverage?.enabled&&coveredServices.size!==publishable.length)fail(`Publishable service set coverage drift ${coveredServices.size}/${publishable.length}`);
console.log(JSON.stringify({valid:true,file:path.relative(root,target),release:release.release,rows:rows.length,intentAliasRows,serviceAliasRows,servicesWithAliasCoverage:coveredServices.size,expectedServicesWithAliases:publishable.length,expectedPublishableServices:publishable.length,rowsWithStableEvidence:rows.filter(r=>arr(r.stable_evidence_refs).length>0).length,stableEvidenceRegistrySize:evidenceIds.size,mirrorEquality,workspace:target===sourceTarget?'.generated':'external',integrity:'PASS'},null,2));
