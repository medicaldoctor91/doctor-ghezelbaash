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
  'dataset-manifest.jsonld',
  'publishing-crosswalk.jsonld'
];

for (const file of removedLegacyRootAssets) {
  if (fs.existsSync(path.join(root, file))) {
    fail(`legacy root asset must not exist: ${file}`);
  }
}

const aiDiscoveryPointer = readIfExists('ai-discovery-index.json');
if (aiDiscoveryPointer) {
  if (!aiDiscoveryPointer.includes('ghezelbaash.legacy_pointer.v1')) {
    fail('root ai-discovery-index.json must remain a legacy pointer only');
  }
  if (!aiDiscoveryPointer.includes('https://www.ghezelbaash.ir/ai-discovery-index.json')) {
    fail('root ai-discovery-index.json must point to the canonical live endpoint');
  }
}

const llmsPointer = readIfExists('llms.txt');
if (llmsPointer) {
  if (!llmsPointer.includes('Deprecated repository-root pointer')) {
    fail('root llms.txt must remain a deprecated pointer only');
  }
  if (!llmsPointer.includes('https://www.ghezelbaash.ir/llms.txt')) {
    fail('root llms.txt must point to the canonical live endpoint');
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
  'llms.txt'
]) {
  if (preparePublic.includes(`'${file}'`) || preparePublic.includes(`"${file}"`)) {
    fail(`generated or deprecated asset must not be copied by prepare-public: ${file}`);
  }
}

if (failed) process.exit(1);
console.log('Repository hygiene validation passed');
