import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCroissant, buildDcatTurtle, buildKnowledgeXml, buildVCard} from '../src/lib/machine-output.mjs';

const origin = 'https://example.test';
const physicianId = origin + '/#saeed-ghezelbash';
const clinicId = origin + '/clinic';
const sourceFixture = () => ({
  canonicalOrigin: origin,
  edition: '2026-10-14',
  graph: {
    '@context': {'@vocab': 'https://schema.org/'},
    '@graph': [
      {'@id': physicianId, '@type': ['Person', 'IndividualPhysician'], name: 'Saeed Ghezelbash', givenName: 'Saeed', familyName: 'Ghezelbash', email: ['mailto:doctor@example.test', 'research@example.test'], url: origin + '/'},
      {'@id': clinicId, '@type': ['MedicalClinic', 'Organization'], name: 'Example Clinic', email: 'mailto:clinic@example.test', url: origin + '/clinic'},
      {'@id': origin + '/graph.jsonld/dataset', '@type': 'Dataset', name: 'Example dataset', description: 'Example RDF facts', creator: {'@id': physicianId}, publisher: {'@id': physicianId}, license: 'https://creativecommons.org/licenses/by/4.0/', url: origin + '/', version: '1.0.0'},
    ],
  },
  machineResources: [
    {path: '/entity-facts.csv', mediaType: 'text/csv', distributionIri: origin + '/entity-facts.csv/download'},
    {path: '/graph.jsonld', mediaType: 'application/ld+json', distributionIri: origin + '/graph.jsonld/download'},
  ],
});

const soloPracticeFixture = () => {
  const source = sourceFixture();
  const person = source.graph['@graph'][0];
  const clinic = source.graph['@graph'][1];
  clinic['@type'] = ['PhysiciansOffice', 'LocalBusiness'];
  person.owns = {'@id': clinicId};
  person.practicesAt = {'@id': clinicId};
  return source;
};

const unfoldVCard = card => card.replace(/\r\n[ \t]/g, '').split('\r\n').filter(Boolean);

test('Croissant contributor references carry the actual Person or Organization graph type', () => {
  const source = sourceFixture();
  source.graph['@graph'][2].publisher = {'@id': clinicId};
  const before = structuredClone(source);
  const output = buildCroissant(source);
  assert.deepEqual(output.creator, {'@id': physicianId, '@type': 'https://schema.org/Person'});
  assert.deepEqual(output.publisher, {'@id': clinicId, '@type': 'https://schema.org/Organization'});
  assert.deepEqual(source, before, 'serialization must not alter the canonical graph');
});

test('vCard preserves multiple email addresses as separate addr-spec values', () => {
  const lines = unfoldVCard(buildVCard(sourceFixture(), 'physician'));
  assert.deepEqual(lines.filter(line => line.startsWith('EMAIL:')), ['EMAIL:doctor@example.test', 'EMAIL:research@example.test']);
});

test('clinic vCard declares organization kind and normalizes its single email address', () => {
  const lines = unfoldVCard(buildVCard(sourceFixture(), 'clinic'));
  assert.ok(lines.includes('KIND:org'));
  assert.ok(lines.includes('EMAIL:clinic@example.test'));
  assert.ok(lines.includes('ORG:Example Clinic'));
});

test('solo-practice clinic vCard resolves PhysiciansOffice through the physician relationship', () => {
  const lines = unfoldVCard(buildVCard(soloPracticeFixture(), 'clinic'));
  assert.ok(lines.includes('KIND:org'));
  assert.ok(lines.includes('FN:Example Clinic'));
  assert.ok(lines.includes('ORG:Example Clinic'));
  assert.ok(lines.includes('UID:' + clinicId));
});

test('knowledge XML resolves the solo-practice PhysiciansOffice without MedicalClinic typing', () => {
  const xml = buildKnowledgeXml(soloPracticeFixture());
  assert.ok(xml.includes('<clinic id="' + clinicId + '"><name>Example Clinic</name></clinic>'));
  assert.ok(!xml.includes('<clinic id=""><name></name></clinic>'));
});

test('vCard folds long Unicode content at 75 UTF-8 octets without corrupting unfolded values', () => {
  const source = sourceFixture();
  const name = 'دکتر سعید قزلباش 🩺 '.repeat(12);
  source.graph['@graph'][0].name = name;
  const card = buildVCard(source, 'physician');
  assert.ok(card.endsWith('\r\n'));
  const physicalLines = card.split('\r\n').filter(Boolean);
  assert.ok(physicalLines.some(line => line.startsWith(' ')), 'long names require continuation lines');
  assert.ok(physicalLines.every(line => Buffer.byteLength(line, 'utf8') <= 75));
  assert.ok(unfoldVCard(card).includes('FN:' + name));
  assert.equal(Buffer.from(card, 'utf8').toString('utf8'), card);
});

test('DCAT distribution media types are IANA identifiers', () => {
  const ttl = buildDcatTurtle(sourceFixture());
  assert.match(ttl, /dcat:mediaType <https:\/\/www\.iana\.org\/assignments\/media-types\/text\/csv>/);
  assert.match(ttl, /dcat:mediaType <https:\/\/www\.iana\.org\/assignments\/media-types\/application\/ld\+json>/);
  assert.doesNotMatch(ttl, /dcat:mediaType "/);
});

test('DCAT emits exact caller-provided bytes and SHA-256 only for measured distributions', () => {
  const digest = '0123456789abcdef'.repeat(4);
  const stats = new Map([['/entity-facts.csv', {bytes: 12345, sha256: digest}]]);
  const ttl = buildDcatTurtle(sourceFixture(), stats);
  const measured = ttl.split('\n').find(line => line.startsWith('<' + origin + '/entity-facts.csv/download>'));
  const unmeasured = ttl.split('\n').find(line => line.startsWith('<' + origin + '/graph.jsonld/download>'));
  assert.match(measured, /dcat:byteSize "12345"\^\^<http:\/\/www\.w3\.org\/2001\/XMLSchema#decimal>/);
  assert.match(measured, /spdx:checksum \[ a spdx:Checksum ; spdx:algorithm spdx:checksumAlgorithm_sha256/);
  assert.ok(measured.includes('spdx:checksumValue "' + digest + '"^^<http://www.w3.org/2001/XMLSchema#hexBinary>'));
  assert.doesNotMatch(unmeasured, /dcat:byteSize|spdx:checksum/);
  assert.match(ttl, /@prefix spdx: <http:\/\/spdx\.org\/rdf\/terms#>/);
});
