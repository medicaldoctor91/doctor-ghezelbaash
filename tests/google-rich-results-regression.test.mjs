import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { closeSearchReferences } from '../src/lib/search-contract.mjs';
import { serializeInlineJsonLd } from '../src/lib/jsonld.mjs';

// Guard the existing 1600-node homepage and the breadcrumbs in final HTML.
// Run again after "npm run build" to enable the dist-backed checks.
// This does NOT certify Google Rich Results eligibility.
const ORIGIN = 'https://www.ghezelbaash.ir';
const PERSON = ORIGIN + '/#saeed-ghezelbash';
const ROUTES = ['/', '/botox', '/acne-pigmentation-and-scars',
  '/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah', '/aesthetic-guide-en'];
const arr = v => Array.isArray(v) ? v : v == null ? [] : [v];
const typed = (n, t) => arr(n?.['@type']).includes(t);
const outputPath = route => resolve('dist', route === '/' ? 'index.html' : route.slice(1) + '.html');
const field = (tag, key) => {
  const match = tag.match(new RegExp('(?:^|\\s)' + key + '\\s*=\\s*(["\\x27])(.*?)\\1', 'i'));
  return match?.[2];
};
const tags = (html, tagName) => [...html.matchAll(new RegExp('<' + tagName + '\\b[^>]*>', 'gi'))].map(x => x[0]);
const docScripts = html => [...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script\\s*>/gi)]
  .filter(m => field(m[1], 'type') === 'application/ld+json')
  .map(m => JSON.parse(m[2]));
function checkBreadcrumb(doc, url) {
  const graph = doc['@graph'], byId = new Map(graph.map(n => [n['@id'], n]));
  assert.equal(byId.size, graph.length, 'duplicate @id');
  const page = byId.get(url + '#webpage');
  assert.ok(page, 'primary page not found');
  const breadcrumb = byId.get(page.breadcrumb?.['@id']);
  assert.ok(typed(breadcrumb, 'BreadcrumbList'), 'BreadcrumbList missing after closure');
  assert.equal(breadcrumb['@id'], url + '#breadcrumb');
  const items = breadcrumb.itemListElement;
  assert.ok(items?.length >= 2, 'Google requires at least two ListItems');
  items.forEach((item, i) => {
    assert.equal(item['@type'], 'ListItem');
    assert.equal(item.position, i + 1);
    assert.ok(typeof item.name === 'string' && item.name.trim(), 'empty name');
    assert.ok(typeof item.item === 'string' && URL.canParse(item.item), 'invalid item URL');
    assert.ok(item.item.startsWith(ORIGIN + '/'), 'foreign breadcrumb URL');
  });
  assert.equal(items[0].item, ORIGIN + '/');
  assert.equal(items.at(-1).item, url);
  const profile = byId.get(ORIGIN + '/webpage');
  assert.ok(typed(profile, 'ProfilePage'), 'supporting ProfilePage missing');
  assert.equal(profile.mainEntity?.['@id'], PERSON);
  assert.ok(byId.has(PERSON), 'physician reference lost');
}
test('reference closure retains BreadcrumbList and physician mainEntity without mutating canonical graph', () => {
  const url = ORIGIN + '/botox';
  const page = { '@id': url + '#webpage', '@type': 'MedicalWebPage', name: 'Guide',
    mainEntity: { '@id': url }, breadcrumb: { '@id': url + '#breadcrumb' },
    isPartOf: { '@id': ORIGIN + '/webpage' }, author: { '@id': PERSON } };
  const crumb = { '@id': url + '#breadcrumb', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Physician', item: ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: 'Botox', item: url }] };
  const profile = { '@id': ORIGIN + '/webpage', '@type': ['ProfilePage', 'MedicalWebPage'],
    name: 'Physician', mainEntity: { '@id': PERSON }, url: ORIGIN + '/' };
  const person = { '@id': PERSON, '@type': 'Person', name: 'Saeed Ghezelbash' };
  const procedure = { '@id': url, '@type': 'MedicalProcedure', name: 'Botox' };
  const graph = { '@context': 'https://schema.org', '@graph': [page, crumb, profile, person, procedure] };
  const previous = structuredClone(graph);
  const lookup = new Map(graph['@graph'].map(n => [n['@id'], n]));
  const doc = { '@context': 'https://schema.org', '@graph': [structuredClone(page), structuredClone(crumb)] };
  closeSearchReferences(doc, { origin: ORIGIN, graph, primaryPageId: page['@id'],
    project: id => lookup.get(id) ? structuredClone(lookup.get(id)) : undefined });
  checkBreadcrumb(JSON.parse(serializeInlineJsonLd(doc)), url);
  assert.deepEqual(graph, previous);
});
for (const route of ROUTES) {
  const path = outputPath(route);
  test('built Google-facing JSON-LD: ' + route, {
    skip: !existsSync(path) ? 'Run npm run build before final HTML checks' : false,
  }, () => {
    const html = readFileSync(path, 'utf8'), url = ORIGIN + route;
    const canonical = tags(html, 'link').find(t => field(t, 'rel') === 'canonical');
    assert.equal(field(canonical || '', 'href'), url, 'canonical mismatch');
    const robots = tags(html, 'meta').find(t => field(t, 'name')?.toLowerCase() === 'robots');
    assert.match(field(robots || '', 'content') || '', /\\bindex\\s*,\\s*follow\\b/i);
    const docs = docScripts(html);
    assert.equal(docs.length, 1, 'exactly one server-delivered JSON-LD script');
    assert.ok(Array.isArray(docs[0]['@graph']));
    if (route === '/') {
      assert.equal(docs[0]['@graph'].length, 1600, 'full homepage graph MUST be preserved');
      const profile = docs[0]['@graph'].find(n => n['@id'] === ORIGIN + '/webpage');
      assert.ok(typed(profile, 'ProfilePage'));
      assert.equal(profile.mainEntity?.['@id'], PERSON);
    } else checkBreadcrumb(docs[0], url);
  });
}
