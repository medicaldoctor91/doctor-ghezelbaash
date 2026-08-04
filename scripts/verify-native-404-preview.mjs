import assert from 'node:assert/strict';

const ORIGIN = process.env.LIVE_ORIGIN;
const ATTEMPTS = Number.parseInt(process.env.LIVE_VERIFY_ATTEMPTS ?? '20', 10);
const DELAY_MS = Number.parseInt(process.env.LIVE_VERIFY_DELAY_MS ?? '15000', 10);
const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=yes, use=reference';

assert.ok(ORIGIN, 'LIVE_ORIGIN is required');

const paths = [
  '/404',
  '/404/',
  '/404.html',
  '/__phase4-native-404-contract-missing__',
];

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function cacheBustedURL(pathname) {
  const url = new URL(pathname, ORIGIN);
  url.searchParams.set('__native_404_verify', `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  return url;
}

function header(response, name) {
  return response.headers.get(name) ?? '';
}

async function verifyPath(pathname) {
  const response = await fetch(cacheBustedURL(pathname), {
    redirect: 'manual',
    headers: {
      Accept: 'text/html,*/*;q=0.1',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent': 'doctor-ghezelbaash-native-404-contract/1.0',
    },
  });
  const body = await response.text();

  assert.equal(response.status, 404, `${pathname}: expected 404, received ${response.status}`);
  assert.match(header(response, 'content-type'), /^text\/html\b/i, `${pathname}: invalid Content-Type`);
  assert.equal(header(response, 'cache-control'), 'no-store', `${pathname}: invalid Cache-Control`);
  assert.equal(header(response, 'x-robots-tag'), 'noindex, follow', `${pathname}: invalid X-Robots-Tag`);
  assert.equal(header(response, 'content-location'), '/404.html', `${pathname}: invalid Content-Location`);
  assert.equal(header(response, 'content-signal'), CONTENT_SIGNAL, `${pathname}: invalid Content-Signal`);
  assert.match(body, /<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=["'][^"']*noindex/i, `${pathname}: noindex meta missing`);
  assert.match(body, />404</, `${pathname}: custom 404 body missing`);
}

let lastError;
for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  try {
    for (const pathname of paths) await verifyPath(pathname);
    console.log(`Native 404 contract verified against ${ORIGIN} on attempt ${attempt}/${ATTEMPTS}.`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.error(`Native 404 verification attempt ${attempt}/${ATTEMPTS} failed: ${error.message}`);
    if (attempt < ATTEMPTS) await sleep(DELAY_MS);
  }
}

throw lastError;
