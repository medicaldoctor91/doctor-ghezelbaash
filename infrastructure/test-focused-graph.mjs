import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {SOURCE} from '../src/canonical/source.mjs';
import {unresolvedReferences} from './lib/delivery-contract.mjs';

const root = new URL('../', import.meta.url);
let render;
if (process.argv[2]) render = route => fs.readFile(path.join(path.resolve(process.argv[2]), route === '/' ? 'index.html' : route.slice(1) + '.html'), 'utf8');
else {
  const raw = await fs.readFile(new URL('src/pages/index.astro', root), 'utf8');
  let code = raw.slice(4, raw.lastIndexOf('\n---\n'));
  code = code.slice(0, code.lastIndexOf('\nconst requestedPath ='))
    .replace(/from "\.\.\/lib\/([^\"]+)"/g, (_, name) => `from "${new URL('src/lib/' + name, root).href}"`)
    .replaceAll('../canonical/source.mjs', new URL('src/canonical/source.mjs', root).href);
  await fs.mkdir(new URL('.generated/', root), {recursive: true});
  const file = new URL('.generated/focused-graph-source.mjs', root);
  await fs.writeFile(file, code);
  const {CANONICAL} = await import(file.href);
  render = route => CANONICAL.render(route);
}
const origin = SOURCE.canonicalOrigin, doctor = origin + '/#saeed-ghezelbash';
const graphs = new Map(), clinics = new Set(), metrics = [];
for (const route of SOURCE.routes.resources) {
  const html = await render(route.path);
  const document = JSON.parse(html.match(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)[1]);
  graphs.set(route.path, document);
  if (route.path === '/') {assert.deepEqual(document, SOURCE.graph, 'Home keeps the complete canonical authority graph'); continue;}
  const byId = new Map(document['@graph'].map(node => [node['@id'], node]));
  assert.equal(document['@context'], 'https://schema.org');
  assert.deepEqual(unresolvedReferences(document, origin), [], 'Every focused reference resolves: ' + route.path);
  assert(byId.has(doctor), 'Physician identity is materialized: ' + route.path);
  const clinic = byId.get(origin + '/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah');
  clinics.add(JSON.stringify(clinic));
  assert(!clinic.availableService && !clinic.hasOfferCatalog, 'Clinic inventories do not widen the clinical topic');
  assert(byId.has(origin + '/irimc-credential-167430'), 'Professional registration remains attached');
  assert(byId.has(origin + '/credential-doctor-of-medicine'), 'Medical qualification remains attached');
  metrics.push({path: route.path, bytes: Buffer.byteLength(html), nodes: byId.size});
}
assert.equal(clinics.size, 1, 'All focused routes retain identical Clinic identity');
for (const [route, relevant] of [['/botox', 'procedure-botulinum-toxin-aesthetic-treatment'], ['/filler', 'procedure-facial-and-lip-dermal-filler']]) {
  const ids = new Set(graphs.get(route)['@graph'].map(node => node['@id']));
  assert(ids.has(origin + '/' + relevant), 'The clinical service remains connected: ' + route);
  for (const unrelated of ['procedure-hair-loss-evaluation-and-treatment', 'procedure-rhinoplasty', 'procedure-thread-pcl', ...(route === '/botox' ? ['procedure-body-dermal-filler'] : [])])
    assert(!ids.has(origin + '/' + unrelated), 'Unrelated procedure is absent from ' + route + ': ' + unrelated);
}
for (const route of ['/aesthetic-guide-en', '/aesthetic-guide-ar-iq', '/aesthetic-guide-ckb-iq']) {
  const document = graphs.get(route);
  assert(document['@graph'].some(node => node['@id'] === doctor));
  assert(document['@graph'].some(node => node['@id'] === origin + '/procedure-facial-and-lip-dermal-filler'));
}
console.log(JSON.stringify({focusedGraphs: 'PASS', routes: metrics.length, sample: metrics.filter(item => ['/botox', '/filler', '/aesthetic-guide-en'].includes(item.path))}, null, 2));
