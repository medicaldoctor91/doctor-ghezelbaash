import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOURCE } from '../src/canonical/source.mjs';

const PERSON = 'https://www.ghezelbaash.ir/#saeed-ghezelbash';
const CLINIC = 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const refIds = (value) => values(value).map((entry) => typeof entry === 'string' ? entry : entry?.['@id']).filter(Boolean);
const nodes = SOURCE.graph['@graph'];
const person = nodes.find((node) => node?.['@id'] === PERSON);
const clinic = nodes.find((node) => node?.['@id'] === CLINIC);
const sourceText = readFileSync(new URL('../src/canonical/source.mjs', import.meta.url), 'utf8');

test('solo practice uses ownership and practice-location relations, not employment or affiliation', () => {
  assert.ok(person, 'canonical physician node must exist');
  assert.ok(clinic, 'canonical clinic node must exist');

  assert.deepEqual(refIds(person.worksFor), [], 'physician must not be modeled as working for the dependent clinic');
  assert.ok(!refIds(person.affiliation).includes(CLINIC), 'clinic must not be modeled as a physician affiliation');
  assert.deepEqual(refIds(clinic.employee), [], 'physician must not be modeled as an employee of the clinic');

  assert.ok(refIds(person.owns).includes(CLINIC), 'physician ownership relation must remain');
  assert.ok(refIds(person.practicesAt).includes(CLINIC), 'physician practice-location relation must remain');
  assert.ok(refIds(clinic.owner).includes(PERSON), 'clinic owner relation must remain');
  assert.ok(refIds(clinic.founder).includes(PERSON), 'clinic founder relation must remain');

  const providerEdges = nodes.flatMap((node) => refIds(node?.provider));
  assert.ok(providerEdges.includes(PERSON), 'person-centered service provider relations must remain');
});

test('SHACL validates the corrected solo-practice model', () => {
  const shacl = SOURCE.validation.shaclSupplement;
  assert.ok(!shacl.includes('sh:path schema:worksFor ; sh:hasValue ex:dr-saeed-ghezelbash-aesthetic-clinic-kermanshah'));
  assert.ok(!shacl.includes('sh:path schema:affiliation ; sh:hasValue ex:dr-saeed-ghezelbash-aesthetic-clinic-kermanshah'));
  assert.ok(!shacl.includes('sh:path schema:employee ; sh:hasValue <https://www.ghezelbaash.ir/#saeed-ghezelbash>'));
  assert.ok(shacl.includes('sh:path schema:owns ; sh:hasValue ex:dr-saeed-ghezelbash-aesthetic-clinic-kermanshah'));
  assert.ok(shacl.includes('sh:path schema:practicesAt ; sh:hasValue ex:dr-saeed-ghezelbash-aesthetic-clinic-kermanshah'));
  assert.ok(shacl.includes('sh:path schema:owner ; sh:hasValue <https://www.ghezelbaash.ir/#saeed-ghezelbash>'));
  assert.ok(shacl.includes('sh:path schema:founder ; sh:hasValue <https://www.ghezelbaash.ir/#saeed-ghezelbash>'));
  assert.ok(shacl.includes('sh:path schema:provider ; sh:hasValue <https://www.ghezelbaash.ir/#saeed-ghezelbash>'));
});

test('visible canonical copy removes only the clinic medical-director row', () => {
  assert.ok(!sourceText.includes('Medical Director / مدیر پزشکی'));
  for (const retained of [
    'Founder / بنیان‌گذار',
    'Owner / مالک',
    'Operator / گرداننده',
    'Physician / پزشک',
    'مجوز و اعتبار تصاویر کلینیک',
  ]) assert.ok(sourceText.includes(retained), `expected retained visible copy: ${retained}`);
});
