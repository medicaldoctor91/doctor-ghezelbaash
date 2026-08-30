import path from 'node:path';
import {access,readdir,readFile} from 'node:fs/promises';

const root=process.cwd();
const fail=message=>{throw new Error(message)};
const assert=(condition,message)=>{if(!condition)fail(message)};
const read=relative=>readFile(path.join(root,relative),'utf8');
const readJson=relative=>read(relative).then(JSON.parse);

const required=[
  'astro.config.mjs',
  'src/content-source/page.md',
  'src/data/document-head.json',
  'src/data/release.json',
  'src/data/semantic/head-profile.json',
  'src/data/semantic/support-profile.json',
  'src/integrations/html5-output.mjs',
  'src/lib/resources.mjs',
  'src/pages/favicon.png.ts',
  'src/styles/global.css',
  'scripts/generated-workspace.mjs',
  'scripts/generate-projections.mjs',
  'scripts/generate-retrieval-projections.mjs',
  'scripts/generate-descriptors.mjs',
  'scripts/materialize-static-artifacts.mjs',
  'scripts/finalize-dist.mjs',
  'scripts/lib/projection-context.mjs',
  'scripts/lib/projections/page-assets.mjs',
  'scripts/lib/projections/graph-projections.mjs',
  'scripts/lib/projections/semantic-corpus.mjs',
  'scripts/lib/projections/retrieval-corpus.mjs',
  'scripts/lib/projections/contact-discovery.mjs',
];
for(const file of required)await access(path.join(root,file));

const routes=(await readdir(path.join(root,'src/pages'),{withFileTypes:true})).filter(entry=>entry.isFile()).map(entry=>entry.name).sort();
assert(JSON.stringify(routes)===JSON.stringify(['404.astro','favicon.png.ts','index.astro']),`Astro route surface drift: ${routes.join(', ')}`);
const contentSources=(await readdir(path.join(root,'src/content-source'),{withFileTypes:true})).filter(entry=>entry.isFile()).map(entry=>entry.name).sort();
assert(JSON.stringify(contentSources)===JSON.stringify(['page.md']),`Content authority must be page.md only: ${contentSources.join(', ')}`);
const styles=(await readdir(path.join(root,'src/styles'),{withFileTypes:true})).filter(entry=>entry.isFile()).map(entry=>entry.name).sort();
assert(JSON.stringify(styles)===JSON.stringify(['global.css']),`Presentation authority must be global.css only: ${styles.join(', ')}`);

const pageSource=await read('src/content-source/page.md');
const frontmatter=pageSource.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
assert(frontmatter,'Canonical page frontmatter missing');
const frontmatterKeys=frontmatter[1].split(/\r?\n/).map(line=>line.match(/^([A-Za-z][A-Za-z0-9_-]*):/)?.[1]).filter(Boolean);
assert(JSON.stringify(frontmatterKeys)===JSON.stringify(['title','description','lang','dir','robots']),`Page frontmatter schema drift: ${frontmatterKeys.join(', ')}`);

const [
  pkg,orchestrator,projectionContext,pageAssets,graphCompiler,semanticCompiler,retrievalCompiler,contactCompiler,
  documentHead,baseLayout,indexPage,knowledgeGraph,resourceRegistry,materializer,finalizer,astroConfig,html5Integration,
  headProfile,supportProfile,
]=await Promise.all([
  readJson('package.json'),
  read('scripts/generate-projections.mjs'),
  read('scripts/lib/projection-context.mjs'),
  read('scripts/lib/projections/page-assets.mjs'),
  read('scripts/lib/projections/graph-projections.mjs'),
  read('scripts/lib/projections/semantic-corpus.mjs'),
  read('scripts/lib/projections/retrieval-corpus.mjs'),
  read('scripts/lib/projections/contact-discovery.mjs'),
  read('src/components/DocumentHead.astro'),
  read('src/layouts/BaseLayout.astro'),
  read('src/pages/index.astro'),
  read('src/lib/knowledge-graph.ts'),
  read('src/lib/resources.mjs'),
  read('scripts/materialize-static-artifacts.mjs'),
  read('scripts/finalize-dist.mjs'),
  read('astro.config.mjs'),
  read('src/integrations/html5-output.mjs'),
  readJson('src/data/semantic/head-profile.json'),
  readJson('src/data/semantic/support-profile.json'),
]);

assert(!/\b(?:readFile|writeFile|readdir|unlink)\b/.test(orchestrator),'Projection orchestrator must delegate artifact I/O');
for(const owner of ['compilePageAssets','compileGraphProjections','compileSemanticCorpus','compileRetrievalCorpus','compileContactDiscovery'])assert(orchestrator.includes(owner),`Projection owner missing: ${owner}`);
assert(orchestrator.includes('loadProjectionContext'),'Projection context is not centralized');

