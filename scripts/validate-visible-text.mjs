import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { CONTRACT_PATH, assertUnchanged, distContract, sourceContract, sourceRawHashes, protectedProjection } from './lib/visible-text-contract.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
const mode = args[0] || 'dist';
if (!['source', 'dist', '--initialize-baseline'].includes(mode)) throw new Error('Usage: validate-visible-text.mjs source|dist [dist-directory]');
const file = path.join(root, CONTRACT_PATH);
if (mode === '--initialize-baseline') {
  if (!args.includes('--acknowledge-frozen-text')) throw new Error('Explicit --acknowledge-frozen-text required; never initialize during build.');
  const baseline = { schemaVersion: 1, policy: 'closed-visible-text; NFC + whitespace-collapse per node; text-node sequence and reading order frozen; ID changes and heading levels permitted; raw source hashes record provenance', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceRawSha256: await sourceRawHashes(root), source: await sourceContract(root), documents: Object.fromEntries(Object.entries(await distContract(path.resolve(args[1] || 'dist'))).map(([name, doc]) => [name, { rawSha256: doc.rawSha256, bytes: doc.bytes, ...protectedProjection(doc) }])) };
  // Exclusive create makes an accidental rebaseline fail, even with the flag.
  await writeFile(file, `${JSON.stringify(baseline, null, 2)}\n`, { flag: 'wx' });
  console.log(`VISIBLE_TEXT_BASELINE_CREATED ${CONTRACT_PATH}`);
} else {
  const baseline = JSON.parse(await readFile(file, 'utf8'));
  if (baseline.schemaVersion !== 1) throw new Error('Unsupported visible text baseline');
  const source = await sourceContract(root);
  assertUnchanged(Object.keys(source), Object.keys(baseline.source), 'source baseline coverage');
  assertUnchanged(['index.html', '404.html'], Object.keys(baseline.documents), 'document baseline coverage');
  for (const key of Object.keys(baseline.source)) assertUnchanged(baseline.source[key], source[key], `source.${key}`);
  if (mode === 'dist') {
    const documents = await distContract(path.resolve(args[1] || 'dist'));
    for (const [name, { rawSha256, bytes, ...expected }] of Object.entries(baseline.documents)) assertUnchanged(expected, protectedProjection(documents[name]), name);
  }
  console.log(`CLOSED_VISIBLE_TEXT_${mode.toUpperCase()} PASS`);
}
