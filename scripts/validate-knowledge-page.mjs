import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'dist');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const knowledgePath = join(root, 'knowledge', 'index.html');
check(existsSync(knowledgePath), '/knowledge/ page missing');

if (existsSync(knowledgePath)) {
  const html = readFileSync(knowledgePath, 'utf8');
  check(statSync(knowledgePath).size < 300_000, `/knowledge/ HTML exceeds 300KB: ${statSync(knowledgePath).size}`);
  check(/<html\b[^>]*\blang="en"/i.test(html), '/knowledge/ must use lang="en"');
  check(/<html\b[^>]*\bdir="ltr"/i.test(html), '/knowledge/ must use dir="ltr"');
  check(html.includes('<link rel="canonical" href="https://www.ghezelbaash.ir/knowledge/">'), '/knowledge/ canonical mismatch');
  check((html.match(/<h1\b/gi) ?? []).length === 1, '/knowledge/ must contain exactly one H1');
  check(html.includes('Knowledge &amp; AI Resources') || html.includes('Knowledge & AI Resources'), '/knowledge/ English title missing');
  check(!/[\u0600-\u06FF]/u.test(html), '/knowledge/ contains Persian or Arabic-script text');
  check(html.includes('href="https://www.instagram.com/doctor.ghezelbaash/"') && html.includes('rel="me noopener noreferrer external"'), '/knowledge/ official Instagram rel=me link missing');
  check(html.includes('href="https://huggingface.co/Ghezelbaash"'), '/knowledge/ Hugging Face profile link missing');
  check(html.includes('href="https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data"'), '/knowledge/ Hugging Face dataset link missing');
  check(html.includes('href="https://www.wikidata.org/entity/Q140288589"'), '/knowledge/ clinic Wikidata link missing');
  check(html.includes('href="https://www.wikidata.org/entity/Q140304972"'), '/knowledge/ dataset Wikidata link missing');

  const jsonLdMatches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  check(jsonLdMatches.length === 1, `/knowledge/ expected one JSON-LD block, found ${jsonLdMatches.length}`);
  if (jsonLdMatches[0]) {
    try {
      const data = JSON.parse(jsonLdMatches[0][1]);
      const nodes = data['@graph'] ?? [];
      const types = nodes.flatMap((node) => Array.isArray(node['@type']) ? node['@type'] : [node['@type']]);
      check(types.includes('CollectionPage'), '/knowledge/ CollectionPage missing');
      check(types.includes('ItemList'), '/knowledge/ ItemList missing');
      check(types.includes('BreadcrumbList'), '/knowledge/ BreadcrumbList missing');
      check(types.filter((type) => type === 'DigitalDocument').length === 18, `/knowledge/ expected 18 DigitalDocument nodes`);
      check(types.filter((type) => type === 'Dataset').length === 1, '/knowledge/ must include exactly one Dataset node for the published Hugging Face dataset');
      check(!types.includes('KnowledgePanel'), '/knowledge/ includes invalid KnowledgePanel type');
      const ids = nodes.map((node) => node['@id']).filter(Boolean);
      check(ids.length === new Set(ids).size, '/knowledge/ JSON-LD contains duplicate @id values');
      const page = nodes.find((node) => node['@type'] === 'CollectionPage');
      check(page?.inLanguage === 'en', '/knowledge/ CollectionPage inLanguage must be en');
      check(page?.mainEntity?.['@id'] === 'https://www.ghezelbaash.ir/knowledge/#resource-list', '/knowledge/ mainEntity mismatch');
      const dataset = nodes.find((node) => node['@type'] === 'Dataset');
      check(dataset?.url === 'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data', '/knowledge/ Hugging Face dataset URL mismatch');
      check(dataset?.creator?.['@id'] === 'https://www.ghezelbaash.ir/#person', '/knowledge/ Dataset creator mismatch');
      check(dataset?.publisher?.['@id'] === 'https://www.ghezelbaash.ir/#clinic', '/knowledge/ Dataset publisher mismatch');
      check((dataset?.sameAs ?? []).includes('https://www.wikidata.org/entity/Q140304972'), '/knowledge/ Dataset sameAs is missing Wikidata Q140304972');
      check((dataset?.identifier ?? []).some((item) => item?.propertyID === 'Wikidata' && item?.value === 'Q140304972'), '/knowledge/ Dataset identifier is missing Wikidata Q140304972');
    } catch (error) {
      failures.push(`/knowledge/ invalid JSON-LD: ${error.message}`);
    }
  }

  const localHrefs = [...html.matchAll(/href="(\/[^"#?]*\/?)(?:#[^"]*)?"/gi)].map((match) => match[1]);
  for (const href of new Set(localHrefs)) {
    const relative = href.replace(/^\/+/, '');
    const path = relative.endsWith('/') ? join(root, relative, 'index.html') : join(root, relative);
    check(existsSync(path), `/knowledge/ broken local link: ${href}`);
  }
}

for (const [path, needle] of [
  [join(root, 'llms.txt'), 'https://www.ghezelbaash.ir/knowledge/'],
  [join(root, '.well-known', 'ai.txt'), 'https://www.ghezelbaash.ir/knowledge/'],
  [join(root, 'sitemap.xml'), '<loc>https://www.ghezelbaash.ir/knowledge/</loc>'],
]) {
  check(existsSync(path), `required file missing: ${path}`);
  if (existsSync(path)) check(readFileSync(path, 'utf8').includes(needle), `${path} missing knowledge directory URL`);
}

for (const path of [join(root, 'ai', 'summary.json'), join(root, 'knowledge-manifest.json')]) {
  check(existsSync(path), `required JSON missing: ${path}`);
}
if (existsSync(join(root, 'ai', 'summary.json'))) {
  const summary = JSON.parse(readFileSync(join(root, 'ai', 'summary.json'), 'utf8'));
  check(summary.discovery?.knowledgeDirectory === 'https://www.ghezelbaash.ir/knowledge/', 'AI summary knowledgeDirectory mismatch');
}
if (existsSync(join(root, 'knowledge-manifest.json'))) {
  const manifest = JSON.parse(readFileSync(join(root, 'knowledge-manifest.json'), 'utf8'));
  check(manifest.humanDirectory === 'https://www.ghezelbaash.ir/knowledge/', 'knowledge manifest humanDirectory mismatch');
  check(manifest.publishedDataset?.wikidata === 'https://www.wikidata.org/entity/Q140304972', 'knowledge manifest dataset Wikidata mismatch');
}

const homePath = join(root, 'index.html');
if (existsSync(homePath)) {
  const home = readFileSync(homePath, 'utf8');
  check(home.includes('href="/knowledge/"') && (home.includes('Knowledge &amp; AI resources') || home.includes('Knowledge & AI resources')), 'homepage footer link to /knowledge/ missing');
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  page: '/knowledge/',
  language: 'en',
  direction: 'ltr',
  digitalDocuments: 18,
  datasetTypeUsed: true,
  brokenLocalLinks: 0,
}, null, 2));
