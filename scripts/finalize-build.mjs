import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const dist = resolve(root, 'dist');
const allowPlaceholders = process.argv.includes('--allow-placeholders');
const required = [
  'index.html',
  '404.html',
  'knowledge-graph.jsonld',
  'llms.txt',
  'llms-full.txt',
  'release.json',
  'asset-manifest.json',
  '_headers',
  '_redirects',
];

for (const file of required) {
  if (!existsSync(resolve(dist, file))) throw new Error(`Missing dist artifact: ${file}`);
}

const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');
const html = readFileSync(resolve(dist, 'index.html'));
const graph = readFileSync(resolve(dist, 'knowledge-graph.jsonld'));
const llms = readFileSync(resolve(dist, 'llms-full.txt'));
const releasePath = resolve(dist, 'release.json');
const release = JSON.parse(readFileSync(releasePath, 'utf8'));

writeFileSync(
  releasePath,
  `${JSON.stringify(
    {
      ...release,
      contentFrozen: allowPlaceholders ? false : release.contentFrozen,
      htmlSha256: sha256Hex(html),
      graphSha256: sha256Hex(graph),
      llmsSha256: sha256Hex(llms),
    },
    null,
    2,
  )}\n`,
  'utf8',
);

const htmlText = html.toString('utf8');
const jsonLdMatch = htmlText.match(
  /<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/iu,
);
if (!jsonLdMatch) throw new Error('Inline JSON-LD block was not found.');
const jsonLdHash = createHash('sha256').update(jsonLdMatch[1]).digest('base64');
const headersPath = resolve(dist, '_headers');
const headers = readFileSync(headersPath, 'utf8').replace('__JSON_LD_HASH__', jsonLdHash);
if (headers.includes('__JSON_LD_HASH__')) throw new Error('CSP hash placeholder was not resolved.');
writeFileSync(headersPath, headers, 'utf8');

if (!allowPlaceholders && htmlText.includes('TODO_VISIBLE_CONTENT')) {
  throw new Error('Production HTML contains unresolved visible-content placeholders.');
}

process.stdout.write(
  `Finalized dist: html=${sha256Hex(html).slice(0, 12)} graph=${sha256Hex(graph).slice(0, 12)} llms=${sha256Hex(llms).slice(0, 12)}\n`,
);
