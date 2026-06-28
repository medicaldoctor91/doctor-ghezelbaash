import fs from 'node:fs';
import { machineAssets } from '../src/lib/machineAssets.mjs';

let failed = false;
function fail(message) {
  console.error(message);
  failed = true;
}

const roleMap = {
  'primary-graph': 'primary',
  'thin-projection': 'thin',
  export: 'export',
  discovery: 'discovery',
  landing: 'landing',
  'audit-thin-or-merge': 'audit'
};

const sourceByPath = {
  '/graph-ghezelbaash-final.jsonld': 'src/pages/graph-ghezelbaash-final.jsonld.js',
  '/brand-kb.ghezelbaash.ai-public.json': 'src/pages/brand-kb.ghezelbaash.ai-public.json.js',
  '/services.json': 'src/pages/services.json.js',
  '/research.json': 'src/pages/research.json.js',
  '/research-graph.jsonld': 'src/pages/research-graph.jsonld.js',
  '/aesthetic_medicine_knowledge_kermanshah_fa.json': 'src/pages/aesthetic_medicine_knowledge_kermanshah_fa.json.js',
  '/location.json': 'src/pages/location.json.js',
  '/nap.csv': 'src/pages/nap.csv.js',
  '/sameas.json': 'src/pages/sameas.json.js',
  '/authority-signals.json': 'src/pages/authority-signals.json.js',
  '/regulatory.json': 'src/pages/regulatory.json.js',
  '/profile-links.json': 'src/pages/profile-links.json.js',
  '/service-taxonomy.json': 'src/pages/service-taxonomy.json.js',
  '/dataset.json': 'src/pages/dataset.json.js',
  '/routes.json': 'src/pages/routes.json.js',
  '/page-context.json': 'src/pages/page-context.json.js',
  '/link-graph.json': 'src/pages/link-graph.json.js',
  '/seo-aeo-index.json': 'src/pages/seo-aeo-index.json.js',
  '/llms.txt': 'src/pages/llms.txt.js',
  '/robots.txt': 'src/pages/robots.txt.js',
  '/sitemap.xml': 'src/pages/sitemap.xml.js',
  '/ai-discovery-index.json': 'src/pages/ai-discovery-index.json.js',
  '/entity-hardening-index.json': 'src/pages/entity-hardening-index.json.js',
  '/local-competitive-landscape.json': 'src/pages/local-competitive-landscape.json.js',
  '/aesthetic-medicine-dataset.html': 'src/pages/aesthetic-medicine-dataset.html.js'
};

const seenPaths = new Set();
const seenSources = new Set();

for (const asset of machineAssets) {
  const role = roleMap[asset.role];
  const sourcePath = sourceByPath[asset.path];

  if (!role) fail(`unknown machine asset role: ${asset.role} for ${asset.path}`);
  if (!sourcePath) fail(`machine asset missing source mapping: ${asset.path}`);
  if (seenPaths.has(asset.path)) fail(`duplicate public machine asset path: ${asset.path}`);
  if (sourcePath && seenSources.has(sourcePath)) fail(`duplicate machine asset source: ${sourcePath}`);
  seenPaths.add(asset.path);
  if (sourcePath) seenSources.add(sourcePath);
  if (sourcePath && !fs.existsSync(sourcePath)) fail(`missing source for machine asset ${asset.path}: ${sourcePath}`);
}

const primaryAssets = machineAssets.filter((asset) => asset.role === 'primary-graph');
if (primaryAssets.length !== 1 || primaryAssets[0].path !== '/graph-ghezelbaash-final.jsonld') {
  fail('there must be exactly one primary graph asset: /graph-ghezelbaash-final.jsonld');
}

const auditAssets = machineAssets.filter((asset) => asset.role === 'audit-thin-or-merge');
for (const requiredAuditPath of ['/ai-discovery-index.json', '/entity-hardening-index.json', '/local-competitive-landscape.json']) {
  if (!auditAssets.some((asset) => asset.path === requiredAuditPath)) fail(`missing audit classification for ${requiredAuditPath}`);
}

const graphEndpoint = fs.readFileSync('src/pages/graph-ghezelbaash-final.jsonld.js', 'utf8');
if (!graphEndpoint.includes('../lib/globalGraph.mjs')) fail('global graph endpoint must use src/lib/globalGraph.mjs');

const researchEndpoint = fs.readFileSync('src/pages/research-graph.jsonld.js', 'utf8');
if (!researchEndpoint.includes('../lib/researchGraph.mjs')) fail('research graph endpoint must stay a thin projection from src/lib/researchGraph.mjs');

const knowledgeEndpoint = fs.readFileSync('src/pages/aesthetic_medicine_knowledge_kermanshah_fa.json.js', 'utf8');
if (!knowledgeEndpoint.includes('../lib/aestheticScopeGraph.mjs')) fail('aesthetic knowledge endpoint must use src/lib/aestheticScopeGraph.mjs');

const servicesEndpoint = fs.readFileSync('src/pages/services.json.js', 'utf8');
if (!servicesEndpoint.includes('../lib/aestheticScopeGraph.mjs')) fail('services endpoint must use src/lib/aestheticScopeGraph.mjs');

const retiredSources = new Set([
  'src/pages/dataset-manifest.jsonld.js',
  'src/pages/publishing-crosswalk.jsonld.js'
]);
const pageSources = fs.readdirSync('src/pages').filter((name) => name.endsWith('.json.js') || name.endsWith('.jsonld.js') || name.endsWith('.txt.js') || name.endsWith('.csv.js') || name.endsWith('.xml.js') || name.endsWith('.html.js'));
for (const fileName of pageSources) {
  const sourcePath = `src/pages/${fileName}`;
  if (retiredSources.has(sourcePath)) fail(`retired JSON-LD endpoint still exists: ${sourcePath}`);
  if (!seenSources.has(sourcePath)) fail(`unclassified machine-readable endpoint source: ${sourcePath}`);
}

if (failed) process.exit(1);
console.log('Machine-readable asset architecture validation passed');
