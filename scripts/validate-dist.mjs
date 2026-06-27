import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function assertFile(relPath) {
  const file = path.join(dist, relPath);
  if (!fs.existsSync(file)) {
    fail(`missing dist/${relPath}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) fail(`${label} missing ${needle}`);
}

const requiredFiles = [
  'index.html',
  'sitemap.xml',
  'llms.txt',
  'services.json',
  'sameas.json',
  'brand-kb.ghezelbaash.ai-public.json',
  'ai-discovery-index.json',
  'graph-ghezelbaash-final.jsonld',
  'robots.txt',
  'CNAME'
];

for (const file of requiredFiles) assertFile(file);

const serviceSlugs = [
  'botox-kermanshah',
  'filler-kermanshah',
  'thread-lift-kermanshah',
  'skin-hair-rejuvenation-kermanshah',
  'double-chin-liposuction-kermanshah'
];

const sitemap = assertFile('sitemap.xml');
const llms = assertFile('llms.txt');
const servicesJson = JSON.parse(assertFile('services.json'));
const sameasJson = JSON.parse(assertFile('sameas.json'));
const brandKb = JSON.parse(assertFile('brand-kb.ghezelbaash.ai-public.json'));

for (const slug of serviceSlugs) {
  assertIncludes(sitemap, `https://www.ghezelbaash.ir/${slug}/`, 'sitemap.xml');
  const html = assertFile(`${slug}/index.html`);
  assertIncludes(html, '<meta name="robots" content="index,follow">', `${slug}/index.html`);
}

assertIncludes(llms, 'Indexable service pages:', 'llms.txt');
assertIncludes(llms, 'Dr. Saeed Ghezelbash', 'llms.txt');

if (!Array.isArray(servicesJson.parentServicePages) || servicesJson.parentServicePages.length !== 5) {
  fail('services.json must expose exactly five parentServicePages');
}

for (const service of servicesJson.parentServicePages || []) {
  if (service.robots !== 'index,follow') fail(`service ${service.slug || service.key} is not index,follow`);
}

const sameAsText = JSON.stringify(sameasJson);
for (const qid of ['Q140287622', 'Q140288589', 'Q140304972']) {
  assertIncludes(sameAsText, qid, 'sameas.json');
}

const brandKbText = JSON.stringify(brandKb);
assertIncludes(brandKbText, 'www.ghezelbaash.ir', 'brand-kb');
assertIncludes(brandKbText, 'index,follow', 'brand-kb');

if (!process.exitCode) console.log('Astro dist validation passed');
