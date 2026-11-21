import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {connectClinicalContentToServices} from '../src/lib/clinical-content-backlinks.mjs';

const PERSON = 'https://www.ghezelbaash.ir/#saeed-ghezelbash';
const ORIGIN = 'https://www.ghezelbaash.ir/';
const many = value => value == null ? [] : Array.isArray(value) ? value : [value];
const idOf = value => typeof value === 'string' ? value : value?.['@id'];

test('all authored Article/VideoObject relations are reflected in Service.subjectOf', () => {
  const graph = SOURCE.graph['@graph'];
  const services = new Map(graph.filter(n => many(n['@type']).includes('Service'))
    .map(n => [n['@id'], n]));
  const relatedServices = new Set(), relatedWorks = new Set();
  let edges = 0;
  for (const work of graph) {
    const types = many(work['@type']);
    const article = types.includes('Article'), video = types.includes('VideoObject');
    if (!article && !video || typeof work.url !== 'string') continue;
    if (new URL(work.url).origin !== new URL(ORIGIN).origin) continue;
    const author = article ? work.author : work.creator;
    if (!many(author).some(x => idOf(x) === PERSON)) continue;
    for (const id of new Set(many(work.about).map(idOf).filter(id => services.has(id)))) {
      const service = services.get(id);
      assert.ok(many(service.subjectOf).some(x => idOf(x) === work['@id']),
        'Missing authored-work backlink ' + id + ' -> ' + work['@id']);
      edges++;
      relatedServices.add(id);
      relatedWorks.add(work['@id']);
    }
  }
  assert.equal(edges, 61, '61 direct authored Article/VideoObject relations must have truthful inverse subjectOf');
  assert.equal(relatedServices.size, 31);
  assert.equal(relatedWorks.size, 45);
  const cloned = structuredClone(graph);
  assert.equal(connectClinicalContentToServices(cloned, PERSON, ORIGIN).added, 0,
    'Backlinks should be idempotent');
});

test('Offer URLs, person identity and service inventory remain untouched', () => {
  const graph = SOURCE.graph['@graph'];
  const services = graph.filter(n => many(n['@type']).includes('Service'));
  const offers = graph.filter(n => many(n['@type']).includes('Offer'));
  const physician = graph.find(n => n['@id'] === PERSON);
  assert.equal(services.length, 124);
  assert.equal(offers.length, 124);
  assert.equal(offers.filter(n => n.url).length, 10);
  assert.equal(many(physician.makesOffer).length, 124);
  assert.equal(many(physician.skills).length, 85);
  assert.equal(many(physician.knowsAbout).length, 246);
});

test('no backlinks are synthesized for other authors, unrelated content or off-site URLs', () => {
  const s = 'https://www.ghezelbaash.ir/service-1';
  const sample = [
    {'@id': s, '@type': 'Service', provider: {'@id': PERSON}},
    {'@id': 'local', '@type': 'Article', url: ORIGIN+'guide',
      author: {'@id': PERSON}, about: [{'@id': s}]},
    {'@id': 'foreign', '@type': 'Article', url: 'https://unrelated.example/article',
      author: {'@id': PERSON}, about: [{'@id': s}]},
    {'@id': 'another-author', '@type': 'Article', url: ORIGIN+'someone',
      author: {'@id': ORIGIN+'another-person'}, about: [{'@id': s}]},
    {'@id': 'different-topic', '@type': 'VideoObject', url: ORIGIN+'video',
      creator: {'@id': PERSON}, about: [{'@id': ORIGIN+'not-this-service'}]}
  ];
  const result = connectClinicalContentToServices(sample, PERSON, ORIGIN);
  assert.deepEqual(result, {added:1, servicesLinked:1, authoredWorksLinked:1});
  assert.deepEqual(sample[0].subjectOf, [{'@id': 'local'}]);
  assert.equal(connectClinicalContentToServices(sample, PERSON, ORIGIN).added, 0);
});
