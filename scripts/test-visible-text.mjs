import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlContract, protectedProjection, assertUnchanged, runtimeTextLiterals } from './lib/visible-text-contract.mjs';

const project = (html) => protectedProjection(htmlContract(html));
const original = '<title>Frozen title</title><meta name="description" content="Frozen description"><h2 id="h">Café doctor</h2><section aria-labelledby="h"><p>Hello world.</p><img alt="Existing portrait"><a title="Call">Call</a></section>';
test('permits NFC, whitespace and ID/heading-level changes preserving text nodes', () => {
  const candidate = original.replace('<h2 id="h">Café doctor</h2>', '<h3 id="heading">Cafe\u0301 doctor</h3>').replace('aria-labelledby="h"', 'aria-labelledby="heading"').replace('Hello world.', 'Hello   world.');
  assert.deepEqual(project(candidate), project(original));
});
test('strict per-node contract rejects splitting or merging text nodes', () => {
  assert.throws(() => assertUnchanged(project(original), project(original.replace('Hello world.', 'Hel<span>lo</span> world.')), 'node boundaries'));
});
test('permits wrapping a complete text node without changing its sequence', () => {
  assert.deepEqual(project(original.replace('Hello world.', '<span>Hello world.</span>')), project(original));
});
for (const [label, mutate] of [
  ['prose', (html) => html.replace('Hello world.', 'New claim.')],
  ['title', (html) => html.replace('Frozen title', 'New title')],
  ['meta description', (html) => html.replace('Frozen description', 'New description')],
  ['alt', (html) => html.replace('Existing portrait', 'New portrait')],
  ['link title', (html) => html.replace('title="Call"', 'title="Different"')],
  ['hidden fallback text', (html) => html + '<noscript>New fallback</noscript>'],
  ['reading order', (html) => html.replace('Hello world.', 'world. Hello')],
  ['accessible relationship', (html) => html.replace('aria-labelledby="h"', 'aria-labelledby="missing"')],
]) test(`rejects changed ${label}`, () => assert.throws(() => assertUnchanged(project(original), project(mutate(original)), label)));
test('ignores machine JSON-LD and executable code but preserves runtime text literals separately', () => {
  assert.deepEqual(project(original + '<script type="application/ld+json">{"name":"machine"}</script>'), project(original));
  assert.deepEqual(runtimeTextLiterals('<script>status.textContent = count ? `${count} found.` : "No result"; target.focus();</script>'), ['', 'found.', 'No result']);
  assert.notDeepEqual(runtimeTextLiterals('<script>status.textContent="No result"</script>'), runtimeTextLiterals('<script>status.textContent="Changed"</script>'));
});
test('protects names, not renamed href/src/ARIA identifier spellings', () => {
  assert.deepEqual(project(original.replace('<a title="Call">', '<a href="/true-alias" title="Call">').replace('<img alt=', '<img src="/same-image-alias" alt=')), project(original));
});