assert(projectionContext.includes("from '../generated-workspace.mjs'")&&projectionContext.includes('generatedSemantic:generated.semantic'),'Projection context must own generated workspace paths');
assert(pageAssets.includes('generatedContent')&&pageAssets.includes('generatedAssets'),'Page asset compiler must target generated workspace');
assert(graphCompiler.includes("path.join(semantic,'head-profile.json')")&&graphCompiler.includes("path.join(semantic,'support-profile.json')"),'Graph compiler must consume the two projection profiles directly');
assert(graphCompiler.includes('const headIds=headProfile.ids')&&graphCompiler.includes('const configuredSupportIds=supportProfile.ids'),'Projection selection must live inside its profile');
assert(graphCompiler.includes("path.join(generatedSemantic,'head-graph.json')")&&graphCompiler.includes("path.join(generatedSemantic,'support-graph.json')"),'Graph compiler must own both generated graph projections');
assert(Array.isArray(headProfile.ids)&&headProfile.ids.length>0&&new Set(headProfile.ids).size===headProfile.ids.length,'Head profile IDs are invalid');
assert(Array.isArray(supportProfile.ids)&&supportProfile.ids.length>0&&new Set(supportProfile.ids).size===supportProfile.ids.length,'Support profile IDs are invalid');
assert(semanticCompiler.includes("path.join(projections,'entity-facts.csv')"),'Semantic corpus must target the generated projections path');
assert(retrievalCompiler.includes('generatedContent')&&retrievalCompiler.includes('projections'),'Retrieval corpus must use generated content and projections paths');
assert(contactCompiler.includes('generatedPublic')&&contactCompiler.includes('projections'),'Contact discovery must use generated public and projections paths');

assert(documentHead.includes("../data/document-head.json")&&documentHead.includes("../data/release.json")&&documentHead.includes('HEAD_RESOURCES.map'),'Document Head must use its direct metadata and resource sources');
assert(documentHead.includes('discoveryLinks.map(link=><link {...link}>)'),'Discovery links must be structured Astro elements');
assert(baseLayout.includes("../styles/global.css?raw")&&baseLayout.includes('../lib/css-source.mjs')&&baseLayout.includes('../lib/css-delivery.mjs'),'Layout must assemble the single stylesheet directly');
assert(baseLayout.includes('<DocumentHead')&&baseLayout.includes('headGraphRaw')&&baseLayout.includes('supportGraphRaw'),'Layout must own head and semantic delivery');
assert(/from ['"]\.\.\/\.\.\/\.generated\/content\/home\.md['"]/.test(indexPage),'Index route must consume generated canonical content');
assert(knowledgeGraph.includes('../../.generated/semantic/head-graph.json?raw')&&knowledgeGraph.includes('../../.generated/semantic/support-graph.json?raw'),'Astro must consume generated graph projections');

assert(resourceRegistry.includes('STATIC_ARTIFACTS')&&resourceRegistry.includes('HEAD_RESOURCES')&&resourceRegistry.includes('FOOTER_RESOURCES'),'Machine resource registry is incomplete');
assert(materializer.includes("from '../src/lib/resources.mjs'")&&materializer.includes("path.join(root,'.generated/public')"),'Static materializer must use the resource registry and generated public workspace');
assert(finalizer.includes("./lib/headers-template.mjs")&&finalizer.includes('compileHeadersTemplate(headersTemplate,{mainCsp,csp404,digests:headerDigests})'),'Finalizer must compile headers in one pass');
assert(!/\bunlink\b/.test(finalizer),'Finalizer may not delete build artifacts');

assert(astroConfig.includes('integrations:[html5Output()]')&&astroConfig.includes("./src/integrations/html5-output.mjs"),'Astro config must own HTML5 output serialization');
assert(html5Integration.includes("'astro:build:done'")&&html5Integration.includes('VOID_ELEMENT'),'HTML5 output integration is incomplete');

assert(pkg.scripts?.['clean:generated']==='node scripts/generated-workspace.mjs reset','Generated workspace reset command drift');
assert(pkg.scripts?.['render:calibration:update']==='node scripts/update-render-calibration.mjs','Render calibration command drift');
assert(String(pkg.scripts?.build||'').includes('npm run prepare:generated')&&String(pkg.scripts?.build||'').includes('npm run compile:dist'),'Build must prepare sources before compiling dist');
for(const step of ['astro build','npm run materialize:static','npm run descriptors:finalize','node scripts/finalize-dist.mjs','node scripts/validate-dist.mjs'])assert(String(pkg.scripts?.['compile:dist']||'').includes(step),`DIST compiler step missing: ${step}`);
assert(String(pkg.scripts?.release||'').includes('npm run compile:dist')&&String(pkg.scripts?.release||'').includes('npm run release:attest'),'Release must reuse the DIST compiler before attestation');

console.log(JSON.stringify({stage:'ARCHITECTURE',astroRoutes:routes.length,contentSources:contentSources.length,stylesheetSources:styles.length,projectionCompilers:5,headProfileIds:headProfile.ids.length,supportProfileIds:supportProfile.ids.length,generatedWorkspace:'.generated',html5Output:'astro-integration',integrity:'PASS'},null,2));
