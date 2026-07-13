import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { videos } from '../src/domain/media.mjs';
import { serviceUrlRegistry } from '../src/domain/url-architecture.mjs';

const root = join(process.cwd(), 'dist');
const site = 'https://www.ghezelbaash.ir/';
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const files = [];
const walkFiles = (directory) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    statSync(path).isDirectory() ? walkFiles(path) : files.push(path);
  }
};
walkFiles(root);

const homepagePath = join(root, 'index.html');
const homepage = readFileSync(homepagePath, 'utf8');
const visible = homepage
  .replace(/<head[\s\S]*?<\/head>/giu, ' ')
  .replace(/<script[\s\S]*?<\/script>/giu, ' ')
  .replace(/<style[\s\S]*?<\/style>/giu, ' ')
  .replace(/<[^>]+>/gu, ' ')
  .replace(/\s+/gu, ' ');

const htmlFiles = files.filter((path) => path.endsWith('.html')).map((path) => relative(root, path));
check(htmlFiles.length === 2 && htmlFiles.includes('index.html') && htmlFiles.includes('404.html'), `expected only index.html and 404.html; found ${htmlFiles.join(', ')}`);
check(statSync(homepagePath).size < 700_000, `homepage exceeds 700KB: ${statSync(homepagePath).size}`);
check((homepage.match(/<h1\b/giu) ?? []).length === 1, 'homepage must contain exactly one h1');
check((homepage.match(/<video\b/giu) ?? []).length === videos.length, `homepage must contain ${videos.length} initial video elements`);
check((homepage.match(/<video\b[^>]*preload="none"/giu) ?? []).length === videos.length, 'every video must use preload="none"');
check((homepage.match(/<source\b[^>]*type="video\/mp4"/giu) ?? []).length === videos.length, 'every video must expose an MP4 source in initial HTML');
check(!/<div\b[^>]*aria-label=/iu.test(homepage.replace(/<div\b[^>]*role="(?:group|navigation|region)"[^>]*aria-label=[^>]*>/giu, '')), 'generic div uses aria-label without an explicit role');
check(!/<time\b(?![^>]*datetime=)/iu.test(homepage), 'time element missing datetime');

for (const phrase of ['Knowledge & AI', 'Retrieval Corpus', 'Search Intent', 'knowsAbout', 'مدل زبانی', 'موتورهای جست‌وجو', 'گوگل و LLM']) {
  check(!visible.includes(phrase), `machine-facing phrase leaked into visible UI: ${phrase}`);
}

const ids = [...homepage.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
const idSet = new Set(ids);
check(ids.length === idSet.size, `duplicate HTML ids: ${[...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].join(', ')}`);
for (const href of [...homepage.matchAll(/href="#([^"]+)"/gu)].map((match) => match[1])) {
  check(idSet.has(href), `broken homepage fragment: #${href}`);
}
for (const item of serviceUrlRegistry) check(idSet.has(item.anchor), `missing stable service anchor: #${item.anchor}`);

const inlineMatches = [...homepage.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gu)];
check(inlineMatches.length === 1, `expected one inline JSON-LD block; found ${inlineMatches.length}`);
const inline = JSON.parse(inlineMatches[0][1]);
const full = JSON.parse(readFileSync(join(root, 'knowledge-graph.jsonld'), 'utf8'));

function auditGraph(label, graph) {
  const nodes = graph['@graph'] ?? [];
  const graphIds = nodes.map((node) => node['@id']).filter(Boolean);
  const defined = new Set(graphIds);
  const references = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    if (typeof value['@id'] === 'string' && value['@id'].startsWith(site)) references.add(value['@id']);
    Object.values(value).forEach(visit);
  };
  nodes.forEach(visit);
  check(graphIds.length === defined.size, `${label}: duplicate @id values`);
  check([...references].every((id) => defined.has(id)), `${label}: dangling same-site @id references`);
  const page = nodes.find((node) => node['@id'] === `${site}#webpage`);
  check(page?.mainEntity?.['@id'] === `${site}#person` && !Array.isArray(page?.mainEntity), `${label}: Person must be the sole page mainEntity`);
  return { nodes, defined };
}

