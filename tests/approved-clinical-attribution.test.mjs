import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE } from '../src/canonical/source.mjs';

const PERSON = 'https://www.ghezelbaash.ir/#saeed-ghezelbash';
const CLINIC = 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const values = v => v == null ? [] : Array.isArray(v) ? v : [v];
const ids = v => values(v).map(x => typeof x === 'string' ? x : x?.['@id']).filter(Boolean);
const graph = SOURCE.graph['@graph'];
const node = id => graph.find(n => n['@id'] === id);
const services = graph.filter(n => values(n['@type']).some(t => t === 'Service' || t === 'https://schema.org/Service'));

test('approved plan: physician is the sole clinical Service provider', () => {
  assert.ok(services.length > 0);
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
    if (ids(service.availableChannel).includes(channel['@id'])) {
      assert.deepEqual(ids(service.provider), [PERSON], service['@id']);
    }
  }
});

test('approved plan: general clinical-services catalog is an ItemList with unique service references', () => {
  const catalog = graph.find(n => String(n['@id'] || '').includes('clinical-services-offer-catalog'));
  assert.ok(catalog);
  assert.ok(values(catalog['@type']).includes('ItemList'));
  assert.ok(!values(catalog['@type']).includes('OfferCatalog'));
  const items = values(catalog.itemListElement);
  const refs = items.map(item => ids(item.item)[0] || ids(item)[0]).filter(Boolean);
  assert.equal(refs.length, new Set(refs).size, 'duplicate service references');
});
