import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'dist', 'llms.txt');
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

if (!fs.existsSync(file)) {
  fail('missing dist/llms.txt');
} else {
  const text = fs.readFileSync(file, 'utf8');
  for (const requiredAsset of [
    '/routes.json',
    '/seo-aeo-index.json',
    '/page-context.json',
    '/link-graph.json',
    '/graph-ghezelbaash-final.jsonld',
    '/brand-kb.ghezelbaash.ai-public.json',
    '/ai-discovery-index.json',
    '/dataset-manifest.jsonld',
    '/publishing-crosswalk.jsonld',
    '/entity-hardening-index.json',
    '/aesthetic_medicine_knowledge_kermanshah_fa.json',
    '/services.json',
    '/service-taxonomy.json',
    '/sameas.json',
    '/regulatory.json',
    '/location.json',
    '/research.json',
    '/dataset.json',
    '/authority-signals.json',
    '/profile-links.json',
    '/nap.csv',
    '/sitemap.xml'
  ]) {
    if (!text.includes(requiredAsset)) fail(`llms.txt missing ${requiredAsset}`);
  }

  for (const requiredLine of [
    'Canonical site:',
    'Best-intent routing policy:',
    'Machine-readable root assets:',
    'Dataset policy:'
  ]) {
    if (!text.includes(requiredLine)) fail(`llms.txt missing section: ${requiredLine}`);
  }
}

if (failed) process.exit(1);
console.log('LLMS machine asset validation passed');
