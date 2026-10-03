import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { externalizeNotFoundCss, assertNotFoundStylesheet, notFoundStylesheetPath } from "../lib/not-found-css.mjs";

const first = '@layer base{body{margin:0}main{width:72rem}a{color:#064d40}}';
const second = '.not-found-page[data-astro-cid-example]{display:grid;gap:1rem}';
const head = '<meta name="robots" content="noindex, follow"><script id="deferred-stylesheet-loader">activate()</script>';
const body = '<body lang="fa-IR" dir="rtl"><main><h1>این صفحه پیدا نشد</h1><a href="/botox">بوتاکس</a></main></body>';
const original = '<!doctype html><html><head><style>' + first + '</style>' + head + '<style>' + second + '</style></head>' + body + '</html>';

test("404 style extraction preserves exact ordered CSS, executable script and authored document content", () => {
  const result = externalizeNotFoundCss(original);
  assert.equal(result.css, first + "\n" + second);
  assert(result.html.includes(head));
  assert(result.html.endsWith(body + '</html>'));
  assert(!result.html.includes('<style>'));
  assert.equal(assertNotFoundStylesheet(result.html, Buffer.from(result.css)), result.assetPath);
  assert.equal(result.measurement.inlineStyles, 2);
  assert.deepEqual(result.measurement.inlineStyleSha256, [first, second].map((value) => createHash('sha256').update(value).digest('hex')));
});

test("404 retains same-origin style delivery when an upstream policy has obsolete inline hashes", () => {
  const result = externalizeNotFoundCss(original);
  const policy = "default-src 'none'; style-src 'self' 'sha256-obsolete-inline-hash'";
  const href = new URL('/' + notFoundStylesheetPath(result.html), 'https://www.ghezelbaash.ir/unknown');
  assert(policy.includes("style-src 'self'"));
  assert.equal(href.origin, 'https://www.ghezelbaash.ir');
  assert(!result.html.includes('<style'));
  assert(!policy.includes('unsafe-inline'));
});

test("404 style extraction rejects delivery changes that would alter CSS meaning", () => {
  for (const changed of [
    original.replace('<style>', '<style media="print">'),
    original.replace(first, '@import "/other.css";' + first),
    original.replace(first, 'body{background:url(../images/background.png)}'),
  ]) assert.throws(() => externalizeNotFoundCss(changed), /404 CSS extraction/);
});

test("404 stylesheet validation rejects missing, inline, duplicate and corrupted delivery", () => {
  const result = externalizeNotFoundCss(original);
  assert.throws(() => notFoundStylesheetPath(original), /inline style hashes/);
  assert.throws(() => notFoundStylesheetPath(result.html.replace('data-not-found-stylesheet', 'data-other-stylesheet')), /requires one/);
  assert.throws(() => notFoundStylesheetPath(result.html.replace('</head>', '<link rel="stylesheet" href="/' + result.assetPath + '" data-not-found-stylesheet></head>')), /requires one/);
  assert.throws(() => assertNotFoundStylesheet(result.html, result.css + "\n"), /fingerprint/);
});
