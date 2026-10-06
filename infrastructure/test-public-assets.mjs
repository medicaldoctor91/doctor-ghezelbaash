import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSourceObject } from './finalize-dist.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceFile = path.join(root, 'src/pages/index.astro');
const SOURCE = await extractSourceObject(sourceFile);
const sourceText = await fs.readFile(sourceFile, 'utf8');
const origin = new URL(SOURCE.canonicalOrigin).origin;
const assetExt = '(?:avif|webp|png|jpe?g|svg|mp4|webm|vtt|woff2|webmanifest)';
const required = new Set();
const addFromString = (text) => {
  const escapedOrigin = origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:${escapedOrigin})?(\\/(?:media|fonts)\\/[^\\s\"'<>),\\\\]+?\\.${assetExt}|\\/(?:favicon\\.(?:png|svg)|apple-touch-icon\\.png|site\\.webmanifest))`, 'gi');
  for (const match of text.matchAll(re)) required.add(match[1].split(/[?#]/)[0]);
};

const collect = (value) => {
  if (typeof value === 'string') {
    addFromString(value);
    return;
  }
  if (Array.isArray(value)) return value.forEach(collect);
  if (value && typeof value === 'object') Object.values(value).forEach(collect);
};
collect(SOURCE);

// Also catch authored HTML/head literals outside SOURCE.
addFromString(sourceText);


const publicFiles = [];
const walkPublic = async (dir) => {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkPublic(file); else publicFiles.push(file);
  }
};
await walkPublic(path.join(root, 'public'));
const fingerprintedSemanticAssets = publicFiles
  .map((file) => '/' + path.relative(path.join(root, 'public'), file).split(path.sep).join('/'))
  .filter((assetPath) => /^\/(?:media|fonts)\//.test(assetPath) && /\.[0-9a-f]{12}\./i.test(assetPath));
assert.deepEqual(fingerprintedSemanticAssets, [], `Fingerprint aliases must not duplicate stable semantic media/font identities:
${fingerprintedSemanticAssets.join('\n')}`);
assert(!/\/(?:media|fonts)\/[^"'\s)>,]+\.[0-9a-f]{12}\./i.test(sourceText), 'Source must reference stable semantic media/font URLs');

assert.ok(required.size >= 50, `Expected a substantial first-party asset inventory, got ${required.size}`);
const missing = [];
for (const assetPath of [...required].sort()) {
  const file = path.join(root, 'public', assetPath.replace(/^\//, ''));
  try { await fs.access(file); } catch { missing.push(assetPath); }
}
assert.deepEqual(missing, [], `Missing public assets:\n${missing.join('\n')}`);
console.log(JSON.stringify({ publicAssetContract: 'PASS', assets: required.size }, null, 2));
