import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { SOURCE } from '../src/canonical/source.mjs';

const dist = path.resolve(process.argv[2] ?? 'dist');
const origin = new URL(process.argv[3] ?? SOURCE.canonicalOrigin).origin;
assert.ok(origin === SOURCE.canonicalOrigin || /^https:\/\/(?:[a-z0-9-]+\.)?doctor-ghezelbaash\.pages\.dev$/.test(origin), 'Unexpected live website');
const provenance = JSON.parse(await fs.readFile(path.join(dist, 'release-provenance.json'), 'utf8'));
const manifestBytes = await fs.readFile(path.join(dist, 'integrity-manifest.json'));
const manifest = JSON.parse(manifestBytes);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function get(resourcePath, userAgent) {
  const url = new URL(resourcePath, origin);
  url.searchParams.set('release', provenance.sourceCommit);
  const response = await fetch(url, { headers: { 'User-Agent': userAgent ?? 'ghezelbaash-release-verifier/1.0', 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(45_000) });
  return { response, bytes: Buffer.from(await response.arrayBuffer()) };
}
// Pages upload completion can precede activation on the custom domain.
// Readiness requires the exact sealed manifest before verifying any live files.
const readinessDeadline = Date.now() + 90_000;
let remoteManifest;
let readinessAttempts = 0;
do {
  readinessAttempts++;
  remoteManifest = await get('/integrity-manifest.json');
  if (remoteManifest.response.status === 200 && hash(remoteManifest.bytes) === hash(manifestBytes)) break;
  if (Date.now() >= readinessDeadline) break;
  await new Promise(resolve => setTimeout(resolve, 2_000));
} while (Date.now() < readinessDeadline);
assert.equal(remoteManifest.response.status, 200, 'Live integrity manifest must be accessible');
assert.equal(hash(remoteManifest.bytes), hash(manifestBytes), 'Live release must match verified local manifest');

// Pages consumes these configuration files rather than serving them as assets.
const privateConfig = new Set(['/_headers', '/_redirects']);
const entries = Object.entries(manifest.files).filter(([name]) => !privateConfig.has(name));
let next = 0, verifiedBytes = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < entries.length) {
    const [name, expected] = entries[next++];
    const { response, bytes } = await get(name);
    assert.ok(response.status === 200 || (name === '/404.html' && response.status === 404), `Live file ${name}: ${response.status}`);
    assert.equal(bytes.length, expected.bytes, `Live byte size ${name}`);
    assert.equal(hash(bytes), expected.sha256, `Live SHA-256 ${name}`);
    verifiedBytes += bytes.length;
  }
}));

for (const resource of [...SOURCE.machineResources, ...(SOURCE.delivery.releaseResources ?? [])]) {
  const { response } = await get(resource.path);
  assert.equal(response.status, 200, `Machine resource ${resource.path}`);
  assert.equal(response.headers.get('content-type')?.split(';')[0].trim(), resource.mediaType, `Machine MIME ${resource.path}`);
  if (resource.indexing !== 'canonical-html') assert.match(response.headers.get('link') ?? '', /rel=canonical/, `Machine canonical Link ${resource.path}`);
  if (resource.indexing === 'machine' || resource.indexing === 'contact') {
    assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/, `Machine indexing ${resource.path}`);
    assert.equal(response.headers.get('access-control-allow-origin'), '*', `Machine CORS ${resource.path}`);
  }
}
const home = await get('/');
assert.equal(home.response.status, 200);
assert.equal(home.response.headers.get('cache-control'), SOURCE.delivery.html.cacheControl, 'Live HTML freshness policy');
if (origin === SOURCE.canonicalOrigin) assert.doesNotMatch(home.response.headers.get('x-robots-tag') ?? '', /noindex|nofollow/i, 'Production Home remains indexable');
assert.ok(home.response.headers.get('content-security-policy'), 'Live CSP');
assert.match(home.response.headers.get('link') ?? '', /rel=describedby/, 'Home graph HTTP discovery');
const html = home.bytes.toString('utf8');
const inline = /<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(html);
assert.ok(inline, 'Home inline graph');
assert.ok(inline.index + inline[0].length < html.indexOf('<body'), 'Full Home graph before visible content');
assert.deepEqual(JSON.parse(inline[1]), SOURCE.graph, 'Full Home canonical graph');
assert.ok(SOURCE.graph['@graph'].some(n => [].concat(n['@type'] ?? []).includes('ProfilePage') && n.mainEntity?.['@id'] === `${SOURCE.canonicalOrigin}/#saeed-ghezelbash`), 'Home ProfilePage identifies physician');
assert.match(html, /<link\b[^>]*integrity="sha384-/, 'Live stylesheet SRI');
const missing = await get('/release-verification-missing-page');
assert.equal(missing.response.status, 404, 'Actual not-found HTTP status');
assert.match(missing.response.headers.get('x-robots-tag') ?? '', /noindex/, 'Not-found indexing');
// Status-based response corrections belong to the canonical Cloudflare zone.
if (origin === SOURCE.canonicalOrigin) {
  assert.equal(missing.response.headers.get('cache-control'), 'no-store', 'Error responses must not persist in caches');
  assert.equal(missing.response.headers.get('link'), null, 'Errors must not inherit canonical graph relationships');
  assert.equal(missing.response.headers.get('content-type')?.split(';')[0].trim(), 'text/html', 'Error response uses the HTML body MIME');
  const missingSubject = await get('/graph.jsonld/release-verification-missing-subject');
  assert.equal(missingSubject.response.status, 404, 'Undefined graph subject remains not found');
  assert.equal(missingSubject.response.headers.get('content-type')?.split(';')[0].trim(), 'text/html', 'Undefined subjects must not label HTML errors as JSON-LD');
  assert.equal(missingSubject.response.headers.get('link'), null, 'Undefined subjects must not advertise graph identity relationships');
  assert.equal(missingSubject.response.headers.get('cache-control'), 'no-store', 'Undefined subjects must not be cached');
}
const errorPage = await get('/404');
assert.match(errorPage.response.headers.get('x-robots-tag') ?? '', /noindex/, 'Normalized error document indexing');
assert.equal(errorPage.response.headers.get('cache-control'), 'no-store', 'Normalized error document must not be cached');
assert.equal(errorPage.response.headers.get('link'), null, 'Normalized error document has no canonical graph relationships');
for (const [name] of entries.filter(([name]) => /^\/assets\/(?:site|reader|guide|guide-meta)\.[a-f0-9]+\.(?:css|js|json)$/.test(name))) {
  const { response } = await get(name);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable', `Hashed asset cache policy ${name}`);
  if (name.startsWith('/assets/guide')) {
    assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/, `Reader data indexing ${name}`);
    assert.equal(response.headers.get('content-type')?.split(';')[0].trim(), 'application/json', `Reader data MIME ${name}`);
  }
}
const report = { status: 'PASS', origin, sourceCommit: provenance.sourceCommit, readinessAttempts, verifiedFiles: entries.length + 1, verifiedBytes, canonicalRoutes: SOURCE.routes.resources.length, graphNodes: SOURCE.graph['@graph'].length, privateConfigurationFiles: [...privateConfig] };
await fs.mkdir('release', { recursive: true });
await fs.writeFile('release/live-verification.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
