import path from 'node:path';
import {readFile,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';
import {analyzeGraphClosure} from './lib/graph-integrity.mjs';
import {assembleCssSource,RENDER_CALIBRATION_SLOT,RENDER_CALIBRATION_WIDTHS} from '../src/lib/css-source.mjs';

const root=process.cwd(),data=path.join(root,'src/data');
const readJson=async p=>JSON.parse(await readFile(path.join(root,p),'utf8'));
const fail=m=>{throw new Error(m)};
const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
const id=v=>typeof v==='string'?v:v?.['@id'];

const release=await readJson('src/data/release.json'),releaseInvariants=await readJson('src/data/release-invariants.json'),graph=await readJson('src/data/semantic/knowledge-graph.jsonld'),visible=await readJson('src/data/visible-contract.json'),services=await readJson('src/data/service-registry.json'),answers=await readJson('src/data/answer-registry.json'),authority=await readJson('.release/policy/authority-surface-contract.json'),platform=await readJson('.release/policy/platform-contract.json'),headProfile=await readJson('src/data/semantic/head-profile.json'),hf=authority.surfaces.huggingFace;

const requiredFiles=[
  'CITATION.cff','codemeta.json','src/content-source/page.md','src/layouts/BaseLayout.astro','src/lib/css-delivery.mjs','src/lib/css-source.mjs','src/lib/google-semantic-html.mjs','src/lib/semantic-projection.mjs','src/lib/hero-image-contract.mjs','src/lib/release-tokens.mjs',
  'src/data/semantic/head-ids.json','src/data/semantic/head-profile.json','src/data/semantic/support-ids.json','src/data/semantic/shapes.ttl','src/data/evidence-registry.json','src/data/evidence-snapshot.json','src/data/volatile-facts.json','src/data/render-calibration.json',
  '.release/policy/platform-contract.json','.release/policy/authority-surface-contract.json','scripts/lib/css-rules.mjs','scripts/lib/graph-integrity.mjs','scripts/lib/release-graph.mjs','scripts/lib/projection-context.mjs',
  'scripts/lib/projections/page-assets.mjs','scripts/lib/projections/graph-projections.mjs','scripts/lib/projections/semantic-corpus.mjs','scripts/lib/projections/retrieval-corpus.mjs','scripts/lib/projections/contact-discovery.mjs',
  'scripts/apply-render-calibration.mjs','scripts/generate-retrieval-projections.mjs','scripts/generate-descriptors.mjs','scripts/finalize-dist.mjs','scripts/promote-release.mjs','scripts/write-release-attestation.mjs','scripts/zenodo_release.py','scripts/validate-media-references.mjs','scripts/validate-release-contract.mjs','scripts/validate-semantic-html.mjs','scripts/platform-contract.mjs','scripts/huggingface.mjs'
];
for(const f of requiredFiles)await access(path.join(root,f));

const readSource=file=>readFile(path.join(root,file),'utf8');
const [pkg,baseGenerator,retrievalGenerator,descriptorGenerator,finalizer,mediaReferenceValidator,calibrationWriter,hfVerifier,documentHead,baseLayout,pageAssetsCompiler,graphCompiler,semanticCompiler,retrievalCompiler,contactCompiler]=await Promise.all([
  readJson('package.json'),
  readSource('scripts/generate-projections.mjs'),
  readSource('scripts/generate-retrieval-projections.mjs'),
  readSource('scripts/generate-descriptors.mjs'),
  readSource('scripts/finalize-dist.mjs'),
  readSource('scripts/validate-media-references.mjs'),
  readSource('scripts/apply-render-calibration.mjs'),
  readSource('scripts/huggingface.mjs'),
  readSource('src/components/DocumentHead.astro'),
  readSource('src/layouts/BaseLayout.astro'),
  readSource('scripts/lib/projections/page-assets.mjs'),
  readSource('scripts/lib/projections/graph-projections.mjs'),
  readSource('scripts/lib/projections/semantic-corpus.mjs'),
  readSource('scripts/lib/projections/retrieval-corpus.mjs'),
  readSource('scripts/lib/projections/contact-discovery.mjs'),
]);
const projectionCompilers=[pageAssetsCompiler,graphCompiler,semanticCompiler,retrievalCompiler,contactCompiler];
const projectionCompilerSource=projectionCompilers.join('\n');
const scriptSteps=name=>String(pkg.scripts?.[name]||'').split('&&').map(x=>x.trim()).filter(Boolean);
const hasStep=(name,needle)=>scriptSteps(name).some(step=>step===needle||step.includes(needle));

if(pkg.scripts?.['validate:release-contract']!=='node scripts/validate-release-contract.mjs')fail('Generic release-contract validator wiring missing');
if(!hasStep('prepare:generated','validate:media-references')||!hasStep('prepare:generated','rdf:generate')||!hasStep('prepare:generated','npm run generate'))fail('Generated preparation architecture drift');
if(pkg.scripts?.['validate:media-references']!=='node scripts/validate-media-references.mjs')fail('Read-only media reference validator wiring missing');
if(/\bwriteFile\b|\bappendFile\b/.test(mediaReferenceValidator))fail('Media reference validation must never rewrite source');
if(calibrationWriter.includes('src/styles/global.css')||!calibrationWriter.includes('renderCalibrationCss')||!calibrationWriter.includes('rename(temporaryPath,canonicalPath)'))fail('Render calibration writer must update only canonical JSON through the shared renderer');
if(hfVerifier.includes('/raw/main/README.md')||!hfVerifier.includes('HF organization profile authority token missing'))fail('Hugging Face profile verifier is not bound to the public organization profile surface');

const generateSteps=scriptSteps('generate');
for(const expected of ['node scripts/generate-projections.mjs','node scripts/generate-retrieval-projections.mjs','node scripts/generate-descriptors.mjs'])if(!generateSteps.includes(expected))fail(`Canonical generator missing ${expected}`);
if(generateSteps.indexOf('node scripts/generate-projections.mjs')>generateSteps.indexOf('node scripts/generate-retrieval-projections.mjs')||generateSteps.indexOf('node scripts/generate-retrieval-projections.mjs')>generateSteps.indexOf('node scripts/generate-descriptors.mjs'))fail('Canonical generator order drift');
if(/\b(?:readFile|writeFile|readdir|unlink)\b/.test(baseGenerator))fail('Projection orchestrator contains artifact implementation I/O');
for(const symbol of ['compilePageAssets','compileGraphProjections','compileSemanticCorpus','compileRetrievalCorpus','compileContactDiscovery'])if(!baseGenerator.includes(symbol))fail(`Projection orchestrator missing compiler owner: ${symbol}`);
if(!baseGenerator.includes('loadProjectionContext'))fail('Projection orchestrator does not share canonical projection context');

if(pkg.scripts?.['descriptors:finalize']!=='node scripts/generate-descriptors.mjs --dist dist')fail('DIST descriptor finalization stage missing');
if(pkg.scripts?.['release:attest']!=='node scripts/write-release-attestation.mjs'||!hasStep('release','npm run release:attest'))fail('Release attestation is not a mandatory release stage');
const releaseSteps=scriptSteps('release');
if(releaseSteps.indexOf('npm run release:attest')<releaseSteps.indexOf('npm run validate:current-context')||releaseSteps.indexOf('npm run release:attest')>releaseSteps.indexOf('node scripts/package-dist.mjs'))fail('Release attestation ordering drift');
for(const required of ['astro build','npm run indexnow:prepare','npm run descriptors:finalize','node scripts/finalize-dist.mjs'])if(!hasStep('build',required))fail(`Build DAG missing ${required}`);
if(retrievalGenerator.includes('public/current-release-matrix.json'))fail('Current release matrix has multiple deployable writers');
if(/\bservice_id\s*:|\bservice_family\s*:/.test(retrievalGenerator))fail('Query Matrix legacy scalar service schema remains in generator');
if(!finalizer.includes("projections/current-release-matrix.json")||!finalizer.includes('writeFile(currentMatrixPath'))fail('Finalizer is not the sole current-release-matrix DIST composer');
if(/\bmutateRoute\b|\bsetDigest\b/.test(finalizer))fail('Finalizer still carries post-definition header policy patching');
if(documentHead.includes("replace(viewportTag")||documentHead.includes("replace(heroPreloadTag"))fail('DocumentHead still reorders the canonical Head template');
if(!baseLayout.includes("../lib/css-delivery.mjs")||!pageAssetsCompiler.includes("../../../src/lib/css-delivery.mjs"))fail('CSS delivery contract is not shared by Layout and page-assets compiler');

for(const name of ['datapackage.json','croissant.json','dcat.ttl','void.ttl','linkset.json']){
  if(projectionCompilerSource.includes(`writeFile(path.join(projections,'${name}')`))fail(`Projection compiler illegally writes descriptor ${name}`);
  if(finalizer.includes(`writeFile(path.join(dist,'${name}')`))fail(`Finalizer illegally rewrites descriptor ${name}`);
  if(!descriptorGenerator.includes(`writeFile(out('${name}')`))fail(`Descriptor generator missing canonical writer for ${name}`);
}
for(const token of ['const datasetLandingPage=`https://doi.org/${release.dataset.zenodo.versionDoi}`','foaf:homepage <${datasetLandingPage}>','dcat:landingPage <${datasetLandingPage}>','homepage:datasetLandingPage','url:datasetLandingPage'])if(!descriptorGenerator.includes(token))fail(`Dataset landing-page role drift in descriptor generator: ${token}`);

if(authority.identitySource!=='src/data/release.json'||platform.canonicalUrl!==release.canonicalUrl||platform.repository!==release.dataset.github.repository.replace(/^https:\/\/github\.com\//,''))fail('Platform/authority policy source drift');
if(!release.medicalReviewedAt)fail('Explicit medicalReviewedAt missing');
if(release.dataset.zenodo.conceptDoi===release.dataset.zenodo.versionDoi)fail('Concept DOI collapsed with current Version DOI');

const nodes=graph['@graph']||[],byId=new Map(nodes.filter(n=>n?.['@id']).map(n=>[n['@id'],n])),person=byId.get(release.primaryEntity.id),clinic=byId.get(release.clinic.id),dataset=byId.get(release.dataset.id),page=byId.get(`${release.canonicalUrl}#webpage`);
if(!person||!clinic||!dataset||!page)fail('Person/Clinic/Dataset/ProfilePage graph constitution broken');
if(id(dataset.creator)!==release.primaryEntity.id||id(dataset.publisher)!==release.primaryEntity.id)fail('Dataset creator/publisher is not the physician');
if(Object.hasOwn(release.dataset,'wikidata')||arr(dataset.sameAs).length)fail('Dataset external identity-equivalence contract must remain absent');
if(!arr(page['@type']).includes('ProfilePage')||!arr(page['@type']).includes('MedicalWebPage')||id(page.mainEntity)!==release.primaryEntity.id||id(person.mainEntityOfPage)!==page['@id'])fail('Physician entity-home ProfilePage topology broken');
for(const machineId of [`${release.canonicalUrl}#doctor-ghezelbaash-structured-data-project`,`${release.canonicalUrl}#data-catalog`,release.dataset.id])if(arr(page.mentions).map(id).includes(machineId))fail(`Machine Dataset entity leaked into page mentions: ${machineId}`);
for(const slug of ['alopecia','androgenetic-alopecia','acne-vulgaris','scar','hyperpigmentation','melasma'])if(!arr(byId.get(`${release.canonicalUrl}#biomedical-concept-${slug}`)?.['@type']).includes('MedicalCondition'))fail(`MedicalCondition semantics missing: ${slug}`);
if(arr(dataset.sameAs).map(id).some(x=>/github\.com|huggingface\.co|doi\.org|zenodo\.org/.test(x||'')))fail('Source/distribution collapsed into Dataset sameAs');
const catalog=byId.get(`${release.canonicalUrl}#data-catalog`),github=byId.get(`${release.canonicalUrl}#project-github-source`),graphDownload=byId.get(`${release.canonicalUrl}graph.jsonld#download`),distributionIds=new Set(arr(dataset.distribution).map(id)),sourceIds=new Set(arr(dataset.isBasedOn).map(id));
if(catalog?.url!==`${release.canonicalUrl}dcat.ttl`||Object.hasOwn(dataset,'url')||graphDownload?.contentUrl!==`${release.canonicalUrl}graph.jsonld`||!distributionIds.has(graphDownload?.['@id']))fail('Catalog/Dataset/download semantic destination contract broken');
if(github?.['@type']!=='SoftwareSourceCode'||github?.url!==release.dataset.github.repository||github?.codeRepository!==release.dataset.github.repository||Object.hasOwn(github,'contentUrl')||distributionIds.has(github?.['@id'])||!sourceIds.has(github?.['@id']))fail('GitHub source-code role contract broken');
for(const externalId of [`${release.canonicalUrl}#project-huggingface-dataset`,`${release.canonicalUrl}#project-zenodo-release`])if(Object.hasOwn(byId.get(externalId)||{},'contentUrl'))fail(`External landing page misdeclared as contentUrl: ${externalId}`);

const fullGraphOnlyMemberships=[
  ['https://www.ghezelbaash.ir/#organization-american-academy-of-anti-aging-medicine','https://www.wikidata.org/entity/Q4742869'],
  ['https://www.ghezelbaash.ir/#organization-international-association-for-physicians-in-aesthetic-medicine','https://www.wikidata.org/entity/Q15995193'],
];
const personMembershipIds=new Set(arr(person.memberOf).map(id));
for(const [organizationId,wikidataId] of fullGraphOnlyMemberships){
  const organization=byId.get(organizationId);
  if(!personMembershipIds.has(organizationId)||!organization||!arr(organization['@type']).includes('Organization')||!arr(organization.sameAs).map(id).includes(wikidataId))fail(`Full-graph membership drift ${organizationId}`);
}
const graphClosure=analyzeGraphClosure(graph,{baseUrl:release.canonicalUrl});
if(graphClosure.duplicateIds.length||graphClosure.danglingSameSiteCount>0)fail(`Graph closure drift: duplicates=${graphClosure.duplicateIds.length}, dangling=${graphClosure.danglingSameSiteCount}`);
const graphIds=new Set(byId.keys());
for(const file of ['src/data/semantic/head-ids.json','src/data/semantic/support-ids.json'])for(const ref of await readJson(file))if(!graphIds.has(ref))fail(`${file} references missing graph node ${ref}`);

const offered=new Set([...arr(person.availableService).map(id),...arr(clinic.availableService).map(id)].filter(Boolean)),registered=new Set(services.services.filter(x=>x.publishable).map(x=>x.id));
if(registered.size<100)fail('Service registry unexpectedly sparse');
for(const x of registered)if(!offered.has(x))fail(`Registry service not projected: ${x}`);
for(const x of offered)if(!registered.has(x))fail(`Projected service missing from registry: ${x}`);
if(![...registered].some(x=>x.includes('botulinum-toxin-chronic-migraine')))fail('Migraine Botox offered-service identity missing');
for(const r of answers.answers){const q=byId.get(r.questionId),a=byId.get(r.answerId);if(!q||!a||id(q.acceptedAnswer)!==r.answerId)fail(`Answer Registry drift ${r.questionId}`)}

const assembled=await assembleCanonicalContent({root,graph});
if(/{{[A-Z0-9_]+}}/.test(assembled.content))fail('Canonical page assembly contains unresolved release/content tokens');
const authoredPage=await readSource('src/content-source/page.md');
if(authoredPage.split(/\r?\n/).length<3000)fail('Canonical HTML source collapsed back into an unreadable single-line authority');
if(/>\s*\r?\n\s*</.test(assembled.content))fail('Readable authored HTML layout leaked into delivery content bytes');
if(!assembled.content.includes('id="saeed-ghezelbash-clinical-decision-framework"')||!assembled.content.includes('id="verified-physician-identity-core"'))fail('Physician-specific diagnostic/identity surface missing');
const headIds=await readJson('src/data/semantic/head-ids.json'),personHeadProfile=headProfile.nodes?.[release.primaryEntity.id],allowedHeadMemberships=new Set(personHeadProfile?.refAllow?.memberOf||[]);
const semanticProjection=await readSource('src/lib/semantic-projection.mjs');
if(headProfile.maxBytes!==releaseInvariants.maxHeadGraphBytes)fail('Head profile byte ceiling drift from release invariant');
if(!Array.isArray(personHeadProfile?.include)||!personHeadProfile.include.includes('memberOf')||!Array.isArray(personHeadProfile?.refAllow?.memberOf))fail('Head Person membership projection policy incomplete');
if(!graphCompiler.includes("import {projectNode} from '../../../src/lib/semantic-projection.mjs'")||!graphCompiler.includes('headNodes.push(projectNode(node,headProfile.nodes?.[id]))')||!semanticProjection.includes('allow.includes(id)'))fail('Head graph compiler no longer enforces the shared declarative Head profile');
for(const [organizationId] of fullGraphOnlyMemberships)if(headIds.includes(organizationId)||allowedHeadMemberships.has(organizationId))fail(`Full-graph-only membership admitted by Head source policy ${organizationId}`);

const headNodes=headIds.map(ref=>byId.get(ref)).filter(Boolean),headRefs=new Set();
const collectHeadRefs=value=>{if(Array.isArray(value))return value.forEach(collectHeadRefs);if(!value||typeof value!=='object')return;if(typeof value['@id']==='string')headRefs.add(value['@id']);for(const [key,item] of Object.entries(value))if(key!=='@id')collectHeadRefs(item)};
headNodes.forEach(collectHeadRefs);
const speakableId=`${release.canonicalUrl}#speakable-primary-content`,speakable=byId.get(speakableId);
if(!headRefs.has(speakableId)||!headIds.includes(speakableId)||!speakable||!arr(speakable['@type']).includes('SpeakableSpecification'))fail('Speakable projection closure drift');
const speakableSelectors=arr(speakable.cssSelector);
if(!speakableSelectors.length||speakable.xpath)fail('Speakable selector contract drift');
for(const selector of speakableSelectors){
  if(selector.startsWith('#')&&!assembled.content.includes(`id="${selector.slice(1)}"`))fail(`Speakable ID selector missing ${selector}`);
  if(selector.startsWith('.')&&!new RegExp(`class=["'][^"']*\\b${selector.slice(1)}\\b`).test(assembled.content))fail(`Speakable class selector missing ${selector}`);
}

const contentFiles=(await readdir(path.join(root,'src/content-source'))).filter(x=>/\.(html|md)$/i.test(x)).sort();
let source='';for(const f of contentFiles)source+=await readFile(path.join(root,'src/content-source',f),'utf8')+'\n';
if(!source.includes('id="saeed-ghezelbash"'))fail('Protected H1 missing');
if(source.includes('Public Knowledge Graph')||source.includes('doctor-ghezelbaash-structured-data-repository'))fail('Machine Dataset landing content reintroduced');
const identitySurfaceTokens=['id="verified-physician-identity-core"','Wikidata Q140287622','نظام پزشکی ۱۶۷۴۳۰','ORCID 0009-0001-9346-8475','Google KG <code>/g/11nqdfk76c</code>'];
if(identitySurfaceTokens.some(token=>!source.includes(token)))fail('Verified physician identity surface contract drift');
if(!/<button\b(?=[^>]*\bhero-search-launch\b)(?=[^>]*\bdata-guide-search-open\b)(?=[^>]*aria-label="باز کردن جست‌وجوی راهنمای جامع")[^>]*>/i.test(source))fail('Accessible Hero search launcher contract drift');
for(const h of visible.protected.aggressiveHeadings)if(h.id&&!source.includes(`id="${h.id}"`))fail(`Required aggressive heading removed: ${h.id}`);
for(const h of visible.protected.instagramHeadingLinks)if(h.id&&!source.includes(`id="${h.id}"`))fail(`Required Instagram heading link removed: ${h.id}`);
if(!source.includes('google-maps-clinic-reputation-current'))fail('Existing visible reputation slot removed');

const robots=await readFile(path.join(root,'public/robots.txt'),'utf8');
if(!robots.includes('Content-Signal: search=yes, ai-input=yes, ai-train=yes, use=full'))fail('Maximum Content-Signal policy drift');
for(const bot of ['Google-Extended','GPTBot','OAI-SearchBot','ChatGPT-User','ClaudeBot','PerplexityBot','Applebot-Extended'])if(!robots.includes(`User-agent: ${bot}\nAllow: /`))fail(`AI/search crawler contract drift: ${bot}`);
const headers=await readFile(path.join(data,'templates/headers.template'),'utf8');
if(!headers.includes('Content-Signal: search=yes, ai-input=yes, ai-train=yes, use=full'))fail('Headers Content-Signal contract drift');
for(const t of ['question-answering','text-retrieval','text-generation'])if(!hf.taskCategories.includes(t))fail(`HF task contract missing ${t}`);
for(const l of ['fa','en','ar','ckb'])if(!hf.languages.includes(l))fail(`HF language contract missing ${l}`);

const redirects=await readFile(path.join(root,'public/_redirects'),'utf8'),redirectsSha=createHash('sha256').update(redirects).digest('hex'),sources=new Set();
if(redirectsSha!==releaseInvariants.redirectsSha256)fail('Redirect source bytes differ from release invariant');
for(const line of redirects.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)){
  const [from,to,code]=line.split(/\s+/);
  if(!from||!to||code!=='301')fail(`Malformed redirect: ${line}`);
  if(sources.has(from))fail(`Duplicate redirect source: ${from}`);
  sources.add(from);
  if(to.includes('#')){
    const frag=decodeURIComponent(to.split('#')[1]||'');
    if(frag&&!source.includes(`id="${frag}"`)&&!source.includes(`id='${frag}'`))fail(`Redirect fragment target missing: ${line}`);
  }
}

const renderCalibrationRaw=await readFile(path.join(root,'src/data/render-calibration.json'),'utf8'),authoredCss=await readFile(path.join(root,'src/styles/global.css'),'utf8');
if((authoredCss.match(/\/\*DIST_CHUNK_INTRINSIC_SLOT\*\//g)||[]).length!==1||!authoredCss.includes(RENDER_CALIBRATION_SLOT))fail('Authored CSS render calibration slot drift');
if(/DIST_CHUNK_CALIBRATION_SHA256:|DIST_CHUNK_INTRINSIC_(?:START|END)/.test(authoredCss))fail('Materialized render calibration leaked into authored CSS');
if(/(?:Release 1\.0\.0|FINAL_2026_UI_CONVERGENCE|GEO_UI_20260817)/.test(authoredCss))fail('Historical append-only CSS authority remains');
const {cssSource:assembledCss,calibration}=assembleCssSource(authoredCss,renderCalibrationRaw),renderChunkIds=calibration.data['360'].chunks.map(x=>x.id);
if(calibration.widths.join(',')!==RENDER_CALIBRATION_WIDTHS.join(',')||calibration.chunkCount!==renderChunkIds.length)fail('Render calibration shared contract drift');
if(!assembledCss.includes(`/*DIST_CHUNK_CALIBRATION_SHA256:${calibration.sha256}*/`)||(assembledCss.match(/#[A-Za-z][\w:-]*\{--cis:/g)||[]).length!==calibration.ruleCount)fail('In-memory render calibration assembly drift');

console.log(JSON.stringify({stage:'SOURCE_SEMANTIC_CONTRACT',release:release.release,services:registered.size,answers:answers.answers.length,protectedAggressiveHeadings:visible.protected.aggressiveHeadings.length,protectedInstagramHeadings:visible.protected.instagramHeadingLinks.length,renderChunks:renderChunkIds.length,canonicalWriterTopology:'PASS',projectionCompilerTopology:'PASS',platformContract:'PASS',authoritySurfaceContract:'PASS',headProjectionPolicy:'SOURCE_VALIDATED',generatedFilePrerequisite:'NONE',buildSourceMutation:'FORBIDDEN',descriptorWriterPhases:['source-input','dist-final'],integrity:'PASS'},null,2));
