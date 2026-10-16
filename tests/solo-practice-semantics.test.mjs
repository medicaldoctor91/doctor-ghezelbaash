import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { SOURCE } from '../src/canonical/source.mjs';
import { buildShaclTurtle } from '../src/lib/shacl-output.mjs';

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

test('the canonical sole-provider claim has no exception for another service provider', () => {
  const claim = nodes.find((node) => node['@id'].endsWith('/claim-clinic-sole-treating-physician-and-clinical-provider'));
  const texts = Object.fromEntries(claim.text.map((entry) => [entry['@language'], entry['@value']]));
  assert.equal(texts.en, 'Dr. Saeed Ghezelbash is the sole treating physician and sole clinical service provider at Dr. Saeed Ghezelbash Aesthetic Clinic.');
  assert.equal(texts.fa, 'دکتر سعید قزلباش تنها پزشک معالج و تنها ارائه‌دهنده خدمات بالینی در کلینیک زیبایی دکتر سعید قزلباش است.');
  const services = nodes.filter((node) => values(node['@type']).includes('Service'));
  assert.ok(services.length > 0);
  for (const service of services) assert.deepEqual(refIds(service.provider), [PERSON], service['@id']);
});

test('published SHACL rejects clinic employment edges while allowing unrelated affiliations', () => {
  const result = spawnSync(process.env.PYTHON ?? 'python', ['-c', `
import json,sys,rdflib
from pyshacl import validate
value=json.load(sys.stdin)
graph=rdflib.Graph().parse(data=json.dumps(value['graph']),format='json-ld')
shapes=rdflib.Graph().parse(data=value['shapes'],format='turtle')
person=rdflib.URIRef('${PERSON}'); clinic=rdflib.URIRef('${CLINIC}')
schema=rdflib.Namespace('https://schema.org/')
selected=['https://www.ghezelbaash.ir/PhysicianEntityShape','https://www.ghezelbaash.ir/ClinicAssetShape']
def conforms():
    return validate(graph,shacl_graph=shapes,use_shapes=selected)[0]
assert conforms(),'Current graph must conform'
for triple in [(person,schema.worksFor,clinic),(person,schema.affiliation,clinic),(clinic,schema.employee,person)]:
    graph.add(triple)
    assert not conforms(),'Legacy relationship accepted: '+str(triple)
    graph.remove(triple)
for predicate in [schema.affiliation,schema.worksFor]:
    triple=(person,predicate,rdflib.URIRef('https://example.org/unrelated-organization'))
    graph.add(triple)
    assert conforms(),'Unrelated historical relationship was forbidden'
    graph.remove(triple)
graph.remove((person,schema.workLocation,clinic))
assert not conforms(),'Principal clinic work location must remain required'
print('solo-practice relationship mutations rejected')
`], { input: JSON.stringify({graph: SOURCE.graph, shapes: buildShaclTurtle(SOURCE)}), encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
