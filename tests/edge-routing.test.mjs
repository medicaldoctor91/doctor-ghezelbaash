import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=yes, use=reference';

function headerSection(source, pathname) {
  const marker = `${pathname}\n`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing ${pathname} header section`);

  const remainder = source.slice(start + marker.length);
  const nextSection = remainder.search(/\n(?=\S)/);
  return nextSection === -1 ? remainder : remainder.slice(0, nextSection + 1);
}

function headerTokens(section, name) {
  const value = section.match(new RegExp(`^\\s*${name}:\\s*([^\\n]+)$`, 'mi'))?.[1] ?? '';
  return value.split(',').map((token) => token.trim().toLowerCase()).filter(Boolean);
}

test('the canonical root remains static and preserves its HTTP contract', async () => {
  await assert.rejects(access('functions/index.js'));

  const headers = await readFile('public/_headers', 'utf8');
  const root = headerSection(headers, '/');

  assert.match(root, /Content-Type: text\/html; charset=utf-8/);
  assert.match(root, /Cache-Control: public, max-age=300, stale-while-revalidate=60, stale-if-error=86400/);
  assert.match(root, /Content-Location: \/(?:\r?\n|$)/);
  assert.ok(root.includes(`Content-Signal: ${CONTENT_SIGNAL}`));
  assert.match(root, /X-Robots-Tag: all/);
  assert.deepEqual(headerTokens(root, 'Vary'), ['accept-encoding']);
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

test('the phase 4 experiment contains no Pages Functions or routing manifest', async () => {
  await assert.rejects(access('functions/404.js'));
  await assert.rejects(access('functions/404.html.js'));
  await assert.rejects(access('public/_routes.json'));
});

test('the generated 404 document remains explicitly noindex and uncacheable', async () => {
  const headers = await readFile('public/_headers', 'utf8');
  const notFound = headerSection(headers, '/404.html');

  assert.match(notFound, /Content-Type: text\/html; charset=utf-8/);
  assert.match(notFound, /X-Robots-Tag: noindex, follow/);
  assert.match(notFound, /Cache-Control: no-store/);
});
