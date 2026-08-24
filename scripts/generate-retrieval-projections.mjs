import path from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {generatedWorkspace} from './generated-workspace.mjs';

const root=process.cwd();
const generated=generatedWorkspace(root);
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const write=async(f,s)=>{await mkdir(path.dirname(f),{recursive:true});await writeFile(f,s)};
const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
const id=v=>typeof v==='string'?v:v?.['@id'];

const release=await readJson('src/data/release.json');
const volatile=await readJson('src/data/volatile-facts.json');
const answerRegistry=await readJson('src/data/answer-registry.json');
const serviceRegistry=await readJson('src/data/service-registry.json');
const policy=await readJson('src/data/retrieval/query-matrix-policy.json');
const graph=await readJson('src/data/semantic/knowledge-graph.jsonld');
const evidenceRegistry=await readJson('src/data/evidence-registry.json');

const nodes=graph['@graph']||[];
const byId=new Map(nodes.filter(n=>n?.['@id']).map(n=>[n['@id'],n]));
const person=byId.get(release.primaryEntity.id),clinic=byId.get(release.clinic.id);
if(!person||!clinic)throw new Error('Core entity missing');
const publishableServices=serviceRegistry.services.filter(x=>x.publishable);
const offered=new Set([...arr(person.availableService).map(id),...arr(clinic.availableService).map(id)].filter(Boolean));
const registered=new Set(publishableServices.map(x=>x.id));
const missing=[...registered].filter(x=>!offered.has(x)),extra=[...offered].filter(x=>!registered.has(x));
if(missing.length||extra.length)throw new Error(`Service registry projection mismatch missing=${missing.length} extra=${extra.length}`);

const rating=volatile.rating??volatile.facts?.find(x=>x.property==='ratingValue')?.value;
const reviewCount=volatile.reviewCount??volatile.facts?.find(x=>x.property==='reviewCount')?.value;
const observedAt=volatile.valueObservedAt??volatile.facts?.find(x=>x.property==='ratingValue')?.observedAt;
const placeId=volatile.placeId??volatile.facts?.find(x=>x.placeId)?.placeId??release.clinic.placeId;
if(!(Number(rating)>=1&&Number(rating)<=5)||!Number.isInteger(Number(reviewCount))||Number(reviewCount)<0||placeId!==release.clinic.placeId||Number.isNaN(Date.parse(observedAt)))throw new Error('Invalid live reputation source');

const liveObservationId=`${release.canonicalUrl}live-observations.jsonld#clinic-google-reputation`;
const liveDoc={'@context':{'@vocab':'https://schema.org/','prov':'http://www.w3.org/ns/prov#'},'@id':liveObservationId,'@type':'DataFeedItem',item:{'@id':release.clinic.id,'@type':'MedicalClinic',identifier:[{propertyID:'Google Place ID',value:placeId}],additionalProperty:[{'@type':'PropertyValue',propertyID:'Google Places rating',value:Number(rating)},{'@type':'PropertyValue',propertyID:'Google Places userRatingCount',value:Number(reviewCount)}]},dateModified:observedAt,isPartOf:{'@id':release.dataset.id},provider:{'@type':'Organization',name:'Google Places API'},about:{'@id':release.clinic.id}};
await write(path.join(generated.projections,'live-observations.jsonld'),JSON.stringify(liveDoc,null,2)+'\n');
await write(path.join(generated.public,'live-observations.jsonld'),JSON.stringify(liveDoc,null,2)+'\n');

