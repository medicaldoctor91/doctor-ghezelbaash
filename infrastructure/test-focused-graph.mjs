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

const refIds = value => [].concat(value ?? []).map(ref => ref?.['@id']).filter(Boolean);
const truthById = new Map(SOURCE.graph['@graph'].map(node => [node['@id'], node]));
for (const [route, document] of graphs) {
  if (route === '/') continue;
  const page = document['@graph'].find(node => node['@id'] === origin + route + '#webpage');
  if ([].concat(page['@type']).includes('MedicalWebPage'))
    assert(refIds(page.about).length, 'Every clinical page names its discussed subject: ' + route);
  const authoredPage = truthById.get(page['@id']);
  for (const id of refIds(authoredPage.about))
    if (!(SOURCE.routes.resources.find(resource => resource.path === route).pagePurpose === 'clinical-guide' && id === doctor))
      assert(refIds(page.about).includes(id), 'Focused topics retain the canonical authored page relationships: ' + route + ': ' + id);
  for (const id of refIds(authoredPage.mentions))
    assert(refIds(page.mentions).includes(id), 'Explicit discussed procedures survive projection: ' + route + ': ' + id);
  const physician = document['@graph'].find(node => node['@id'] === doctor), authoredPhysician = truthById.get(doctor);
  for (const key of ['skills', 'availableService', 'hasCredential', 'hasCertification'])
    for (const id of refIds(physician[key]))
      assert(refIds(authoredPhysician[key]).includes(id), 'Projection cannot invent physician expertise or services: ' + route + ': ' + key + ': ' + id);
}
// Source support and the machine Dataset are links, not new clinical topic seeds.
for (const route of ['/historical-patient-origin-summary', '/out-of-town-aesthetic-patients-iran']) {
  const ids = new Set(graphs.get(route)['@graph'].map(node => node['@id']));
  assert(ids.has(origin + '/historical-patient-origin-summary'), 'Historical work remains connected: ' + route);
  assert(ids.has(origin + '/patient-origin-city-ahvaz'), 'Historical spatial evidence remains connected: ' + route);
  for (const unrelated of ['procedure-cryolipolysis-localized-fat-reduction', 'article-omega-3-bipolar-i-2016',
    'article-mdd-attachment-dissociation-trauma-2021', 'role-former-mmt-physician', 'claim-lead-author-global-consensus-injectable-safety'])
    assert(!ids.has(origin + '/' + unrelated), 'Machine Dataset does not widen ' + route + ': ' + unrelated);
}
for (const [route, relevant, unrelated] of [
  ['/upper-face-botox', 'skill-botulinum-toxin-injection', ['skill-subcision', 'skill-thread-lifting', 'skill-dermal-filler-injection']],
  ['/thread-types-and-selection', 'skill-thread-lifting', ['skill-subcision', 'skill-botulinum-toxin-injection', 'skill-dermal-filler-injection']],
  ['/subcision-for-tethered-acne-scars', 'skill-subcision', ['skill-thread-lifting', 'skill-botulinum-toxin-injection']]
]) {
  const document = graphs.get(route), person = document['@graph'].find(node => node['@id'] === doctor);
  const skillIds = new Set(refIds(person.skills));
  assert(skillIds.has(origin + '/' + relevant), 'Directly supported clinical expertise remains: ' + route);
  for (const id of unrelated) assert(!skillIds.has(origin + '/' + id), 'Cited evidence cannot seed an unrelated physician skill: ' + route + ': ' + id);
}
for (const [route, topic] of [
  ['/botox-contraindications-and-precautions', 'procedure-botulinum-toxin-aesthetic-treatment'],
  ['/filler-treatment-exclusion-criteria', 'procedure-facial-and-lip-dermal-filler'],
  ['/thread-lift-complications-preparation-and-aftercare', 'procedure-thread-lift'],
  ['/submental-fat-and-neck-contour', 'procedure-submental-fat-evaluation'],
  ['/collagen-stimulation-sculptra-and-liquid-thread', 'procedure-sculptra-injectable-biostimulator'],
  ['/saeed-ghezelbash-diagnostic-philosophy', 'skill-clinical-facial-aesthetic-assessment']
]) {
  const page = graphs.get(route)['@graph'].find(node => node['@id'] === origin + route + '#webpage');
  assert(refIds(page.about).includes(origin + '/' + topic), 'Narrow clinical page identifies its actual discussed topic: ' + route);
}
const therapeutic = graphs.get('/therapeutic-botox-indications')['@graph'];
const therapeuticPage = therapeutic.find(node => node['@id'] === origin + '/therapeutic-botox-indications#webpage');
assert(refIds(therapeuticPage.about).includes(origin + '/topic-botox-neurology-context'), 'Therapeutic boundary describes neurologic context');
assert(!refIds(therapeuticPage.about).includes(origin + '/procedure-botulinum-toxin-aesthetic-treatment'), 'Therapeutic context is not classified as the aesthetic service');
assert(!therapeutic.some(node => node['@id'] === origin + '/procedure-botulinum-toxin-chronic-migraine'), 'Specialist referral context does not import a provider-bearing neurologic procedure');
assert(therapeutic.filter(node => ['topic-botox-neurology-context', 'topic-botox-migraine-context'].some(id => node['@id'] === origin + '/' + id))
  .every(node => ![].concat(node['@type']).includes('Service')), 'Neurologic discussion does not create a neurological service');
console.log(JSON.stringify({focusedGraphs: 'PASS', routes: metrics.length, sample: metrics.filter(item => ['/botox', '/filler', '/aesthetic-guide-en'].includes(item.path))}, null, 2));
