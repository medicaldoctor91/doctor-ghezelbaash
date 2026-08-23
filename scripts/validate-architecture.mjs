import path from 'node:path';
import {access,readFile,readdir} from 'node:fs/promises';

const root=process.cwd();
const fail=message=>{throw new Error(message)};
const read=file=>readFile(path.join(root,file),'utf8');
const required=[
  'src/data/head-profile.json','src/data/media-dimensions.tsv','src/lib/resources.mjs','src/lib/site-data.mjs',
  'scripts/enrich-image-metadata-manifest.mjs','scripts/generate-retrieval-projections.mjs','scripts/lib/projection-context.mjs','scripts/lib/headers-template.mjs',
  'scripts/lib/projections/page-assets.mjs','scripts/lib/projections/graph-projections.mjs','scripts/lib/projections/semantic-corpus.mjs','scripts/lib/projections/retrieval-corpus.mjs','scripts/lib/projections/contact-discovery.mjs',
];
for(const file of required)await access(path.join(root,file));
for(const removed of ['src/data/page-metadata.json','src/data/templates/main-head.html','src/data/templates/discovery-head.html','src/data/templates/footer.html','src/data/templates/quick-actions.html','src/lib/head-delivery.mjs','src/lib/static-endpoint.ts']){
  try{await access(path.join(root,removed));fail(`Legacy architecture residue exists: ${removed}`);}catch(error){if(error?.code!=='ENOENT')throw error;}
}
const pageSurface=(await readdir(path.join(root,'src/pages'),{withFileTypes:true})).map(entry=>entry.name).sort();
if(JSON.stringify(pageSurface)!==JSON.stringify(['404.astro','index.astro']))fail(`Astro route surface must remain exactly index.astro + 404.astro; found: ${pageSurface.join(', ')}`);

const [pkg,orchestrator,retrievalGenerator,mediaGate,finalizer,headersCompiler,documentHead,baseLayout,indexPage,pageAssets,graphCompiler,siteFooter,floatingActionDock,knowledgeGraph,resourceRegistry,staticRegistry]=await Promise.all([
  read('package.json').then(JSON.parse),read('scripts/generate-projections.mjs'),read('scripts/generate-retrieval-projections.mjs'),read('scripts/enrich-image-metadata-manifest.mjs'),read('scripts/finalize-dist.mjs'),read('scripts/lib/headers-template.mjs'),
  read('src/components/DocumentHead.astro'),read('src/layouts/BaseLayout.astro'),read('src/pages/index.astro'),
  read('scripts/lib/projections/page-assets.mjs'),read('scripts/lib/projections/graph-projections.mjs'),
  read('src/components/SiteFooter.astro'),read('src/components/FloatingActionDock.astro'),read('src/lib/knowledge-graph.ts'),read('src/lib/resources.mjs'),read('scripts/lib/static-artifacts.mjs'),
]);
if(/\b(?:readFile|writeFile|readdir|unlink)\b/.test(orchestrator))fail('Projection orchestrator regained artifact I/O');
for(const owner of ['compilePageAssets','compileGraphProjections','compileSemanticCorpus','compileRetrievalCorpus','compileContactDiscovery'])if(!orchestrator.includes(owner))fail(`Projection owner missing from orchestrator: ${owner}`);
if(!orchestrator.includes('loadProjectionContext'))fail('Projection context is not centralized');
if(!pageAssets.includes("../../../src/lib/css-delivery.mjs"))fail('Page-assets compiler lost shared CSS delivery contract');
if(!graphCompiler.includes('headProfile.nodes?.[id]')||!graphCompiler.includes('normalizeGoogleSupportGraph'))fail('Graph compiler lost declarative Head/Support ownership');

