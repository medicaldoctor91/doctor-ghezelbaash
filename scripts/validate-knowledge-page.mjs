import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'dist');
const site = 'https://www.ghezelbaash.ir/';
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const html = readFileSync(join(root, 'index.html'), 'utf8');
const graphPath = join(root, 'knowledge-graph.jsonld');
check(existsSync(graphPath), '/knowledge-graph.jsonld missing');
const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
const nodes = graph['@graph'] ?? [];
const typeCount = (type) => nodes.filter((node) => (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).includes(type)).length;

check(graph['@context'] === 'https://schema.org', 'canonical graph context mismatch');
check(statSync(graphPath).size > 500_000, `canonical graph is unexpectedly abbreviated: ${statSync(graphPath).size} bytes`);
check(statSync(graphPath).size < 5_000_000, `canonical graph exceeds 5MB: ${statSync(graphPath).size}`);
check(nodes.length >= 800, `canonical graph must preserve broad semantic coverage; found ${nodes.length} nodes`);
check(typeCount('VideoObject') === 12, 'canonical graph must contain all 12 videos');
check(typeCount('Clip') === 36, 'canonical graph must contain all 36 clips');
check(typeCount('ScholarlyArticle') === 2, 'canonical graph must contain both verified scholarly works');
check(typeCount('Service') >= 20, 'canonical graph lost service coverage');
check(typeCount('Dataset') >= 3, 'canonical graph must describe graph, retrieval and published datasets');
check(!nodes.some((node) => String(node['@id'] ?? '').includes('#intent-')), 'search intent records leaked into semantic graph');

const graphDataset = nodes.find((node) => node['@id'] === `${site}#knowledge-graph-dataset`);
const retrievalDataset = nodes.find((node) => node['@id'] === `${site}#retrieval-corpus`);
const knowledgeSection = nodes.find((node) => node['@id'] === `${site}#knowledge-resources`);
check(graphDataset?.distribution?.contentUrl === `${site}knowledge-graph.jsonld`, 'graph Dataset does not self-describe canonical distribution');
check((retrievalDataset?.distribution ?? []).length === 6, 'retrieval Dataset must list six corpus entry points');
check(knowledgeSection?.isPartOf?.['@id'] === `${site}#webpage`, 'Knowledge WebPageElement is not part of homepage');

check(html.includes('id="knowledge-resources"'), 'visible Knowledge & AI section missing from homepage');
check(html.includes('href="#knowledge-resources"'), 'Content Table or navigation does not link Knowledge section');
for (const id of ['knowledge-identity', 'knowledge-retrieval']) check(html.includes(`id="${id}"`), `visible Knowledge subsection missing: ${id}`);
for (const url of ['/knowledge-graph.jsonld', '/search/index.json', '/answers/index.json', '/intents/index.json', '/evidence/sources.json', '/media/index.json']) check(html.includes(`href="${url}"`), `Knowledge section missing resource ${url}`);

for (const removed of ['knowledge/index.html', 'knowledge-manifest.json', 'graph.json', 'graph-summary.json', 'identity-crosswalk.json', 'research.jsonld']) {
  check(!existsSync(join(root, removed)), `removed graph architecture artifact exists: /${removed}`);
}

if (failures.length) { console.error(JSON.stringify({ status: 'fail', failures }, null, 2)); process.exit(1); }
console.log(JSON.stringify({ status: 'pass', graphNodes: nodes.length, graphBytes: statSync(graphPath).size, knowledgeOnHomepage: true, semanticGraph: true, retrievalSeparated: true, graphManifest: false }, null, 2));
