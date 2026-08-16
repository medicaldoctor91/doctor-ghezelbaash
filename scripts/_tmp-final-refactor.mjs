import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir,rm,mkdir,copyFile,stat} from 'node:fs/promises';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';

const root=process.cwd();
const cmd=process.argv[2];
const read=p=>readFile(path.join(root,p),'utf8');
const write=(p,s)=>writeFile(path.join(root,p),s);
const readJson=async p=>JSON.parse(await read(p));
const writeJson=(p,v)=>write(p,JSON.stringify(v,null,2)+'\n');
const fail=m=>{throw new Error(m)};
const replaceOnce=(source,needle,replacement,label=needle)=>{const first=source.indexOf(needle);if(first<0)fail(`Missing replacement target: ${label}`);if(source.indexOf(needle,first+needle.length)>=0)fail(`Replacement target is not unique: ${label}`);return source.slice(0,first)+replacement+source.slice(first+needle.length)};
const replaceRange=(source,start,end,replacement,label)=>{const a=source.indexOf(start);if(a<0)fail(`Missing range start: ${label}`);const b=source.indexOf(end,a+start.length);if(b<0)fail(`Missing range end: ${label}`);return source.slice(0,a)+replacement+source.slice(b)};
const enDate=value=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));
const sha=b=>createHash('sha256').update(b).digest('hex');

function patchDatasetVisibleSegment(content,release,{placeholders=false}={}){
  const history=release.dataset.zenodo.releaseHistory||[],currentIndex=history.findIndex(row=>row.release===release.release),previous=currentIndex>0?history[currentIndex-1]:null;
  const startToken='The project publishes canonical entity identifiers';
  const start=content.indexOf(startToken);if(start<0)fail('Dataset visible current-release paragraph missing');
  const hfUrl='https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data';
  const hf=content.indexOf(hfUrl,start);if(hf<0)fail('Dataset visible Hugging Face boundary missing');
  let segment=content.slice(start,hf);
  if(previous){
    segment=segment.replaceAll(`Version ${previous.release}`,`Version ${release.release}`)
      .replaceAll(`version ${previous.release}`,`version ${release.release}`)
      .replaceAll(`https://doi.org/${previous.versionDoi}`,`https://doi.org/${release.dataset.zenodo.versionDoi}`)
      .replaceAll(previous.versionDoi,release.dataset.zenodo.versionDoi)
      .replaceAll(encodeURIComponent(previous.versionDoi),encodeURIComponent(release.dataset.zenodo.versionDoi));
  }
  if(!segment.includes(`Version ${release.release}`)||!segment.includes(release.dataset.zenodo.versionDoi))fail('Dataset visible release correction did not converge');
  if(placeholders){
    segment=segment.replaceAll(`https://doi.org/${release.dataset.zenodo.versionDoi}`,'https://doi.org/{{CURRENT_VERSION_DOI}}')
      .replaceAll(encodeURIComponent(release.dataset.zenodo.versionDoi),'{{CURRENT_VERSION_DOI_URLENCODED}}')
      .replaceAll(release.dataset.zenodo.versionDoi,'{{CURRENT_VERSION_DOI}}')
      .replaceAll(`Version ${release.release}`,'Version {{CURRENT_RELEASE}}')
      .replaceAll(`version ${release.release}`,'version {{CURRENT_RELEASE}}')
      .replaceAll(enDate(release.dateModified),'{{CURRENT_RELEASE_DATE_EN}}')
      .replaceAll(enDate(release.medicalReviewedAt),'{{MEDICAL_REVIEW_DATE_EN}}');
  }
  return content.slice(0,start)+segment+content.slice(hf);
}

