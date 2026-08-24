import path from 'node:path';
import {access,readFile,readdir} from 'node:fs/promises';

const root=process.cwd();
const fail=message=>{throw new Error(message)};
const assert=(condition,message)=>{if(!condition)fail(message)};
const read=file=>readFile(path.join(root,file),'utf8');
const exists=async file=>{try{await access(path.join(root,file));return true}catch(error){if(error?.code==='ENOENT')return false;throw error}};

const required=[
  'src/data/head-profile.json','src/data/media-dimensions.tsv','src/lib/resources.mjs','src/lib/site-data.mjs',
  'scripts/generated-workspace.mjs','scripts/materialize-static-artifacts.mjs','scripts/test-contracts.mjs','scripts/platform-contract.mjs','scripts/github-pages-bridge.mjs','scripts/verify-live.mjs','scripts/reputation.mjs','scripts/huggingface.mjs','scripts/cloudflare-pages.mjs',
  'scripts/generate-rdf.mjs','scripts/generate-projections.mjs','scripts/generate-retrieval-projections.mjs','scripts/generate-descriptors.mjs',
  'scripts/enrich-image-metadata-manifest.mjs','scripts/lib/projection-context.mjs','scripts/lib/headers-template.mjs',
  'scripts/lib/projections/page-assets.mjs','scripts/lib/projections/graph-projections.mjs','scripts/lib/projections/semantic-corpus.mjs','scripts/lib/projections/retrieval-corpus.mjs','scripts/lib/projections/contact-discovery.mjs',
];
for(const file of required)assert(await exists(file),`Required architecture file missing: ${file}`);
for(const removed of ['scripts/promote-generated-workspace.mjs','scripts/clean-generated-workspace.mjs','scripts/lib/generated-workspace.mjs','scripts/lib/static-artifacts.mjs','scripts/test-file-transaction.mjs','scripts/test-release-promotion.mjs','scripts/test-reputation-observation.mjs','scripts/export-platform-contract.mjs','scripts/validate-platform-contract.mjs','scripts/build-github-pages-bridge.mjs','scripts/verify-github-pages-bridge.mjs','scripts/verify-current-serving.mjs','scripts/verify-public-discovery-freshness.mjs','scripts/verify-release-snapshot.mjs','scripts/process-google-reputation.mjs','scripts/sync-hf-live-observations.mjs','scripts/validate-visible-freeze.mjs','scripts/prepare-huggingface-distribution.mjs','scripts/verify-huggingface-authority.mjs','scripts/ensure-cloudflare-pages-git-deployment.mjs','scripts/verify-cloudflare-pages-deployment.mjs','scripts/verify-redirects.mjs','scripts/verify-subdomain-redirects.mjs','src/data/page-metadata.json','src/data/templates/main-head.html','src/data/templates/discovery-head.html','src/data/templates/footer.html','src/data/templates/quick-actions.html','src/lib/head-delivery.mjs','src/lib/static-endpoint.ts'])assert(!(await exists(removed)),`Legacy architecture residue exists: ${removed}`);

const pageSurface=(await readdir(path.join(root,'src/pages'),{withFileTypes:true})).map(entry=>entry.name).sort();
assert(JSON.stringify(pageSurface)===JSON.stringify(['404.astro','index.astro']),`Astro route surface drift: ${pageSurface.join(', ')}`);

