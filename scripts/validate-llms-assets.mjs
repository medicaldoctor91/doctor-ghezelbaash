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
    '/services.json',
    '/service-taxonomy.json',
    '/sameas.json',
    '/regulatory.json',
    '/location.json',
    '/research.json',
    '/authority-signals.json',
    '/sitemap.xml'
  ]) {
    if (!text.includes(requiredAsset)) fail(`llms.txt missing ${requiredAsset}`);
  }
}

if (failed) process.exit(1);
console.log('LLMS machine asset validation passed');
