import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { hardenRichResultsGraph } from '../src/lib/rich-results-graph.mjs';

const headGraphPath = new URL('../src/data/semantic/head-graph.min.jsonld', import.meta.url);
const headersPath = new URL('../public/_headers', import.meta.url);

const rawGraph = await readFile(headGraphPath, 'utf8');
const structuredData = hardenRichResultsGraph(rawGraph);
const digest = createHash('sha256').update(structuredData, 'utf8').digest('base64');
const hashToken = `'sha256-${digest}'`;

const headers = await readFile(headersPath, 'utf8');
const nextHeaders = headers.replace(
  /(script-src 'self' )'sha256-[A-Za-z0-9+/=]+';/,
  `$1${hashToken};`,
);

if (nextHeaders === headers && !headers.includes(hashToken)) {
  throw new Error('Unable to synchronize the Head Graph CSP hash in public/_headers.');
}

await writeFile(headersPath, nextHeaders, 'utf8');
console.log(`Synchronized Rich Results JSON-LD CSP hash: ${hashToken}`);