const fullAudit = auditGraph('canonical graph', full);
const inlineAudit = auditGraph('inline graph', inline);
check(fullAudit.nodes.length >= 800, `canonical graph unexpectedly narrow: ${fullAudit.nodes.length}`);
check(inlineAudit.nodes.length <= 60, `inline projection is too broad: ${inlineAudit.nodes.length}`);
check(!inlineAudit.nodes.some((node) => [node['@type']].flat().some((type) => type === 'VideoObject' || type === 'Clip')), 'inline projection must not claim video rich-result eligibility without verified uploadDate');
for (const id of inlineAudit.defined) check(fullAudit.defined.has(id), `inline @id absent from canonical graph: ${id}`);
check(fullAudit.defined.has(`${site}#knowledge-graph-dataset`), 'canonical Dataset node missing');
check(!fullAudit.defined.has(`${site}#retrieval-corpus`), 'removed retrieval Dataset still exists');

for (const node of fullAudit.nodes) {
  const values = [];
  const visit = (value, key = '') => {
    if (Array.isArray(value)) return value.forEach((item) => visit(item, key));
    if (!value || typeof value !== 'object') return;
    for (const [childKey, child] of Object.entries(value)) {
      if ((childKey === 'url' || childKey === 'contentUrl') && typeof child === 'string') values.push(child);
      visit(child, childKey);
    }
  };
  visit(node);
  for (const value of values.filter((url) => url.startsWith(`${site}#`))) {
    check(idSet.has(value.split('#')[1]), `graph URL has no HTML anchor: ${value}`);
  }
}

const videoNodes = fullAudit.nodes.filter((node) => [node['@type']].flat().includes('VideoObject'));
const clipNodes = fullAudit.nodes.filter((node) => [node['@type']].flat().includes('Clip'));
check(videoNodes.length === videos.length, `canonical graph must contain ${videos.length} VideoObject nodes`);
check(clipNodes.length === videos.length * 3, `canonical graph must contain ${videos.length * 3} Clip nodes`);
for (const video of videoNodes) {
  check((video.hasPart ?? []).length === 3, `${video['@id']}: expected three clips`);
  check(video.url === video['@id'], `${video['@id']}: URL must target the visible video anchor`);
}
for (const clip of clipNodes) check(clip.url === clip['@id'], `${clip['@id']}: URL must target its visible chapter anchor`);

for (const path of [
  'knowledge-graph.jsonld', 'sitemap.xml', 'image-sitemap.xml', 'video-sitemap.xml',
  'llms.txt', 'site.webmanifest', 'robots.txt', '.well-known/ai.txt', '.well-known/security.txt',
]) check(existsSync(join(root, path)), `required public artifact missing: /${path}`);

for (const removed of [
  'context.json', 'llms-full.txt', 'answers.json', 'search.json', 'intents.json', 'services.json',
  'authority-map.json', 'authority-network.json', 'decision-capsules.json', 'editorial-review.json',
  'reputation.json', 'claims.json', 'evidence.json', 'media.json', 'ontology.json', 'resolver.json',
  'ai', 'answers', 'search', 'intents', 'evidence', 'media/index.json', 'knowledge-manifest.json',
]) check(!existsSync(join(root, removed)), `removed artifact still exists: /${removed}`);

for (const path of files) check(statSync(path).size > 0, `zero-byte public file: ${relative(root, path)}`);

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  htmlPages: htmlFiles.length,
  homepageBytes: statSync(homepagePath).size,
  htmlIds: ids.length,
  videos: videoNodes.length,
  clips: clipNodes.length,
  inlineGraphNodes: inlineAudit.nodes.length,
  canonicalGraphNodes: fullAudit.nodes.length,
  publicFiles: files.length,
}, null, 2));

