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

test('solo practice uses ownership and practice-location relations, not employment, affiliation, or independent-clinic typing', () => {
  assert.ok(person, 'canonical physician node must exist');
  assert.ok(clinic, 'canonical clinic/practice node must exist');

  assert.deepEqual(refIds(person.worksFor), [], 'physician must not be modeled as working for the dependent practice');
  assert.ok(!refIds(person.affiliation).includes(CLINIC), 'practice must not be modeled as a physician affiliation');
  assert.deepEqual(refIds(clinic.employee), [], 'physician must not be modeled as an employee of the practice');

  const clinicTypes = values(clinic['@type']);
  assert.ok(!clinicTypes.includes('MedicalClinic') && !clinicTypes.includes('https://schema.org/MedicalClinic'), 'dependent solo practice must not be typed as an independent MedicalClinic');
  assert.ok(clinicTypes.some((type) => String(type).endsWith('PhysiciansOffice')), 'solo practice must retain PhysiciansOffice typing');

  assert.ok(refIds(person.owns).includes(CLINIC), 'physician ownership relation must remain');
  assert.ok(refIds(person.practicesAt).includes(CLINIC), 'physician practice-location relation must remain');
  assert.ok(refIds(clinic.owner).includes(PERSON), 'practice owner relation must remain');
  assert.ok(refIds(clinic.founder).includes(PERSON), 'practice founder relation must remain');

  const providerEdges = nodes.flatMap((node) => refIds(node?.provider));
  assert.ok(providerEdges.includes(PERSON), 'person-centered service provider relations must remain');
});

test('SHACL validates the corrected solo-practice model', () => {
  const shacl = SOURCE.validation.shaclSupplement;
  assert.ok(!shacl.includes('sh:path rdf:type ; sh:hasValue schema:MedicalClinic'), 'SHACL must not require independent MedicalClinic typing');
  assert.ok(shacl.includes('sh:path schema:owns ; sh:hasValue ex:dr-saeed-ghezelbash-aesthetic-clinic-kermanshah'));
  assert.ok(shacl.includes('sh:path schema:practicesAt ; sh:hasValue ex:dr-saeed-ghezelbash-aesthetic-clinic-kermanshah'));
  assert.ok(shacl.includes('sh:path schema:owner ; sh:hasValue <https://www.ghezelbaash.ir/#saeed-ghezelbash>'));
  assert.ok(shacl.includes('sh:path schema:founder ; sh:hasValue <https://www.ghezelbaash.ir/#saeed-ghezelbash>'));
  assert.ok(shacl.includes('sh:path schema:provider ; sh:hasValue <https://www.ghezelbaash.ir/#saeed-ghezelbash>'));
});

test('visible canonical copy removes the clinic medical-director row while retaining ownership and physician facts', () => {
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


test('personally provided migraine therapy has a separate correctly scoped access Service', () => {
  const therapyId='https://www.ghezelbaash.ir/procedure-botulinum-toxin-chronic-migraine';
  const serviceId='https://www.ghezelbaash.ir/service-botulinum-toxin-chronic-migraine';
  const therapy=nodes.find(n=>n['@id']===therapyId), service=nodes.find(n=>n['@id']===serviceId);
  assert.equal(therapy['@type'],'MedicalTherapy');
  assert.equal(service['@type'],'Service');
  assert.deepEqual(refIds(therapy.provider),[]);
  assert.deepEqual(refIds(therapy.availableChannel),[]);
  assert.deepEqual(refIds(service.provider),[PERSON]);
  assert.ok(refIds(service['dcterms:subject']).includes(therapyId));
  assert.ok(refIds(service.availableChannel).includes('https://www.ghezelbaash.ir/in-person-clinic-service-channel'));
  assert.ok(refIds(person.availableService).includes(therapyId));
  assert.ok(refIds(clinic.availableService).includes(therapyId));
  assert.ok(refIds(nodes.find(n=>n['@id'].endsWith('/in-person-clinic-service-channel')).providesService).includes(serviceId));
});