const pageSource=await read('src/content-source/page.md');
const frontmatterBlock=pageSource.match(/^---\n([\s\S]*?)\n---\n/);
assert(frontmatterBlock,'Canonical Markdown frontmatter missing');
const frontmatterKeys=frontmatterBlock[1].split(/\r?\n/).map(line=>line.match(/^([A-Za-z][A-Za-z0-9_-]*):/)?.[1]).filter(Boolean);
assert(JSON.stringify(frontmatterKeys)===JSON.stringify(['title','description','lang','dir','robots']),`Canonical frontmatter authority drift: ${frontmatterKeys.join(', ')}`);
for(const token of ['{{CLINIC_TEL_HREF}}','{{CLINIC_PHONE_FA}}','{{CLINIC_PHONE_INTL}}','{{OFFICIAL_INSTAGRAM_URL}}','{{OFFICIAL_CHAT_URL}}','{{CLINIC_MAPS_URL}}','{{CLINIC_POSTAL_CODE_FA}}','{{CLINIC_HOURS_COMPACT_FA}}','{{MEDICAL_REVIEW_DATE_ISO}}','{{MEDICAL_REVIEW_DATE_FA}}'])assert(pageSource.includes(token),`Canonical page operational token missing: ${token}`);
for(const forbidden of ['canonical:','about:','dateModified:','reviewedBy:','tel:+989308209494','۰۹۳۰ ۸۲۰ ۹۴۹۴','+98 930 820 9494','https://www.instagram.com/doctor.ghezelbaash/','https://ig.me/m/doctor.ghezelbaash','https://www.google.com/maps?cid=12350483144643112463','۶۷۱۴۶۵۷۴۱۲','شنبه تا پنجشنبه ۱۶–۲۲؛ جمعه تعطیل','شنبه تا پنجشنبه، ۱۶:۰۰ تا ۲۲:۰۰','datetime="2026-08-13"','۱۳ اوت ۲۰۲۶'])assert(!pageSource.includes(forbidden),`Duplicate page authority reintroduced: ${forbidden}`);

const files=await Promise.all([
  read('package.json').then(JSON.parse),read('scripts/generate-projections.mjs'),read('scripts/generate-retrieval-projections.mjs'),read('scripts/generate-rdf.mjs'),read('scripts/generate-descriptors.mjs'),
  read('scripts/lib/projection-context.mjs'),read('scripts/generated-workspace.mjs'),read('scripts/lib/projections/page-assets.mjs'),read('scripts/lib/projections/graph-projections.mjs'),read('scripts/lib/projections/retrieval-corpus.mjs'),read('scripts/lib/projections/contact-discovery.mjs'),
  read('scripts/enrich-image-metadata-manifest.mjs'),read('scripts/finalize-dist.mjs'),read('scripts/lib/headers-template.mjs'),read('scripts/materialize-static-artifacts.mjs'),
  read('src/components/DocumentHead.astro'),read('src/layouts/BaseLayout.astro'),read('src/pages/index.astro'),read('src/components/SiteFooter.astro'),read('src/components/FloatingActionDock.astro'),read('src/lib/knowledge-graph.ts'),read('src/lib/resources.mjs'),read('scripts/validate-subdomain-redirects.mjs'),
]);
const [pkg,orchestrator,retrievalGenerator,rdfGenerator,descriptorGenerator,projectionContext,workspacePaths,pageAssets,graphCompiler,retrievalCorpus,contactCompiler,mediaGate,finalizer,headersCompiler,materializer,documentHead,baseLayout,indexPage,siteFooter,floatingActionDock,knowledgeGraph,resourceRegistry,subdomainRedirectValidator]=files;

assert(!/\b(?:readFile|writeFile|readdir|unlink)\b/.test(orchestrator),'Projection orchestrator regained artifact I/O');
for(const owner of ['compilePageAssets','compileGraphProjections','compileSemanticCorpus','compileRetrievalCorpus','compileContactDiscovery'])assert(orchestrator.includes(owner),`Projection owner missing: ${owner}`);
assert(orchestrator.includes('loadProjectionContext'),'Projection context is not centralized');

assert(workspacePaths.includes("path.join(root,'.generated')"),'Generated workspace root is not centralized');
assert(projectionContext.includes("from '../generated-workspace.mjs'")&&projectionContext.includes('projections:generated.projections'),'Projection context lost generated workspace authority');
assert(pageAssets.includes('generatedContent')&&pageAssets.includes('generatedAssets')&&!pageAssets.includes("'src/content'" )&&!pageAssets.includes("'public/assets'"),'Page assets must write directly to generated workspace');
assert(graphCompiler.includes('generatedSemantic')&&graphCompiler.includes("path.join(generatedSemantic,'head-graph.json')")&&graphCompiler.includes("path.join(generatedSemantic,'support-graph.json')"),'Graph projections must write directly to generated workspace');
assert(retrievalCorpus.includes('generatedContent')&&!retrievalCorpus.includes("src/content/home.md"),'Retrieval corpus must consume generated content directly');
assert(contactCompiler.includes('generatedPublic')&&!contactCompiler.includes("path.join(root,'public')"),'Contact projection must write directly to generated public workspace');
assert(rdfGenerator.includes('generatedWorkspace')&&rdfGenerator.includes(".generated/semantic/knowledge-graph.ttl")&&!rdfGenerator.includes("target='src/data/semantic/knowledge-graph.ttl'"),'RDF writer must be generated-workspace native');
assert(descriptorGenerator.includes('generatedWorkspace')&&descriptorGenerator.includes('generated.semantic')&&!descriptorGenerator.includes("path.join(data,'projections')"),'Descriptor writer must be generated-workspace native');