async function contentSlice(){
  const release=await readJson('src/data/release.json');
  const assembled=await assembleCanonicalContent({root});
  if(!assembled.names.length)fail('Current content assembler produced no source');
  let page=patchDatasetVisibleSegment(assembled.content,release,{placeholders:true});
  const reputation=/<div\b(?=[^>]*\bid=["']google-maps-clinic-reputation-current["'])[^>]*>[\s\S]*?<\/div>/i;
  const hits=page.match(new RegExp(reputation.source,'gi'))||[];if(hits.length!==1)fail(`Expected one reputation slot, found ${hits.length}`);
  page=page.replace(reputation,'<div class="hero-caption-reputation" id="google-maps-clinic-reputation-current" data-live-reputation-slot></div>');
  const sourceDir=path.join(root,'src/content-source');
  await writeFile(path.join(sourceDir,'page.md'),page);
  for(const name of await readdir(sourceDir))if(name!=='page.md'&&/\.(?:md|html)$/i.test(name))await rm(path.join(sourceDir,name));

  const assembler=await read('scripts/_tmp-assembler-target.mjs');
  await write('scripts/lib/assemble-content.mjs',assembler);

  const services=await readJson('src/data/service-registry.json');delete services.canonicalSource;await writeJson('src/data/service-registry.json',services);
  const evidence=await readJson('src/data/evidence-registry.json');delete evidence.release;await writeJson('src/data/evidence-registry.json',evidence);

  let validateEvidence=await read('scripts/validate-evidence.mjs');
  validateEvidence=replaceOnce(validateEvidence,"if(snapshot.release!==release.release||registry.release!==release.release||volatile.release!==release.release)fail('Evidence/volatile release drift');","if(snapshot.release!==release.release||volatile.release!==release.release)fail('Evidence snapshot/volatile release drift');",'evidence release ownership');
  await write('scripts/validate-evidence.mjs',validateEvidence);

  let releaseValidator=await read('scripts/validate-release-contract.mjs');
  if(!releaseValidator.includes("from './lib/assemble-content.mjs'"))releaseValidator=releaseValidator.replace("import {readFile,readdir} from 'node:fs/promises';","import {readFile} from 'node:fs/promises';\nimport {assembleCanonicalContent} from './lib/assemble-content.mjs';");
  const oldVisible="const visible=await readJson('src/data/visible-contract.json');\nconst sourceDir=path.join(root,'src/content-source');\nconst sourceNames=(await readdir(sourceDir)).filter(name=>/\\.(html|md)$/i.test(name)).sort();\nlet content='';for(const name of sourceNames)content+=await readFile(path.join(sourceDir,name),'utf8');";
  releaseValidator=replaceOnce(releaseValidator,oldVisible,"const visible=await readJson('src/data/visible-contract.json');\nconst {content}=await assembleCanonicalContent({root,graph});",'release validator canonical content source');
  releaseValidator=replaceOnce(releaseValidator,"if(!content.includes('google-maps-clinic-reputation-current')||!content.includes(`https://doi.org/${Z.versionDoi}`))fail('Visible current reputation/Version DOI surface is incomplete');","if(!content.includes('google-maps-clinic-reputation-current')||!content.includes(`Version ${R}`)||!content.includes(`https://doi.org/${Z.versionDoi}`))fail('Visible current release/reputation surface is incomplete');",'visible release semantics');
  await write('scripts/validate-release-contract.mjs',releaseValidator);

  let bridge=await read('scripts/verify-github-pages-bridge.mjs');bridge=bridge.replaceAll('__legacy_missing_bridge_proof__','__missing_bridge_probe__');await write('scripts/verify-github-pages-bridge.mjs',bridge);
  console.log(JSON.stringify({slice:'content',canonicalSource:'src/content-source/page.md',sourceFragmentsRemoved:assembled.names.length,serviceRegistryCurrent:true,evidenceRegistryReleaseNeutral:true}));
}

async function writerSlice(){
  let gen=await read('scripts/generate-projections.mjs');
  if(!gen.includes("./lib/knowledge-xml.mjs"))gen=gen.replace("import { assembleCanonicalContent } from './lib/assemble-content.mjs';","import { assembleCanonicalContent } from './lib/assemble-content.mjs';\nimport { buildKnowledgeXml } from './lib/knowledge-xml.mjs';\nimport { normalizeGoogleSupportGraphDoc } from './lib/google-support-graph.mjs';");

  const supportPattern=/const supportRaw=`\$\{JSON\.stringify\(\{'@context':graph\['@context'\],'@graph':supportNodes\}\)\}\\n`;\nif\(Buffer\.byteLength\(supportRaw\)>supportProfile\.maxBytes\) throw new Error\(`Support graph \$\{Buffer\.byteLength\(supportRaw\)\} exceeds \$\{supportProfile\.maxBytes\}`\);\nawait writeFile\(path\.join\(semantic,'support-graph\.json'\),supportRaw\);/;
  const supportReplacement="const supportDoc=normalizeGoogleSupportGraphDoc({'@context':graph['@context'],'@graph':supportNodes});\nconst supportRaw=`${JSON.stringify(supportDoc)}\\n`;\nif(Buffer.byteLength(supportRaw)>supportProfile.maxBytes) throw new Error(`Support graph ${Buffer.byteLength(supportRaw)} exceeds ${supportProfile.maxBytes}`);\nawait writeFile(path.join(semantic,'support-graph.json'),supportRaw);";
  if(!supportPattern.test(gen))fail('Support graph writer target not found');gen=gen.replace(supportPattern,supportReplacement);

  const knowledgeStart='// ---- Hierarchical XML projection.';
  const knowledgeEnd='// ---- True semantic Markdown and passage-oriented LLM projection.';
  const knowledgeBlock=`// ---- Hierarchical XML projection: one writer, complete before route generation.\nconst intentGuideText=await readFile(path.join(data,'templates/llms.template.txt'),'utf8');\nconst knowledge=buildKnowledgeXml({release,graph,evidenceRegistry,intentGuideText});\nawait writeFile(path.join(projections,'knowledge.xml'),knowledge);\n\n`;
  gen=replaceRange(gen,knowledgeStart,knowledgeEnd,knowledgeBlock+knowledgeEnd,'knowledge XML writer');

  gen=replaceOnce(gen,"const llms=llmsTemplate\n","let llms=llmsTemplate\n",'llms mutable generated buffer');
  const unresolved="if(/{{[^}]+}}/.test(llms)) throw new Error('Unresolved llms.txt template placeholder');\nawait writeFile(path.join(projections,'llms.txt'),llms);";
  const normalized="if(/{{[^}]+}}/.test(llms)) throw new Error('Unresolved llms.txt template placeholder');\nconst evidenceTiers=evidenceRegistry.tiers||{};for(const tier of ['A','B','C'])if(typeof evidenceTiers[tier]!=='string'||!evidenceTiers[tier])throw new Error(`llms.txt evidence tier ${tier} definition missing`);\nconst evidenceTierLine=`- Evidence tiers: Tier A = ${evidenceTiers.A}; Tier B = ${evidenceTiers.B}; Tier C = ${evidenceTiers.C}.`;\nconst evidenceTierPattern=/^- Evidence tiers:.*$/m;if(!evidenceTierPattern.test(llms))throw new Error('llms.txt evidence-tier declaration missing');\nllms=llms.replace(evidenceTierPattern,evidenceTierLine);\nawait writeFile(path.join(projections,'llms.txt'),llms);";
  gen=replaceOnce(gen,unresolved,normalized,'llms writer finalization');
  await write('scripts/generate-projections.mjs',gen);

  await write('src/pages/knowledge.xml.ts',"import body from '../data/projections/knowledge.xml?raw';\nimport { staticResponse } from '../lib/static-endpoint';\nexport const prerender=true;\nexport function GET(){return staticResponse(body,'application/xml; charset=utf-8');}\n");
  await write('src/pages/llms.txt.ts',"import body from '../data/projections/llms.txt?raw';\nimport { staticResponse } from '../lib/static-endpoint';\nexport const prerender=true;\nexport function GET(){return staticResponse(body,'text/plain; charset=utf-8');}\n");

  let layout=await read('src/layouts/BaseLayout.astro');
  const layoutStart="const nodeTypes=(node:JsonNode)=>";
  const layoutEnd="const googleSupportGraphRaw=isMain?normalizeGoogleSupportGraph(supportGraphRaw):supportGraphRaw;";
  const a=layout.indexOf(layoutStart),b=layout.indexOf(layoutEnd);if(a<0||b<0)fail('BaseLayout support normalization target missing');
  layout=layout.slice(0,a)+"const googleSupportGraphRaw=supportGraphRaw;"+layout.slice(b+layoutEnd.length);
  layout=layout.replace("type JsonNode=Record<string,any>;\n",'');
  await write('src/layouts/BaseLayout.astro',layout);

  let headers=await read('src/data/templates/headers.template');
  const block=(route,media,cache,digest=true)=>`\n/${route}\n  Content-Type: ${media}\n  X-Robots-Tag: index, follow, max-snippet:-1\n  X-Robots-Tag: googlebot: noindex, follow\n  Cache-Control: ${cache}\n  Cloudflare-CDN-Cache-Control: ${cache}\n  Link: <https://www.ghezelbaash.ir/${route}>; rel="canonical", <https://www.ghezelbaash.ir/graph.jsonld#dataset>; rel="describedby", <https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah>; rel="about"\n${digest?'  Repr-Digest: sha-256=:__DIGEST__:\n':''}  Access-Control-Allow-Origin: *\n  Access-Control-Expose-Headers: Link, Repr-Digest, Content-Signal\n  Cross-Origin-Resource-Policy: cross-origin\n`;
  for(const spec of [['query-matrix.jsonl','application/jsonl; charset=utf-8','public, max-age=3600, must-revalidate',true],['live-observations.jsonld','application/ld+json; charset=utf-8','public, max-age=0, must-revalidate',true],['current-release-matrix.json','application/json; charset=utf-8','public, max-age=0, must-revalidate',true],['live-serving-attestation.json','application/json; charset=utf-8','public, max-age=0, must-revalidate',false]]){
    if(headers.includes(`\n/${spec[0]}\n`))fail(`Header template unexpectedly already contains ${spec[0]}`);headers+=block(...spec);
  }
  await write('src/data/templates/headers.template',headers);

  let finalizer=await read('scripts/finalize-dist.mjs');
  const start="const esc=s=>s.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&');";
  const end="ensureBlock('live-serving-attestation.json','application/json; charset=utf-8','public, max-age=0, must-revalidate',false);\n";
  const sa=finalizer.indexOf(start),sb=finalizer.indexOf(end,sa);if(sa<0||sb<0)fail('Finalizer header fallback range missing');finalizer=finalizer.slice(0,sa)+finalizer.slice(sb+end.length);
  finalizer=replaceOnce(finalizer,"const mutateRoute=(route,fn)=>{const lines=headers.split('\\n'),i=lines.findIndex(x=>x===`/${route}`);if(i<0)return;","const mutateRoute=(route,fn)=>{const lines=headers.split('\\n'),i=lines.findIndex(x=>x===`/${route}`);if(i<0)throw new Error(`Missing canonical header block /${route}`);",'finalizer positive header contract');
  await write('scripts/finalize-dist.mjs',finalizer);
  console.log(JSON.stringify({slice:'writers',knowledgeXml:'single-writer',llms:'single-writer',supportGraph:'generator-normalized',headers:'template-authoritative'}));
}

async function truthSlice(){
  const release=await readJson('src/data/release.json');
  const old=release.identityFingerprint;if(!old)fail('Expected stored identity fingerprint before normalization');
  Object.assign(release.primaryEntity,{irimc:old.irimc,orcid:old.orcid,openAlex:old.openAlex,semanticScholar:old.semanticScholar,googleScholar:old.googleScholar,verifiedWebIdentityMesh:old.verifiedWebIdentityMesh});
  delete release.identityFingerprint;delete release.machineIndexingPolicy;delete release.evidencePolicy;await writeJson('src/data/release.json',release);
  const inv=await readJson('src/data/release-invariants.json');delete inv.identityFingerprintSha256;await writeJson('src/data/release-invariants.json',inv);

  let gen=await read('scripts/generate-projections.mjs');
  if(!gen.includes("./lib/release-identity.mjs"))gen=gen.replace("import { normalizeGoogleSupportGraphDoc } from './lib/google-support-graph.mjs';","import { normalizeGoogleSupportGraphDoc } from './lib/google-support-graph.mjs';\nimport { hashIdentityFingerprint } from './lib/release-identity.mjs';");
  gen=replaceOnce(gen,"const identityFingerprintSha256=createHash('sha256').update(JSON.stringify(release.identityFingerprint)).digest('hex');","const identityFingerprintSha256=hashIdentityFingerprint(release);",'derived identity hash in projections');
  await write('scripts/generate-projections.mjs',gen);

  let finalizer=await read('scripts/finalize-dist.mjs');
  if(!finalizer.includes("./lib/release-identity.mjs"))finalizer=finalizer.replace("import {resolveDeterministicBuildInstant} from './lib/deterministic-build-time.mjs';","import {resolveDeterministicBuildInstant} from './lib/deterministic-build-time.mjs';\nimport {deriveIdentityFingerprint,hashIdentityFingerprint} from './lib/release-identity.mjs';");
  finalizer=replaceOnce(finalizer,"identityFingerprint:{sha256:inv.identityFingerprintSha256,value:release.identityFingerprint},","identityFingerprint:{sha256:hashIdentityFingerprint(release),value:deriveIdentityFingerprint(release)},",'derived manifest identity fingerprint');
  await write('scripts/finalize-dist.mjs',finalizer);

  let validator=await read('scripts/validate-release-contract.mjs');
  if(!validator.includes("./lib/release-identity.mjs"))validator=validator.replace("import {assembleCanonicalContent} from './lib/assemble-content.mjs';","import {assembleCanonicalContent} from './lib/assemble-content.mjs';\nimport {assertIdentityFingerprintSource} from './lib/release-identity.mjs';");
  validator=validator.replace("  'googlebotReservedResponseHeaderBytes','googlebotSafetyMarginBytes','headAlternateNameMax','identityFingerprintSha256',\n","  'googlebotReservedResponseHeaderBytes','googlebotSafetyMarginBytes','headAlternateNameMax',\n");
  validator=replaceOnce(validator,"const Z=release.dataset?.zenodo;","const Z=release.dataset?.zenodo;\nassertIdentityFingerprintSource(release);",'identity source validation');
  await write('scripts/validate-release-contract.mjs',validator);

  let hfPolicy=await readJson('.release/policy/hf-authority-contract.json');delete hfPolicy.forbiddenRegressions;if(!hfPolicy.configs.includes('query_matrix'))hfPolicy.configs.splice(1,0,'query_matrix');await writeJson('.release/policy/hf-authority-contract.json',hfPolicy);

  let hf=await read('scripts/prepare-huggingface-distribution.mjs');
  const legacyStart='const fix=text=>';
  const legacyEnd="await writeFile(path.join(enrichmentDir,'README.md'),`# AI/retrieval positioning layer";
  const ls=hf.indexOf(legacyStart),le=hf.indexOf(legacyEnd,ls);if(ls<0||le<0)fail('HF compatibility block boundaries missing');
  const canonical=`const enrichmentDir=path.join(hub,'enrichment');await mkdir(enrichmentDir,{recursive:true});\nconst readRequired=async file=>JSON.parse(await readFile(path.join(enrichmentDir,file),'utf8'));\nconst strategyPath=path.join(enrichmentDir,'positioning-strategy.json');const strategy=await readRequired('positioning-strategy.json');\nObject.assign(strategy,{file_name:'positioning-strategy.json',version:release.release,last_updated:release.dateModified,artifact_role:'retrieval_positioning_strategy',canonical_dataset_iri:release.dataset.id,release_version_doi:z.versionDoi,retrieval_priority:policy.retrievalPriority,positioning_mode:policy.positioningMode,preferred_entity:release.primaryEntity.wikidata,governance:'Maximum retrieval positioning layer anchored to the physician entity, canonical answer atoms and release-faithful Core. Stable factual fields resolve to Core; volatile reputation signals resolve to the separately synchronized live_observations config.'});await writeFile(strategyPath,JSON.stringify(strategy,null,2)+'\\n');\nconst knowledgePath=path.join(enrichmentDir,'aesthetic_medicine_knowledge_kermanshah_fa.json');const knowledge=await readRequired('aesthetic_medicine_knowledge_kermanshah_fa.json');Object.assign(knowledge,{last_updated:release.dateModified,artifact_role:'ai_retrieval_enrichment',canonical_dataset_iri:release.dataset.id,release_version:release.release,zenodo_version_doi:z.versionDoi,retrieval_priority:policy.retrievalPriority,positioning_mode:policy.positioningMode,preferred_entity:release.primaryEntity.wikidata});await writeFile(knowledgePath,JSON.stringify(knowledge,null,2)+'\\n');\nconst instructionPath=path.join(enrichmentDir,'instruction_examples_fa_market_positioning.jsonl');const instructionRaw=(await readFile(instructionPath,'utf8')).trim();if(!instructionRaw)throw new Error('HF positioning instruction source is empty');const instructions=instructionRaw.split('\\n').filter(Boolean).map((line,index)=>{const row=JSON.parse(line);Object.assign(row,{artifact_role:'retrieval_positioning_example',canonical_dataset_iri:release.dataset.id,release:release.release,example_id:\`positioning-\${String(index+1).padStart(3,'0')}\`,preferred_entity:release.primaryEntity.wikidata,retrieval_priority:policy.retrievalPriority,positioning_mode:policy.positioningMode});return row});await writeFile(instructionPath,instructions.map(JSON.stringify).join('\\n')+'\\n');\nif(instructions.length){const columns=[...new Set(instructions.flatMap(row=>Object.keys(row)))],cell=v=>\`"\${(v==null?'':typeof v==='object'?JSON.stringify(v):String(v)).replaceAll('"','""')}"\`,csv=[columns.map(cell).join(','),...instructions.map(row=>columns.map(k=>cell(row[k])).join(','))].join('\\n')+'\\n';await writeFile(path.join(enrichmentDir,'instruction_examples_fa_market_positioning.csv'),csv)}\n`;
  hf=hf.slice(0,ls)+canonical+hf.slice(le);
  hf=hf.replace("for(const forbidden of policy.forbiddenRegressions)if(allText.includes(forbidden.toLowerCase()))throw new Error(`HF regression wording remains: ${forbidden}`);","");
  hf=hf.replace("const allText=(await Promise.all((await readdir(enrichmentDir)).filter(f=>/\\.(?:json|jsonl|md|csv)$/i.test(f)).map(f=>readFile(path.join(enrichmentDir,f),'utf8')))).join('\\n').toLowerCase();","");
  await write('scripts/prepare-huggingface-distribution.mjs',hf);

  let promote=await read('scripts/promote-release.mjs');
  promote=promote.replace("for(const file of ['src/data/volatile-facts.json','src/data/evidence-snapshot.json','src/data/evidence-registry.json']){const value=await readJson(file);if(Object.hasOwn(value,'release'))value.release=next.release;await writeJson(file,value)}","for(const file of ['src/data/volatile-facts.json','src/data/evidence-snapshot.json']){const value=await readJson(file);value.release=next.release;await writeJson(file,value)}");
  const headStart="let head=await readFile('src/data/templates/main-head.html','utf8');";
  const citationStart="let citation=await readFile('CITATION.cff','utf8');";
  const hs=promote.indexOf(headStart),cs=promote.indexOf(citationStart,hs);if(hs<0||cs<0)fail('Promotion text-patch range missing');promote=promote.slice(0,hs)+promote.slice(cs);
  const svgStart="for(const file of ['public/favicon.svg'";
  const logStart="console.log(JSON.stringify({promoted:true";
  const ss=promote.indexOf(svgStart),lg=promote.indexOf(logStart,ss);if(ss>=0&&lg>=0)promote=promote.slice(0,ss)+promote.slice(lg);
  await write('scripts/promote-release.mjs',promote);

  let readme=await read('README.md');
  const architecture='## Source architecture\n\nThis repository builds one canonical static physician landing page plus synchronized machine-readable representations. `src/content-source/page.md`, `src/data/semantic/knowledge-graph.jsonld`, the focused registries/policies, media assets and `src/data/volatile-facts.json` are canonical inputs. Generators create deterministic projections; Astro renders the single human-facing page; finalization binds only post-build integrity data. Google Places reputation is the only routine mutable public lane. Release-only publication tooling is separate from the normal build path.\n\n';
  if(!readme.includes('## Source architecture'))readme=architecture+readme;await write('README.md',readme);
  console.log(JSON.stringify({slice:'truth',releaseIdentity:'derived-fingerprint',releaseJson:'leaner',hfPolicy:'positive-only',promotion:'structured-current-source'}));
}

async function updateVisibleContract(){
  const result=JSON.parse(await readFile('/tmp/visible-contract.json','utf8'));
  const visible=await readJson('src/data/visible-contract.json');
  visible.visibleDomSha256=result.sha256;visible.visibleDomRecords=result.records;visible.visibleDomBytes=result.bytes;await writeJson('src/data/visible-contract.json',visible);
}

async function snapshot(dir,out){
  const walk=async(d,p='')=>{let rows=[];for(const entry of (await readdir(d,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const abs=path.join(d,entry.name),rel=p?`${p}/${entry.name}`:entry.name;if(entry.isDirectory())rows.push(...await walk(abs,rel));else if(entry.isFile()){const b=await readFile(abs);rows.push({rel,bytes:b.length,sha256:sha(b)});}}return rows};
  await writeFile(out,JSON.stringify(await walk(path.resolve(dir)),null,2)+'\n');
}

async function compareSnapshots(beforeFile,afterFile,{allowed=[]}={}){
  const before=JSON.parse(await readFile(beforeFile,'utf8')),after=JSON.parse(await readFile(afterFile,'utf8')),a=new Map(before.map(x=>[x.rel,x])),b=new Map(after.map(x=>[x.rel,x])),changed=[];
  for(const rel of new Set([...a.keys(),...b.keys()])){const x=a.get(rel),y=b.get(rel);if(!x||!y||x.sha256!==y.sha256||x.bytes!==y.bytes)changed.push(rel)}
  const unexpected=changed.filter(rel=>!allowed.includes(rel));if(unexpected.length)fail(`Unexpected DIST delta: ${unexpected.join(', ')}`);
  console.log(JSON.stringify({comparison:'PASS',changed,allowed}));
}

async function verifyIntendedIndex(beforePath,afterPath){
  const release=await readJson('src/data/release.json');let expected=await readFile(beforePath,'utf8');expected=patchDatasetVisibleSegment(expected,release,{placeholders:false}).replaceAll('آخرین دریافت از Google:','آخرین تغییر ثبت‌شده در Google:');const actual=await readFile(afterPath,'utf8');if(expected!==actual){const e=sha(expected),a=sha(actual);fail(`Index changed outside approved defects expected=${e} actual=${a}`)}console.log(JSON.stringify({indexDelta:'APPROVED_ONLY',sha256:sha(actual)}));
}

if(cmd==='content')await contentSlice();
else if(cmd==='writers')await writerSlice();
else if(cmd==='truth')await truthSlice();
else if(cmd==='visible')await updateVisibleContract();
else if(cmd==='snapshot')await snapshot(process.argv[3],process.argv[4]);
else if(cmd==='compare')await compareSnapshots(process.argv[3],process.argv[4],{allowed:process.argv.slice(5)});
else if(cmd==='verify-index')await verifyIntendedIndex(process.argv[3],process.argv[4]);
else fail(`Unknown refactor command ${cmd}`);
