import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function readIfExists(relPath) {
  const file = path.join(root, relPath);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}

const removedLegacyRootAssets = [
  'sameas.json',
  'graph-ghezelbaash-final.jsonld',
  'brand-kb.ghezelbaash.ai-public.json',
  'ai-discovery-index.json',
  'llms.txt',
  'services.json',
  'dataset-manifest.jsonld',
  'publishing-crosswalk.jsonld'
];

for (const file of removedLegacyRootAssets) {
  if (fs.existsSync(path.join(root, file))) {
    fail(`legacy root asset must not exist: ${file}`);
  }
}

const preparePublic = readIfExists('scripts/prepare-public.mjs') || '';
for (const file of [
  'sameas.json',
  'graph-ghezelbaash-final.jsonld',
  'brand-kb.ghezelbaash.ai-public.json',
  'ai-discovery-index.json',
  'dataset-manifest.jsonld',
  'publishing-crosswalk.jsonld',
  'llms.txt',
  'services.json',
  'sitemap.xml'
]) {
  if (preparePublic.includes(`'${file}'`) || preparePublic.includes(`"${file}"`)) {
    fail(`generated or deprecated asset must not be copied by prepare-public: ${file}`);
  }
}

for (const file of [
  'public/robots.txt'
]) {
  if (fs.existsSync(path.join(root, file))) {
    fail(`committed public duplicate must not exist: ${file}`);
  }
}

if (failed) process.exit(1);
console.log('Repository hygiene validation passed');
