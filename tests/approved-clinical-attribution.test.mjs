import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE } from '../src/canonical/source.mjs';
import { buildRetrievalRecords, serializeAnswersText } from '../src/lib/retrieval-output.mjs';

const PERSON = 'https://www.ghezelbaash.ir/#saeed-ghezelbash';
const CLINIC = 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const values = v => v == null ? [] : Array.isArray(v) ? v : [v];
const ids = v => values(v).map(x => typeof x === 'string' ? x : x?.['@id']).filter(Boolean);
const graph = SOURCE.graph['@graph'];
const node = id => graph.find(n => n['@id'] === id);
const services = graph.filter(n => values(n['@type']).some(t => t === 'Service' || t === 'https://schema.org/Service'));

test('approved plan: physician is the sole clinical Service provider', () => {
  assert.equal(services.length, 124);
  for (const service of services) assert.deepEqual(ids(service.provider), [PERSON], service['@id']);
  assert.ok(ids(node(PERSON).practicesAt).includes(CLINIC));
});

test('approved plan: clinic has no specialty, service offering or offer catalog properties', () => {
  const clinic = node(CLINIC);
  assert.ok(clinic);
  for (const property of ['medicalSpecialty', 'availableService', 'hasOfferCatalog']) {
    assert.equal(values(clinic[property]).length, 0, 'forbidden clinic property: ' + property);
  }
});

test('approved plan: neither physician nor clinic points to a general OfferCatalog', () => {
  assert.equal(values(node(PERSON).hasOfferCatalog).length, 0);
  assert.equal(values(node(CLINIC).hasOfferCatalog).length, 0);
});

test('approved plan: in-person service channel locates the practice', () => {
  const channel = node('https://www.ghezelbaash.ir/in-person-clinic-service-channel');
  assert.ok(channel);
  assert.deepEqual(ids(channel.serviceLocation), [CLINIC]);
  for (const service of services) {
    const online = service['@id'].endsWith('/free-online-aesthetic-initial-consultation');
    const expected = online ? 'https://www.ghezelbaash.ir/online-consultation-channel' : channel['@id'];
    assert.deepEqual(ids(service.availableChannel), [expected], service['@id']);
    assert.deepEqual(ids(node(expected).serviceLocation), online ? [] : [CLINIC], service['@id']);
  }
});

test('approved plan: general clinical-services catalog is an ItemList with unique service references', () => {
  const catalog = graph.find(n => String(n['@id'] || '').includes('clinical-services-offer-catalog'));
  assert.ok(catalog);
  assert.ok(values(catalog['@type']).includes('ItemList'));
  assert.ok(!values(catalog['@type']).includes('OfferCatalog'));
  assert.deepEqual(ids(catalog['dcterms:subject']), [PERSON]);
  const items = values(catalog.itemListElement);
  const refs = items.map(item => ids(item.item)[0] || ids(item)[0]).filter(Boolean);
  assert.equal(refs.length, new Set(refs).size, 'duplicate service references');
  assert.equal(catalog.numberOfItems, services.length);
  assert.deepEqual(new Set(refs), new Set(services.map(service => service['@id'])));
  assert.deepEqual(items.map(item => item.position), items.map((_, index) => index + 1));
});

test('clinical performance and patient access use the matching physician and location roles', () => {
  const origin = SOURCE.canonicalOrigin;
  const performance = node(origin + '/clinical-performance-dataset');
  assert.deepEqual(ids(performance.about), [PERSON]);
  assert.deepEqual(ids(performance.spatialCoverage), [CLINIC]);
  assert.equal(ids(performance['prov:hadMember']).length, 16);
  for (const id of ids(performance['prov:hadMember'])) assert.deepEqual(ids(node(id).observationAbout), [PERSON]);
  assert.ok(!ids(node(CLINIC).subjectOf).includes(origin + '/webpage'));
  const channel = node(origin + '/online-consultation-channel');
  assert.equal(channel.serviceUrl, 'https://ig.me/m/doctor.ghezelbaash');
  assert.equal(channel.servicePhone, undefined);
  assert.match(node(ids(node(CLINIC).contactPoint)[0]).contactType, /appointment scheduling/);
  assert.equal(node(origin + '/review-kurdish-patient-experience').reviewRating, undefined);
});

test('clinical answer introductions expose the physician and preserve the authored answer', () => {
  const records = buildRetrievalRecords(SOURCE).filter(record => record.answerLead);
  assert.equal(records.length, 8);
  assert.deepEqual(new Set(records.map(record => record.language.split('-')[0])), new Set(['fa', 'en', 'ar', 'ckb']));
  for (const record of records) assert.equal(record.clinicalProviderId, PERSON);
  const english = records.find(record => record.questionId.endsWith('available-en'));
  assert.match(english.answerLead, /^Dr\. Saeed Ghezelbash/);
  assert.match(english.answer, /^Botox, dermal fillers/);
  assert.ok(serializeAnswersText([english]).includes(
    `Answer introduction: ${JSON.stringify(english.answerLead)}\nAnswer: ${JSON.stringify(english.answer)}`));
});
