import fs from 'node:fs';

const assets = [
  ['primary', '/graph-ghezelbaash-final.jsonld', 'src/pages/graph-ghezelbaash-final.jsonld.js'],
  ['thin', '/brand-kb.ghezelbaash.ai-public.json', 'src/pages/brand-kb.ghezelbaash.ai-public.json.js'],
  ['thin', '/services.json', 'src/pages/services.json.js'],
  ['thin', '/research.json', 'src/pages/research.json.js'],
  ['thin', '/research-graph.jsonld', 'src/pages/research-graph.jsonld.js'],
  ['thin', '/aesthetic_medicine_knowledge_kermanshah_fa.json', 'src/pages/aesthetic_medicine_knowledge_kermanshah_fa.json.js'],
  ['thin', '/location.json', 'src/pages/location.json.js'],
  ['export', '/nap.csv', 'src/pages/nap.csv.js'],
  ['thin', '/sameas.json', 'src/pages/sameas.json.js'],
  ['thin', '/authority-signals.json', 'src/pages/authority-signals.json.js'],
  ['thin', '/regulatory.json', 'src/pages/regulatory.json.js'],
  ['thin', '/profile-links.json', 'src/pages/profile-links.json.js'],
  ['thin', '/service-taxonomy.json', 'src/pages/service-taxonomy.json.js'],
  ['thin', '/dataset.json', 'src/pages/dataset.json.js'],
  ['discovery', '/routes.json', 'src/pages/routes.json.js'],
  ['discovery', '/page-context.json', 'src/pages/page-context.json.js'],
  ['discovery', '/link-graph.json', 'src/pages/link-graph.json.js'],
  ['discovery', '/seo-aeo-index.json', 'src/pages/seo-aeo-index.json.js'],
  ['discovery', '/llms.txt', 'src/pages/llms.txt.js'],
  ['discovery', '/robots.txt', 'src/pages/robots.txt.js'],
  ['discovery', '/sitemap.xml', 'src/pages/sitemap.xml.js'],
  ['audit', '/ai-discovery-index.json', 'src/pages/ai-discovery-index.json.js'],
  ['audit', '/entity-hardening-index.json', 'src/pages/entity-hardening-index.json.js'],
  ['audit', '/publishing-crosswalk.jsonld', 'src/pages/publishing-crosswalk.jsonld.js'],
  ['audit', '/dataset-manifest.jsonld', 'src/pages/dataset-manifest.jsonld.js'],
  ['audit', '/local-competitive-landscape.json', 'src/pages/local-competitive-landscape.json.js'],
  ['landing', '/aesthetic-medicine-dataset.html', 'src/pages/aesthetic-medicine-dataset.html.js']
];

let failed = false;
function fail(message) {
  console.error(message);
  failed = true;
}

const seenPaths = new Set();
const seenSources = new Set();

for (const [role, publicPath, sourcePath] of assets) {
  if (!['primary', 'thin', 'export', 'discovery', 'audit', 'landing'].includes(role)) fail(`unknown role: ${role}`);
  if (seenPaths.has(publicPath)) fail(`duplicate public machine asset path: ${publicPath}`);
  if (seenSources.has(sourcePath)) fail(`duplicate machine asset source: ${sourcePath}`);
  seenPaths.add(publicPath);
  seenSources.add(sourcePath);
  if (!fs.existsSync(sourcePath)) fail(`missing source for machine asset ${publicPath}: ${sourcePath}`);
}

const primaryAssets = assets.filter(([role]) => role === 'primary');
if (primaryAssets.length !== 1 || primaryAssets[0][1] !== '/graph-ghezelbaash-final.jsonld') {
  fail('there must be exactly one primary graph asset: /graph-ghezelbaash-final.jsonld');
}

const auditAssets = assets.filter(([role]) => role === 'audit');
for (const requiredAuditPath of ['/ai-discovery-index.json', '/entity-hardening-index.json', '/publishing-crosswalk.jsonld', '/dataset-manifest.jsonld', '/local-competitive-landscape.json']) {
  if (!auditAssets.some(([, publicPath]) => publicPath === requiredAuditPath)) fail(`missing audit classification for ${requiredAuditPath}`);
}

const graphEndpoint = fs.readFileSync('src/pages/graph-ghezelbaash-final.jsonld.js', 'utf8');
if (!graphEndpoint.includes("../lib/globalGraph.mjs")) fail('global graph endpoint must use src/lib/globalGraph.mjs');

const researchEndpoint = fs.readFileSync('src/pages/research-graph.jsonld.js', 'utf8');
if (!researchEndpoint.includes('../lib/researchGraph.mjs')) fail('research graph endpoint must stay a thin projection from src/lib/researchGraph.mjs');

const knowledgeEndpoint = fs.readFileSync('src/pages/aesthetic_medicine_knowledge_kermanshah_fa.json.js', 'utf8');
if (!knowledgeEndpoint.includes('../lib/aestheticScopeGraph.mjs')) fail('aesthetic knowledge endpoint must use src/lib/aestheticScopeGraph.mjs');

const servicesEndpoint = fs.readFileSync('src/pages/services.json.js', 'utf8');
if (!servicesEndpoint.includes('../lib/aestheticScopeGraph.mjs')) fail('services endpoint must use src/lib/aestheticScopeGraph.mjs');

const pageSources = fs.readdirSync('src/pages').filter((name) => name.endsWith('.json.js') || name.endsWith('.jsonld.js') || name.endsWith('.txt.js') || name.endsWith('.csv.js') || name.endsWith('.xml.js') || name.endsWith('.html.js'));
for (const fileName of pageSources) {
  const sourcePath = `src/pages/${fileName}`;
  if (!seenSources.has(sourcePath)) fail(`unclassified machine-readable endpoint source: ${sourcePath}`);
}

if (failed) process.exit(1);
console.log('Machine-readable asset architecture validation passed');
