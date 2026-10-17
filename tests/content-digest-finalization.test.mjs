import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const sealRelease = await fs.readFile(new URL('../build/seal-release.mjs', import.meta.url), 'utf8');
const workflow = await fs.readFile(new URL('../.github/workflows/machine-readable-interop.yml', import.meta.url), 'utf8');

test('release sealing emits deployable Cloudflare Content-Digest headers instead of a permanent pending state', () => {
  assert.doesNotMatch(sealRelease, /pending-live-byte-identity-verification/);
  assert.doesNotMatch(sealRelease, /writeFile\(path\.join\(distDir,'_headers\.content-digest\.pending'\)/);
  assert.match(sealRelease, /path\.join\(distDir,'_headers'\)/);
  assert.match(sealRelease, /status:'configured-for-cloudflare-pages'/);
});

test('deployment verification checks the live Content-Digest response header', () => {
  assert.match(workflow, /Content-Digest/i);
  assert.match(workflow, /content-digest-eligibility\.json/);
});
