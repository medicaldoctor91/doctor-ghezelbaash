import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const EVENT_ID = 'https://www.ghezelbaash.ir/#event-wpa-xvii-world-congress-psychiatry-2017';

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function text(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

for (const relativePath of ['public/index.md', 'dist/index.md']) {
  const info = await stat(path.join(root, relativePath));
  requireCondition(info.size > 0, `${relativePath} is empty`);
}

const [sourceProjection, distProjection, graphRaw, turtle, headers, documentHead, sitemap] = await Promise.all([
  text('public/index.md'),
  text('dist/index.md'),
  text('public/graph.jsonld'),
  text('public/graph.ttl'),
  text('public/_headers'),
  text('src/components/DocumentHead.astro'),
  text('public/sitemap.xml'),
]);

requireCondition(sourceProjection === distProjection, 'public/index.md and dist/index.md differ');
requireCondition(sourceProjection.includes('canonical: "https://www.ghezelbaash.ir/"'), 'index.md canonical frontmatter is missing');
requireCondition(sourceProjection.includes('<h1 id="saeed-ghezelbash-aesthetic-medicine">'), 'index.md canonical H1 is missing');
requireCondition(!/<script\b/i.test(sourceProjection), 'index.md contains script markup');
requireCondition(!/<style\b/i.test(sourceProjection), 'index.md contains style markup');
requireCondition(!/application\/ld\+json/i.test(sourceProjection), 'index.md contains JSON-LD');
requireCondition(!sitemap.includes('/index.md'), 'index.md must not appear in sitemap.xml');

const graph = JSON.parse(graphRaw);
const nodes = Array.isArray(graph['@graph']) ? graph['@graph'] : [];
const event = nodes.find((node) => node?.['@id'] === EVENT_ID);
requireCondition(event, 'WPA XVII event is missing');
requireCondition(!Object.hasOwn(event, 'eventStatus'), 'WPA XVII eventStatus must be omitted');
requireCondition(event.startDate === '2017-10-08', 'WPA XVII startDate changed');
requireCondition(event.endDate === '2017-10-12', 'WPA XVII endDate changed');
requireCondition(!graphRaw.includes('https://schema.org/EventCompleted'), 'graph.jsonld contains EventCompleted');
requireCondition(!turtle.includes('EventCompleted'), 'graph.ttl contains EventCompleted');

requireCondition(documentHead.includes('rel="alternate" type="text/markdown" hreflang="fa-IR"'), 'Markdown alternate link is missing from DocumentHead');
requireCondition(documentHead.includes('rel="about" href="https://www.ghezelbaash.ir/#saeed-ghezelbash"'), 'Physician about link is missing from DocumentHead');
requireCondition(/^\/index\.md$/m.test(headers), '/index.md headers block is missing');
requireCondition(headers.includes('Content-Type: text/markdown; charset=utf-8'), 'index.md Content-Type header is missing');
requireCondition(headers.includes('X-Robots-Tag: noindex, follow'), 'index.md noindex header is missing');
requireCondition(headers.includes('</index.md>; rel="alternate"; type="text/markdown"; hreflang="fa-IR"'), 'Homepage Markdown Link header is missing');

console.log('Semantic hardening validation passed.');
