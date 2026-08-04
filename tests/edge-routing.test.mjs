import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest as onHomeRequest } from '../functions/index.js';
import { onRequest as on404Request } from '../functions/404.js';
import { onRequest as on404HtmlRequest } from '../functions/404.html.js';

const HTML = '<!doctype html><html lang="fa-IR"><body>canonical HTML</body></html>';
const MARKDOWN = '# canonical Markdown\n';
const NOT_FOUND = '<!doctype html><html lang="fa-IR"><body>404</body></html>';

function createAssetBinding() {
  return {
    async fetch(input) {
      const request = input instanceof Request ? input : new Request(input);
      const pathname = new URL(request.url).pathname;

      if (pathname === '/index.md') {
        return new Response(request.method === 'HEAD' ? null : MARKDOWN, {
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
            Link: '<https://www.ghezelbaash.ir/>; rel="canonical"',
          },
        });
      }

      if (pathname === '/404.html') {
        return new Response(request.method === 'HEAD' ? null : NOT_FOUND, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Frame-Options': 'DENY',
          },
        });
      }

      return new Response(request.method === 'HEAD' ? null : HTML, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=0, must-revalidate',
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

async function assertNotFoundResponse(response) {
  assert.equal(response.status, 404);
  assert.equal(response.statusText, 'Not Found');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, follow');
  assert.equal(response.headers.get('Content-Location'), '/404.html');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(await response.text(), NOT_FOUND);
}

test('ordinary browser navigation remains HTML and receives bounded caching', async () => {
  const response = await onHomeRequest(
    contextFor('https://www.ghezelbaash.ir/', {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type') ?? '', /^text\/html\b/);
  assert.equal(await response.text(), HTML);
  assert.match(response.headers.get('Cache-Control') ?? '', /max-age=300/);
  assert.match(response.headers.get('Vary') ?? '', /\bAccept\b/i);
  assert.equal(
    response.headers.get('Content-Signal'),
    'search=yes, ai-input=yes, ai-train=yes, use=reference',
  );
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
});

test('explicit Markdown preference returns the canonical Markdown projection', async () => {
  const response = await onHomeRequest(
    contextFor('https://www.ghezelbaash.ir/?utm_source=agent', {
      headers: { Accept: 'text/markdown, text/html;q=0.8' },
    }),
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type') ?? '', /^text\/markdown\b/);
  assert.equal(response.headers.get('Content-Location'), '/index.md');
  assert.equal(response.headers.get('Content-Language'), 'fa-IR');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, follow');
  assert.equal(await response.text(), MARKDOWN);
});

test('q-values prevent Markdown from overriding a stronger HTML preference', async () => {
  const response = await onHomeRequest(
    contextFor('https://www.ghezelbaash.ir/', {
      headers: { Accept: 'text/html, text/markdown;q=0.5' },
    }),
  );

  assert.match(response.headers.get('Content-Type') ?? '', /^text\/html\b/);
  assert.equal(await response.text(), HTML);
});

test('wildcard-only clients keep the HTML representation', async () => {
  const response = await onHomeRequest(
    contextFor('https://www.ghezelbaash.ir/', {
      headers: { Accept: '*/*' },
    }),
  );

  assert.match(response.headers.get('Content-Type') ?? '', /^text\/html\b/);
});

test('HEAD negotiation mirrors headers without emitting a body', async () => {
  const response = await onHomeRequest(
    contextFor('https://www.ghezelbaash.ir/', {
      method: 'HEAD',
      headers: { Accept: 'text/markdown' },
    }),
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type') ?? '', /^text\/markdown\b/);
  assert.equal(await response.text(), '');
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

test('unsupported methods on /404 fail closed', async () => {
  const response = await on404Request(
    contextFor('https://www.ghezelbaash.ir/404', { method: 'POST' }),
  );

  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'GET, HEAD');
});
