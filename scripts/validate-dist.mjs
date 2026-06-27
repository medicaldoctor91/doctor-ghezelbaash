import fs from 'node:fs';
import path from 'node:path';

const dist = path.join(process.cwd(), 'dist');
let failed = false;

function read(relPath) {
  const file = path.join(dist, relPath);
  if (!fs.existsSync(file)) {
    console.error(`missing dist/${relPath}`);
    failed = true;
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

function mustContain(relPath, needle) {
  const text = read(relPath);
  if (!text.includes(needle)) {
    console.error(`dist/${relPath} missing ${needle}`);
    failed = true;
  }
  return text;
}

const required = [
  'index.html',
  'sitemap.xml',
  'llms.txt',
  'services.json',
  'sameas.json',
  'brand-kb.ghezelbaash.ai-public.json',
  'ai-discovery-index.json',
  'entity-hardening-index.json',
  'regulatory.json',
  'location.json',
  'research.json',
  'dataset.json',
  'authority-signals.json',
  'profile-links.json',
  'service-taxonomy.json',
  'graph-ghezelbaash-final.jsonld',
  'robots.txt',
  'CNAME'
];

for (const file of required) read(file);

for (const slug of [
  'botox-kermanshah',
  'filler-kermanshah',
  'thread-lift-kermanshah',
  'skin-hair-rejuvenation-kermanshah',
  'double-chin-liposuction-kermanshah'
]) {
  mustContain('sitemap.xml', `https://www.ghezelbaash.ir/${slug}/`);
  mustContain(`${slug}/index.html`, '<meta name="robots" content="index,follow">');
}

mustContain('sameas.json', 'Q140287622');
mustContain('sameas.json', 'Q140288589');
mustContain('sameas.json', 'Q140304972');
mustContain('brand-kb.ghezelbaash.ai-public.json', 'ghezelbaash.brand_kb.astro.v4.superset');
mustContain('brand-kb.ghezelbaash.ai-public.json', 'publicationIdentifiers');
mustContain('brand-kb.ghezelbaash.ai-public.json', 'authoritySignals');
mustContain('brand-kb.ghezelbaash.ai-public.json', '167430');
mustContain('regulatory.json', '167430');
mustContain('location.json', 'ساختمان ویستا');
mustContain('research.json', '0009-0001-9346-8475');
mustContain('research.json', '34574943');
mustContain('dataset.json', '10.5281/zenodo.18765169');
mustContain('entity-hardening-index.json', 'entity_hardening');
mustContain('authority-signals.json', 'authority_signals');

if (failed) process.exit(1);
console.log('Astro dist validation passed');