const retrievalTargets=[
  "path.join(generated.projections,'live-observations.jsonld')",
  "path.join(generated.public,'live-observations.jsonld')",
  "path.join(generated.projections,'query-matrix.jsonl')",
  "path.join(generated.public,'query-matrix.jsonl')",
  "path.join(generated.projections,'current-release-matrix.json')",
];
for(const target of retrievalTargets)assert(retrievalGenerator.includes(target),`Retrieval generated target missing: ${target}`);
for(const forbidden of ["write('src/data/projections/","write('public/",'answers.txt','index.md','llms.txt','llms-full.txt','provenance.jsonld','datapackage.json','croissant.json','dcat.ttl','void.ttl','linkset.json'])assert(!retrievalGenerator.includes(forbidden),`Retrieval generator crossed ownership boundary: ${forbidden}`);
for(const servingField of ['liveRevision','sourceCommit','generatedAt'])assert(!new RegExp(`\\b${servingField}\\s*:`).test(retrievalGenerator),`Retrieval projection owns serving field: ${servingField}`);

assert(pkg.scripts?.['clean:generated']==='node scripts/generated-workspace.mjs reset','Generated workspace reset script drift');
assert(String(pkg.scripts?.['prepare:generated']||'').includes('npm run clean:generated && npm run rdf:generate && npm run generate'),'Generation must reset workspace before direct writers');
assert(!pkg.scripts?.['promote:generated']&&!String(pkg.scripts?.generate||'').includes('promote'),'Obsolete generated promotion reintroduced');
assert(String(pkg.scripts?.['validate:source']||'').includes('node scripts/test-contracts.mjs')&&String(pkg.scripts?.['validate:source']||'').includes('node scripts/platform-contract.mjs validate')&&String(pkg.scripts?.['validate:source']||'').includes('node scripts/github-pages-bridge.mjs self-test'),'Tooling ownership consolidation drift');

assert(pkg.scripts?.['media:enrich']==='node scripts/enrich-image-metadata-manifest.mjs','Media enrichment bypasses canonical manifest gate');
assert(pkg.scripts?.['validate:media-manifest']==='node scripts/enrich-image-metadata-manifest.mjs --preflight-only','Read-only media manifest preflight wiring missing');
const validateSourceSteps=String(pkg.scripts?.['validate:source']||'').split('&&').map(step=>step.trim()).filter(Boolean);
const architectureIndex=validateSourceSteps.indexOf('npm run validate:architecture');
assert(architectureIndex>=0&&validateSourceSteps[architectureIndex+1]==='npm run validate:media-manifest','Media manifest preflight must immediately follow architecture validation');
for(const token of ['MANIFEST_LOCKED','MEDIA_ENRICHMENT_TRANSACTION','captureSnapshot','restoreSnapshot','BYTE_SNAPSHOT','--preflight-only','PREFLIGHT_ONLY','mutation:false'])assert(mediaGate.includes(token),`Media transaction contract missing: ${token}`);
assert(!/\bunlink\b|\bcopyFile\b/.test(mediaGate),'Media transaction wrapper crossed worker boundary');

