import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlContract, protectedProjection, assertUnchanged, runtimeTextLiterals } from './lib/visible-text-contract.mjs';
const project = (html) => protectedProjection(htmlContract(html));
const original = '<title>Frozen title</title><meta name="description" content="Frozen description"><h2 id="h">Café doctor</h2><section id="section" aria-labelledby="h"><p id="p">Hello world.</p><img alt="Existing portrait"><a title="Call">Call</a><a href="#p">Jump</a></section>';
test('permits NFC and whitespace normalization without changing protected structure', () => {
  const candidate = original.replace('Café doctor', 'Cafe\u0301 doctor').replace('Hello world.', 'Hello   world.');
  assert.deepEqual(project(candidate), project(original));
});
test('permits splitting text nodes with an inline external link when reading text and structure stay unchanged', () => {
  const candidate = original.replace('Hello world.', 'Hel<a href="https://example.com/service">lo</a> world.');
  assert.deepEqual(project(candidate), project(original));
});
test('permits wrapping a partial phrase in an inline external link', () => {
  const candidate = original.replace('Hello world.', '<a href="https://example.com/service">Hello</a> world.');
  assert.deepEqual(project(candidate), project(original));
});
test('rejects ID renames even when accessible relationships are updated', () => {
  const candidate = original.replace('id="h"', 'id="heading"').replace('aria-labelledby="h"', 'aria-labelledby="heading"');
  assert.throws(() => assertUnchanged(project(original), project(candidate), 'ID identity'));
});
test('rejects moving an ID to a different owning element', () => {
  const candidate = original.replace('<p id="p">Hello world.</p>', '<p><span id="p">Hello world.</span></p>');
  assert.throws(() => assertUnchanged(project(original), project(candidate), 'ID owner'));
});
test('rejects retargeted or unresolved same-document fragments', () => {
  assert.throws(() => assertUnchanged(project(original), project(original.replace('href="#p"', 'href="#section"')), 'fragment target'));
  assert.throws(() => project(original.replace('href="#p"', 'href="#missing"')), /Unresolved same-document fragment/);
});
test('rejects duplicate DOM IDs', () => {
  assert.throws(() => project(original.replace('<img alt=', '<img id="p" alt=')), /Duplicate DOM id/);
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
test('keeps external href/src spellings outside the visible-text projection', () => {
  assert.deepEqual(project(original.replace('<a title="Call">', '<a href="/true-alias" title="Call">').replace('<img alt=', '<img src="/same-image-alias" alt=')), project(original));
});
