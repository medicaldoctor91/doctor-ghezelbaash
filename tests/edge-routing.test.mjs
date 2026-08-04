import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import { onRequest as on404Request } from '../functions/404.js';
import { onRequest as on404HtmlRequest } from '../functions/404.html.js';

const NOT_FOUND = '<!doctype html><html lang="fa-IR"><body>404</body></html>';
const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=yes, use=reference';

function createAssetBinding() {
  return {
    async fetch(input) {
      const request = input instanceof Request ? input : new Request(input);
      return new Response(request.method === 'HEAD' ? null : NOT_FOUND, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Frame-Options': 'DENY',
        },
      });
    },
  };
}

function contextFor(url, init = {}) {
  return {
    request: new Request(url, init),
    env: { ASSETS: createAssetBinding() },
  };
}

function headerSection(source, pathname) {
  const escaped = pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`^${escaped}\\n([\\s\\S]*?)(?=^\\S|\\Z)`, 'm'));
  assert.ok(match, `missing ${pathname} header section`);
  return match[1];
}

async function assertNotFoundResponse(response, { expectBody = true } = {}) {
  assert.equal(response.status, 404);
  assert.equal(response.statusText, 'Not Found');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, follow');
  assert.equal(response.headers.get('Content-Location'), '/404.html');
  assert.equal(response.headers.get('Content-Signal'), CONTENT_SIGNAL);
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(await response.text(), expectBody ? NOT_FOUND : '');
}

test('the canonical root is static and no longer invokes a negotiation Function', async () => {
  await assert.rejects(access('functions/index.js'));

  const [headers, routes] = await Promise.all([
    readFile('public/_headers', 'utf8'),
    JSON.parse(await readFile('public/_routes.json', 'utf8')),
  ]);
  const root = headerSection(headers, '/');

  assert.match(root, /Content-Type: text\/html; charset=utf-8/);
  assert.match(root, /Cache-Control: public, max-age=300, stale-while-revalidate=60, stale-if-error=86400/);
  assert.match(root, /Content-Location: \/(?:\r?\n|$)/);
  assert.ok(root.includes(`Content-Signal: ${CONTENT_SIGNAL}`));
  assert.match(root, /X-Robots-Tag: all/);
  assert.match(root, /Vary: Accept-Encoding(?:\r?\n|$)/);
  assert.equal(/Vary:[^\n]*\bAccept\b/.test(root), false);
  assert.equal(routes.include.includes('/'), false);
});

test('Markdown and full-text representations remain explicit static URLs', async () => {
  const headers = await readFile('public/_headers', 'utf8');
  const markdown = headerSection(headers, '/index.md');
  const fullText = headerSection(headers, '/llms-full.txt');

  assert.match(markdown, /Content-Type: text\/markdown; charset=utf-8/);
  assert.match(markdown, /Link: <https:\/\/www\.ghezelbaash\.ir\/>; rel="canonical"/);
  assert.match(fullText, /Content-Type: text\/plain; charset=utf-8/);
  assert.match(fullText, /Link: <https:\/\/www\.ghezelbaash\.ir\/>; rel="canonical"/);
});

test('only explicit 404 aliases invoke Pages Functions', async () => {
  const routes = JSON.parse(await readFile('public/_routes.json', 'utf8'));
  assert.deepEqual(routes.include, ['/404', '/404/', '/404.html']);
  assert.deepEqual(routes.exclude, []);
});

test('the public /404 route always emits a real 404 response', async () => {
  await assertNotFoundResponse(
    await on404Request(contextFor('https://www.ghezelbaash.ir/404')),
  );
});

test('the generated /404.html alias also emits a real 404 response', async () => {
  await assertNotFoundResponse(
    await on404HtmlRequest(contextFor('https://www.ghezelbaash.ir/404.html')),
  );
});

test('HEAD on a 404 alias preserves the contract without a body', async () => {
  await assertNotFoundResponse(
    await on404Request(contextFor('https://www.ghezelbaash.ir/404', { method: 'HEAD' })),
    { expectBody: false },
  );
});

test('unsupported methods on /404 fail closed', async () => {
  const response = await on404Request(
    contextFor('https://www.ghezelbaash.ir/404', { method: 'POST' }),
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET, HEAD');
});