assert(finalizer.includes("./lib/headers-template.mjs")&&finalizer.includes('compileHeadersTemplate(headersTemplate,{mainCsp,csp404,digests:headerDigests})'),'Finalizer lost one-pass headers compiler');
assert(!/headers\s*=\s*headers\.(?:replace|replaceAll)|headersTemplate\.(?:replace|replaceAll)/.test(finalizer),'Manual deployment-header patch chain reintroduced');
assert(!/\bunlink\b/.test(finalizer),'Finalizer must never delete built artifacts');
assert(finalizer.includes('DIST fingerprint stylesheet contract drift'),'Finalizer lost fingerprint stylesheet assertion');
const finalizerWriteCount=(finalizer.match(/\bwriteFile\s*\(/g)||[]).length;
assert(finalizerWriteCount===4,`Finalizer mutation boundary drift: ${finalizerWriteCount}`);
for(const guard of ['unknown token','expected exactly one','unresolved token','token inventory mismatch'])assert(headersCompiler.includes(guard),`Headers compiler guard missing: ${guard}`);

assert(documentHead.includes("../data/head-profile.json")&&documentHead.includes("HEAD_RESOURCES.map")&&documentHead.includes('discoveryLinks.map(link=><link {...link} />)'),'Document Head is not structured/registry-driven');
assert(!documentHead.includes('page-metadata.json')&&!documentHead.includes('?raw')&&!documentHead.includes('set:html={discoveryHead}'),'Legacy/raw Head authority reintroduced');
assert(documentHead.includes('release.primaryEntity.verifiedWebIdentityMesh.map')&&documentHead.includes('release.dataset.zenodo.versionDoi'),'Discovery Head lost release authority');
assert(baseLayout.includes('frontmatter.title')&&baseLayout.includes('frontmatter.description')&&baseLayout.includes('new URL(release.canonicalUrl)'),'Layout metadata authority drift');
assert(/import\s*\{[^}]*\bfrontmatter\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/\.generated\/content\/home\.md['"]/.test(indexPage),'Index must consume generated Markdown from .generated');
for(const [name,component] of [['SiteFooter',siteFooter],['FloatingActionDock',floatingActionDock]]){
  assert(!component.includes('?raw')&&!component.includes('set:html'),`${name} reintroduced raw HTML transport`);
  assert(component.includes('deriveSiteData(release,headGraph)'),`${name} lost canonical site-data binding`);
}
assert(siteFooter.includes('FOOTER_RESOURCES.map'),'Footer machine-resource navigation is not registry-driven');
assert(knowledgeGraph.includes("../../.generated/semantic/head-graph.json?raw")&&knowledgeGraph.includes("../../.generated/semantic/support-graph.json?raw"),'Astro graph projections must come from .generated');
assert(!knowledgeGraph.includes('knowledge-graph.jsonld?raw')&&!knowledgeGraph.includes('canonicalGraphRaw'),'Full canonical graph leaked into Astro render graph');
assert(resourceRegistry.includes('STATIC_ARTIFACTS')&&resourceRegistry.includes('HEAD_RESOURCES')&&resourceRegistry.includes('FOOTER_RESOURCES'),'Machine-resource registry incomplete');
assert(!resourceRegistry.includes("source:'src/data/projections/")&&!resourceRegistry.includes("source:'src/data/semantic/knowledge-graph.ttl'"),'Resource registry consumes legacy generated staging');
assert(resourceRegistry.includes("source:'.generated/projections/")&&resourceRegistry.includes("source:'.generated/semantic/knowledge-graph.ttl'"),'Resource registry not generated-workspace bound');
assert(materializer.includes("from '../src/lib/resources.mjs'")&&subdomainRedirectValidator.includes("from '../src/lib/resources.mjs'"),'Build tooling must consume the shared resource registry directly');
assert(materializer.includes("const generatedPublic=path.join(root,'.generated/public')")&&materializer.includes('materializeGeneratedPublic'),'DIST materializer does not publish generated public artifacts');

console.log(JSON.stringify({stage:'ARCHITECTURE_2026',astroRoutes:pageSurface.length,projectionCompilerOwners:5,retrievalWriterTargets:retrievalTargets.length,generatedWorkspace:'.generated',generatedWriteMode:'direct',sourceTreeMutation:false,promotionLayer:false,generatedConsumerAuthority:'single-workspace',currentServingMatrixAuthority:'finalizer-only',mediaEnrichmentBoundary:'manifest-locked-transactional',contentMetadataAuthority:'exact-markdown-frontmatter',contentOperationalAuthority:'release+graph-token-binding',canonicalUrlAuthority:'release.json',presentationAuthority:'head-profile.json',resourceAuthority:'src/lib/resources.mjs',headDelivery:'astro-native-structured',rawHtmlTemplates:0,rawHeadTemplates:0,fullGraphInAstroRenderGraph:false,headersCompilation:'strict-one-pass',finalizerMutationWrites:finalizerWriteCount,finalizerDeletes:0,integrity:'PASS'},null,2));