const retrievalWrites=[...retrievalGenerator.matchAll(/await\s+write\('([^']+)'/g)].map(match=>match[1]).sort();
const allowedRetrievalWrites=[
  'public/live-observations.jsonld','public/query-matrix.jsonl',
  'src/data/projections/current-release-matrix.json','src/data/projections/live-observations.jsonld','src/data/projections/query-matrix.jsonl',
].sort();
if(JSON.stringify(retrievalWrites)!==JSON.stringify(allowedRetrievalWrites))fail(`Retrieval writer surface drift: ${retrievalWrites.join(', ')}`);
for(const forbidden of ['answers.txt','index.md','llms.txt','llms-full.txt','provenance.jsonld','datapackage.json','croissant.json','dcat.ttl','void.ttl','linkset.json'])if(retrievalGenerator.includes(forbidden))fail(`Retrieval generator crossed canonical ownership boundary: ${forbidden}`);
for(const servingField of ['liveRevision','sourceCommit','generatedAt'])if(new RegExp(`\\b${servingField}\\s*:`).test(retrievalGenerator))fail(`Retrieval source projection illegally owns current-serving field: ${servingField}`);

if(pkg.scripts?.['media:enrich']!=='node scripts/enrich-image-metadata-manifest.mjs')fail('Media enrichment bypasses canonical manifest gate');
if(pkg.scripts?.['validate:media-manifest']!=='node scripts/enrich-image-metadata-manifest.mjs --preflight-only')fail('Read-only media manifest preflight wiring missing');
const validateSourceSteps=String(pkg.scripts?.['validate:source']||'').split('&&').map(step=>step.trim()).filter(Boolean);
const architectureIndex=validateSourceSteps.indexOf('npm run validate:architecture');
const mediaPreflightIndex=validateSourceSteps.indexOf('npm run validate:media-manifest');
if(architectureIndex<0||mediaPreflightIndex!==architectureIndex+1)fail('Media manifest preflight must run immediately after architecture validation');
for(const token of ['src/data/media-dimensions.tsv','PRE_ENRICHMENT','POST_ENRICHMENT','POST_ROLLBACK','scripts/enrich-image-metadata.mjs','MANIFEST_LOCKED','MEDIA_ENRICHMENT_TRANSACTION','captureSnapshot','restoreSnapshot','BYTE_SNAPSHOT','--preflight-only','PREFLIGHT_ONLY','mutation:false'])if(!mediaGate.includes(token))fail(`Media transaction boundary contract missing: ${token}`);
if(/\bunlink\b|\bcopyFile\b/.test(mediaGate))fail('Media transaction wrapper must not implement worker-style file replacement');
if(/\bXMP-|exiftool|MetadataProfileVersion/.test(mediaGate))fail('Media transaction wrapper crossed metadata transformation ownership boundary');
if(!mediaGate.includes('spawnSync(process.execPath')||!mediaGate.includes('rollbackErrors'))fail('Media transaction wrapper lost worker/rollback orchestration');
if((mediaGate.match(/manifestSet\.size!==49/g)||[]).length!==1)fail('Media manifest cardinality lock missing');
const preflightBranchIndex=mediaGate.indexOf('if(preflightOnly)');
const snapshotIndex=mediaGate.indexOf('const snapshot=await captureSnapshot()');
const workerIndex=mediaGate.indexOf('const worker=spawnSync');
if(preflightBranchIndex<0||snapshotIndex<0||workerIndex<0||!(preflightBranchIndex<snapshotIndex&&snapshotIndex<workerIndex))fail('Read-only media preflight no longer exits before mutation/snapshot worker path');

if(!finalizer.includes("./lib/headers-template.mjs")||!finalizer.includes('compileHeadersTemplate(headersTemplate,{mainCsp,csp404,digests:headerDigests})'))fail('Finalizer is not bound to strict one-pass headers compilation');
if(/headers\s*=\s*headers\.(?:replace|replaceAll)|headersTemplate\.(?:replace|replaceAll)/.test(finalizer))fail('Manual deployment-header patch chain reintroduced');
if(/\bunlink\b/.test(finalizer))fail('Finalizer must fail closed; post-build artifact deletion is forbidden');
if(!finalizer.includes('DIST fingerprint stylesheet contract drift'))fail('Finalizer lost fail-closed fingerprint stylesheet assertion');
if(finalizer.includes('Object.assign(currentMatrix'))fail('Finalizer must not silently overwrite current-serving authority');
for(const token of ['sourceCurrentMatrix','currentServingKeys','illegally owns current-serving field','const currentMatrix={...sourceCurrentMatrix,liveRevision,sourceCommit:liveRevision,generatedAt}'])if(!finalizer.includes(token))fail(`Current-serving matrix composition contract missing: ${token}`);
const finalizerWriteCount=(finalizer.match(/\bwriteFile\s*\(/g)||[]).length;
if(finalizerWriteCount!==4)fail(`Finalizer mutation boundary drift: expected 4 writes, found ${finalizerWriteCount}`);
for(const artifact of ['current-release-matrix.json','artifact-manifest.json','_headers','live-serving-attestation.json'])if(!finalizer.includes(artifact))fail(`Finalizer required post-build artifact missing: ${artifact}`);
for(const guard of ['unknown token','expected exactly one','unresolved token','token inventory mismatch'])if(!headersCompiler.includes(guard))fail(`Headers compiler guard missing: ${guard}`);

if(!documentHead.includes("../data/head-profile.json")||documentHead.includes('page-metadata.json')||documentHead.includes('main-head.html')||documentHead.includes('deriveMainHeadStages'))fail('Document Head authority is not canonical/structured');
if(documentHead.includes('discovery-head.html?raw')||documentHead.includes('set:html={discoveryHead}')||!documentHead.includes("HEAD_RESOURCES.map")||!documentHead.includes('discoveryLinks.map(link=><link {...link} />)'))fail('Discovery Head must be rendered natively from the shared resource registry');
if(!documentHead.includes('release.primaryEntity.verifiedWebIdentityMesh.map')||!documentHead.includes('release.dataset.zenodo.versionDoi'))fail('Discovery Head lost release.json authority');
for(const [name,component] of [['SiteFooter',siteFooter],['FloatingActionDock',floatingActionDock]]){
  if(component.includes('?raw')||component.includes('set:html'))fail(`${name} reintroduced raw HTML transport`);
  if(!component.includes('deriveSiteData(release,headGraph)'))fail(`${name} lost canonical site-data binding`);
}
if(!siteFooter.includes('FOOTER_RESOURCES.map'))fail('Footer machine-resource navigation is not registry-driven');
if(knowledgeGraph.includes('knowledge-graph.jsonld?raw')||knowledgeGraph.includes('canonicalGraphRaw'))fail('Astro render graph reintroduced the full canonical knowledge graph');
if(!knowledgeGraph.includes('export const headGraph=head.parsed'))fail('Parsed Head graph is not exposed for canonical UI projection');
if(!resourceRegistry.includes('STATIC_ARTIFACTS')||!resourceRegistry.includes('HEAD_RESOURCES')||!resourceRegistry.includes('FOOTER_RESOURCES'))fail('Shared machine-resource registry is incomplete');
if(staticRegistry.trim()!=="export {STATIC_ARTIFACTS,staticArtifactForRoute} from '../../src/lib/resources.mjs';")fail('Build tooling must re-export, not duplicate, the shared resource inventory');
if(baseLayout.includes('page-metadata.json')||!baseLayout.includes('frontmatter.title')||!baseLayout.includes('frontmatter.description'))fail('Layout must consume canonical Markdown frontmatter');
if(!/import\s*\{[^}]*\bfrontmatter\b[^}]*\}\s*from\s*['"]\.\.\/content\/home\.md['"]/.test(indexPage)||indexPage.includes('page-metadata.json'))fail('Index must consume generated canonical Markdown frontmatter');

console.log(JSON.stringify({stage:'ARCHITECTURE_2026',astroRoutes:pageSurface.length,projectionCompilerOwners:5,retrievalWriterTargets:retrievalWrites.length,currentServingMatrixAuthority:'finalizer-only',mediaEnrichmentBoundary:'manifest-locked-transactional',mediaManifestPreflight:'read-only-ci-gate',contentMetadataAuthority:'markdown-frontmatter',canonicalUrlAuthority:'release.json',presentationAuthority:'head-profile.json',contactAuthority:'release+head-graph',resourceAuthority:'src/lib/resources.mjs',discoveryIdentityAuthority:'release.json',headDelivery:'astro-native-structured',rawHtmlTemplates:0,rawHeadTemplates:0,fullGraphInAstroRenderGraph:false,headersCompilation:'strict-one-pass',finalizerMutationWrites:finalizerWriteCount,finalizerDeletes:0,legacyHeadResidue:0,integrity:'PASS'},null,2));