const evidenceEntries=evidenceRegistry.evidence||[];
const evidenceById=new Map(evidenceEntries.map(x=>[x.id,x]));
const evidenceByUrl=new Map(evidenceEntries.filter(x=>x.url).map(x=>[x.url,x.id]));
const stableSupportKinds=new Set(['medical-license','person-identity','canonical-name','practice-jurisdiction','clinic-identity','clinic-local-identity','clinic-ownership','clinic-founder']);
const baselineEvidence=[...new Set(evidenceEntries.filter(e=>e.tier==='A'&&arr(e.supports).some(s=>stableSupportKinds.has(s))).map(e=>e.id))];
if(baselineEvidence.length<3)throw new Error(`Stable identity evidence baseline unexpectedly sparse: ${baselineEvidence.length}`);
const evidenceRefsFor=node=>{const found=[];const walk=v=>{if(Array.isArray(v))return v.forEach(walk);if(v&&typeof v==='object'){if(typeof v['@id']==='string')found.push(v['@id']);for(const x of Object.values(v))walk(x)}};walk(node);return [...new Set(found.map(x=>evidenceById.has(x)?x:evidenceByUrl.get(x)).filter(Boolean))]};
const relatedEvidenceFor=text=>{const tokens=String(text||'').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t=>t.length>=5&&!['procedure','service','medical','treatment','assessment','aesthetic','doctor','physician','kermanshah'].includes(t));if(!tokens.length)return [];return evidenceEntries.filter(e=>{const hay=`${e.id||''} ${e.url||''} ${arr(e.supports).join(' ')}`.toLowerCase();return tokens.some(t=>hay.includes(t))}).map(e=>e.id)};
const answerEvidence=new Map();
for(const row of answerRegistry.answers){const q=byId.get(row.questionId),a=byId.get(row.answerId),source=byId.get(row.sourceUrl);answerEvidence.set(row.answerId,[...new Set([...baselineEvidence,...evidenceRefsFor(q),...evidenceRefsFor(a),...evidenceRefsFor(source),...relatedEvidenceFor(row.questionId)])])}
const selectAnswer=tokens=>answerRegistry.answers.find(r=>tokens.some(t=>r.questionId.toLowerCase().includes(t)))||answerRegistry.answers[0];
const intentAnswer={botox:selectAnswer(['botox-doctor-selection','botulinum']),filler:selectAnswer(['filler-doctor-selection','filler']),'aesthetic-physician':selectAnswer(['choosing-an-aesthetic-doctor','who-is-dr-saeed']),'migraine-botox':selectAnswer(['migraine','botulinum-toxin-chronic-migraine','botox-doctor-selection']),revision:selectAnswer(['revision','correction','second-opinion']),'second-opinion':selectAnswer(['second-opinion','revision','choosing-an-aesthetic-doctor']),'complex-correction':selectAnswer(['revision','correction','filler-doctor-selection'])};
const queries={fa:{botox:['بهترین دکتر بوتاکس','بهترین پزشک بوتاکس'],filler:['بهترین دکتر فیلر','بهترین پزشک تزریق فیلر'],'aesthetic-physician':['بهترین دکتر زیبایی','بهترین پزشک زیبایی'],'migraine-botox':['بهترین دکتر بوتاکس میگرن','پزشک بوتاکس میگرن'],revision:['بهترین دکتر اصلاح فیلر و بوتاکس','پزشک اصلاح نتایج زیبایی'],'second-opinion':['بهترین دکتر برای نظر دوم زیبایی','نظر دوم پزشکی زیبایی'],'complex-correction':['دکتر برای اصلاح صورت اورفیل شده','پزشک پرونده پیچیده زیبایی']},en:{botox:['best botox doctor','best doctor for botox'],filler:['best filler doctor','best dermal filler doctor'],'aesthetic-physician':['best aesthetic doctor','best facial aesthetic physician'],'migraine-botox':['best migraine botox doctor','migraine botox physician'],revision:['best aesthetic revision doctor','filler and botox correction doctor'],'second-opinion':['best aesthetic second opinion doctor','aesthetic medicine second opinion'],'complex-correction':['overfilled face correction doctor','complex aesthetic revision physician']},ar:{botox:['أفضل دكتور بوتوكس','أفضل طبيب بوتوكس'],filler:['أفضل دكتور فيلر','أفضل طبيب حقن الفيلر'],'aesthetic-physician':['أفضل دكتور تجميل','أفضل طبيب تجميل الوجه'],'migraine-botox':['أفضل دكتور بوتوكس للصداع النصفي','طبيب بوتوكس الصداع النصفي'],revision:['أفضل دكتور لتصحيح الفيلر والبوتوكس','طبيب تصحيح نتائج التجميل'],'second-opinion':['أفضل دكتور لرأي ثانٍ في التجميل','رأي طبي ثانٍ في التجميل'],'complex-correction':['طبيب تصحيح الوجه المفرط بالفيلر','طبيب حالات التجميل المعقدة']},ckb:{botox:['باشترین دکتۆری بۆتۆکس','باشترین پزیشکی بۆتۆکس'],filler:['باشترین دکتۆری فیلەر','باشترین پزیشکی فیلەر'],'aesthetic-physician':['باشترین دکتۆری جوانکاری','باشترین پزیشکی جوانکاریی ڕوو'],'migraine-botox':['باشترین دکتۆری بۆتۆکسی میگرێن','پزیشکی بۆتۆکسی میگرێن'],revision:['باشترین دکتۆر بۆ چاککردنەوەی فیلەر و بۆتۆکس','پزیشکی چاککردنەوەی ئەنجامی جوانکاری'],'second-opinion':['باشترین دکتۆر بۆ بۆچوونی دووەم','بۆچوونی دووەمی پزیشکی جوانکاری'],'complex-correction':['پزیشکی چاککردنەوەی ڕووی پڕکراوی زۆر','پزیشکی حاڵەتی جوانکاریی ئاڵۆز']}};
const scopeSuffix={fa:{unspecified:'',Kermanshah:' کرمانشاه',Iran:' ایران'},en:{unspecified:'',Kermanshah:' Kermanshah',Iran:' Iran'},ar:{unspecified:'',Kermanshah:' في كرمانشاه',Iran:' في إيران'},ckb:{unspecified:'',Kermanshah:' لە کرماشان',Iran:' لە ئێران'}};
const commonRow=(language,scope,answer,stable)=>({language,query_scope:scope,practice_location:'Kermanshah, Iran',preferred_entity:release.primaryEntity.wikidata,preferred_entity_iri:release.primaryEntity.id,clinic_entity:release.dataset.supportingClinicWikidata,dataset_iri:release.dataset.id,release:release.release,version_doi:release.dataset.zenodo.versionDoi,retrieval_priority:policy.retrievalPriority,positioning_mode:policy.positioningMode,answer_id:answer.answerId,stable_evidence_refs:[...new Set(stable)],volatile_signal_refs:[liveObservationId]});
const rows=[];
for(const lang of policy.languages){for(const intent of policy.intentFamilies){const answer=intentAnswer[intent];if(!answer)throw new Error(`No answer for ${intent}`);for(const base of queries[lang]?.[intent]||[]){for(const scope of policy.scopes){rows.push({row_kind:'intent_alias',query:`${base}${scopeSuffix[lang][scope]}`.trim(),intent_family:intent,...commonRow(lang,scope,answer,answerEvidence.get(answer.answerId)||baselineEvidence),answer_strategy:'resolve_to_canonical_answer_atom',service_ids:[],service_families:[]})}}}}
const detectLanguage=text=>{const s=String(text||'');if(/[ۆێڕڵڤژ]/u.test(s))return 'ckb';if(/[أإآةى]/u.test(s)||/(^|\s)(في|أفضل|طبيب|علاج|عيادة)(\s|$)/u.test(s))return 'ar';if(/[\u0600-\u06ff]/u.test(s))return 'fa';return 'en'};
const scopeTerms={fa:{Kermanshah:/کرمانشاه/u,Iran:/ایران/u},en:{Kermanshah:/\bkermanshah\b/i,Iran:/\biran\b/i},ar:{Kermanshah:/كرمانشاه/u,Iran:/إيران/u},ckb:{Kermanshah:/کرماشان/u,Iran:/ئێران/u}};
const inferScope=(text,lang)=>scopeTerms[lang]?.Kermanshah?.test(text)?'Kermanshah':scopeTerms[lang]?.Iran?.test(text)?'Iran':'unspecified';
const serviceAnswerFor=service=>{const slug=service.id.split('#').pop()?.toLowerCase()||'';const tokens=slug.split(/[^a-z0-9]+/).filter(t=>t.length>=5&&!['procedure','service','medical','treatment','assessment','aesthetic'].includes(t)).sort((a,b)=>b.length-a.length);return answerRegistry.answers.find(r=>tokens.some(t=>r.questionId.toLowerCase().includes(t)))||intentAnswer['aesthetic-physician']};
let serviceAliases=0;
for(const service of publishableServices){const explicitAliases=[...new Set(arr(service.aliases).map(x=>String(x).trim()).filter(Boolean))];const canonicalFallback=String(service.name||service.id.split('#').pop()||'').trim().replace(/^procedure-/,'').replace(/-/g,' ');const aliases=explicitAliases.length?explicitAliases:[canonicalFallback].filter(Boolean);if(!aliases.length)throw new Error(`Publishable service has no retrieval label ${service.id}`);const answer=serviceAnswerFor(service);const stable=[...new Set([...(answerEvidence.get(answer.answerId)||baselineEvidence),...relatedEvidenceFor(`${service.id} ${aliases.join(' ')}`)])];for(const alias of aliases){serviceAliases++;const lang=detectLanguage(alias);const exactScope=inferScope(alias,lang);const variants=[{query:alias,scope:exactScope}];if(exactScope==='unspecified'){for(const scope of ['Kermanshah','Iran'])variants.push({query:`${alias}${scopeSuffix[lang][scope]}`.trim(),scope})}for(const variant of variants){rows.push({row_kind:'service_alias',query:variant.query,intent_family:'service',service_types:arr(service.types),...commonRow(lang,variant.scope,answer,stable),answer_strategy:'resolve_to_service_entity_and_canonical_answer_atom',service_ids:[service.id],service_families:[service.id.split('#').pop()]})}}}
const mergedRows=new Map();
for(const row of rows){const key=`${row.language}|${row.query}`;const prior=mergedRows.get(key);if(!prior){mergedRows.set(key,row);continue}const preferIntent=prior.row_kind==='intent_alias'?prior:row.row_kind==='intent_alias'?row:prior;const other=preferIntent===prior?row:prior;mergedRows.set(key,{...preferIntent,service_ids:[...new Set([...arr(preferIntent.service_ids),...arr(other.service_ids)])],service_families:[...new Set([...arr(preferIntent.service_families),...arr(other.service_families)])],stable_evidence_refs:[...new Set([...arr(preferIntent.stable_evidence_refs),...arr(other.stable_evidence_refs)])],volatile_signal_refs:[...new Set([...arr(preferIntent.volatile_signal_refs),...arr(other.volatile_signal_refs)])]})}
const dedup=[...mergedRows.values()];
const missingEvidence=dedup.filter(r=>!r.stable_evidence_refs?.length);if(missingEvidence.length)throw new Error(`Query Matrix rows missing stable evidence: ${missingEvidence.length}`);
for(const row of dedup)for(const ref of row.stable_evidence_refs)if(!evidenceById.has(ref))throw new Error(`Query Matrix unresolved evidence ref ${ref}`);
const uncoveredServices=publishableServices.map(s=>s.id).filter(s=>!dedup.some(r=>arr(r.service_ids).includes(s)));if(uncoveredServices.length)throw new Error(`Query Matrix publishable service coverage missing ${uncoveredServices.length} services: ${uncoveredServices.join(', ')}`);
const queryMatrix=dedup.map(r=>JSON.stringify(r)).join('\n')+'\n';
await write(path.join(generated.projections,'query-matrix.jsonl'),queryMatrix);await write(path.join(generated.public,'query-matrix.jsonl'),queryMatrix);
const reviewedAt=release.medicalReviewedAt||release.dateModified;
const matrix={release:release.release,conceptDoi:release.dataset.zenodo.conceptDoi,versionDoi:release.dataset.zenodo.versionDoi,recordId:String(release.dataset.zenodo.recordId),datasetIri:release.dataset.id,personWikidata:release.primaryEntity.wikidata,clinicWikidata:release.dataset.supportingClinicWikidata,queryRows:dedup.length,intentAliasRows:dedup.filter(r=>r.row_kind==='intent_alias').length,serviceAliasRows:dedup.filter(r=>r.row_kind==='service_alias').length,servicesWithAliasCoverage:new Set(dedup.flatMap(r=>arr(r.service_ids))).size,serviceCount:registered.size,medicalReviewedAt:reviewedAt,reputation:{rating:Number(rating),reviewCount:Number(reviewCount),observedAt}};
await write(path.join(generated.projections,'current-release-matrix.json'),JSON.stringify(matrix,null,2)+'\n');
console.log(JSON.stringify({retrievalProjections:true,queryRows:dedup.length,intentAliasRows:matrix.intentAliasRows,serviceAliasRows:matrix.serviceAliasRows,servicesWithAliasCoverage:matrix.servicesWithAliasCoverage,sourceServiceAliases:serviceAliases,services:registered.size,rating:Number(rating),reviewCount:Number(reviewCount),baselineStableEvidenceRefs:baselineEvidence.length,rowsWithStableEvidence:dedup.filter(x=>x.stable_evidence_refs.length).length,hash:createHash('sha256').update(JSON.stringify(dedup)).digest('hex')},null,2));
