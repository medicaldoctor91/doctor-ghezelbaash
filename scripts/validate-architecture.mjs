import path from 'node:path';
import {access,readFile} from 'node:fs/promises';

const root=process.cwd();
const fail=message=>{throw new Error(message)};
const read=file=>readFile(path.join(root,file),'utf8');
const required=[
  'src/data/head-profile.json','src/data/templates/discovery-head.html',
  'scripts/lib/projection-context.mjs','scripts/lib/headers-template.mjs',
  'scripts/lib/projections/page-assets.mjs','scripts/lib/projections/graph-projections.mjs','scripts/lib/projections/semantic-corpus.mjs','scripts/lib/projections/retrieval-corpus.mjs','scripts/lib/projections/contact-discovery.mjs',
];
for(const file of required)await access(path.join(root,file));
for(const removed of ['src/data/page-metadata.json','src/data/templates/main-head.html','src/lib/head-delivery.mjs']){
  try{await access(path.join(root,removed));fail(`Legacy architecture residue exists: ${removed}`);}catch(error){if(error?.code!=='ENOENT')throw error;}
}

const [orchestrator,finalizer,headersCompiler,documentHead,baseLayout,indexPage,pageAssets,graphCompiler]=await Promise.all([
  read('scripts/generate-projections.mjs'),read('scripts/finalize-dist.mjs'),read('scripts/lib/headers-template.mjs'),
  read('src/components/DocumentHead.astro'),read('src/layouts/BaseLayout.astro'),read('src/pages/index.astro'),
  read('scripts/lib/projections/page-assets.mjs'),read('scripts/lib/projections/graph-projections.mjs'),
]);
if(/\b(?:readFile|writeFile|readdir|unlink)\b/.test(orchestrator))fail('Projection orchestrator regained artifact I/O');
for(const owner of ['compilePageAssets','compileGraphProjections','compileSemanticCorpus','compileRetrievalCorpus','compileContactDiscovery'])if(!orchestrator.includes(owner))fail(`Projection owner missing from orchestrator: ${owner}`);
if(!orchestrator.includes('loadProjectionContext'))fail('Projection context is not centralized');
if(!pageAssets.includes("../../../src/lib/css-delivery.mjs"))fail('Page-assets compiler lost shared CSS delivery contract');
if(!graphCompiler.includes('headProfile.nodes?.[id]')||!graphCompiler.includes('normalizeGoogleSupportGraph'))fail('Graph compiler lost declarative Head/Support ownership');

if(!finalizer.includes("./lib/headers-template.mjs")||!finalizer.includes('compileHeadersTemplate(headersTemplate,{mainCsp,csp404,digests:headerDigests})'))fail('Finalizer is not bound to strict one-pass headers compilation');
if(/headers\s*=\s*headers\.(?:replace|replaceAll)|headersTemplate\.(?:replace|replaceAll)/.test(finalizer))fail('Manual deployment-header patch chain reintroduced');
if(/\bunlink\b/.test(finalizer))fail('Finalizer must fail closed; post-build artifact deletion is forbidden');
if(!finalizer.includes('DIST fingerprint stylesheet contract drift'))fail('Finalizer lost fail-closed fingerprint stylesheet assertion');
const finalizerWriteCount=(finalizer.match(/\bwriteFile\s*\(/g)||[]).length;
if(finalizerWriteCount!==4)fail(`Finalizer mutation boundary drift: expected 4 writes, found ${finalizerWriteCount}`);
for(const artifact of ['current-release-matrix.json','artifact-manifest.json','_headers','live-serving-attestation.json'])if(!finalizer.includes(artifact))fail(`Finalizer required post-build artifact missing: ${artifact}`);
for(const guard of ['unknown token','expected exactly one','unresolved token','token inventory mismatch'])if(!headersCompiler.includes(guard))fail(`Headers compiler guard missing: ${guard}`);

if(!documentHead.includes("../data/head-profile.json")||documentHead.includes('page-metadata.json')||documentHead.includes('main-head.html')||documentHead.includes('deriveMainHeadStages'))fail('Document Head authority is not canonical/structured');
if(!documentHead.includes("../data/templates/discovery-head.html?raw"))fail('Discovery Head is not isolated from content metadata authority');
if(baseLayout.includes('page-metadata.json')||!baseLayout.includes('frontmatter.title')||!baseLayout.includes('frontmatter.description'))fail('Layout must consume canonical Markdown frontmatter');
if(!/import\s*\{[^}]*\bfrontmatter\b[^}]*\}\s*from\s*['"]\.\.\/content\/home\.md['"]/.test(indexPage)||indexPage.includes('page-metadata.json'))fail('Index must consume generated canonical Markdown frontmatter');

console.log(JSON.stringify({stage:'ARCHITECTURE_2026',projectionCompilerOwners:5,contentMetadataAuthority:'markdown-frontmatter',canonicalUrlAuthority:'release.json',presentationAuthority:'head-profile.json',headDelivery:'structured',headersCompilation:'strict-one-pass',finalizerMutationWrites:finalizerWriteCount,finalizerDeletes:0,legacyHeadResidue:0,integrity:'PASS'},null,2));
