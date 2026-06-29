import { absoluteUrl } from '../src/data/site.mjs';
import { buildCredentialedGlobalGraph } from '../src/lib/credentialedGlobalGraph.mjs';

let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function refs(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function refIds(value) {
  return refs(value).map((item) => item?.['@id']).filter(Boolean);
}

function typeList(node) {
  return refs(node?.['@type']);
}

function hasRef(entity, property, id) {
  return refIds(entity?.[property]).includes(id);
}

function hasIdentifier(entity, propertyID, value) {
  return refs(entity?.identifier).some((item) => item?.['@type'] === 'PropertyValue' && item.propertyID === propertyID && item.value === value);
}

const graph = buildCredentialedGlobalGraph();
const text = JSON.stringify(graph);
const nodes = graph?.['@graph'] || [];
const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));

const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
const physician = byId.get(absoluteUrl('/#physician'));
const dataset = byId.get(absoluteUrl('/kg/#dataset'));
const mcc = byId.get(absoluteUrl('/kg/organization#medical-council-of-canada'));
const kums = byId.get(absoluteUrl('/kg/organization#kermanshah-university-medical-sciences-school-of-medicine'));
const medicalDegree = byId.get(absoluteUrl('/kg/credential#medical-degree'));
const mccEquivalency = byId.get(absoluteUrl('/kg/credential#mcc-doctor-of-medicine-equivalency'));

for (const needle of [
  'E0217736',
  'E94583066IMM',
  '1962-87530',
  'MyIntealth',
  'EICS',
  'ECA ID',
  'Educational Credential Assessment ID',
  'MCC candidate code',
  'LMCC',
  'licensed in Canada',
  'practice medicine in Canada',
  'immigration validity'
]) {
  if (text.includes(needle)) fail(`workflow/application or non-authority MCC marker leaked into public graph: ${needle}`);
}

for (const node of nodes) {
  if (Object.prototype.hasOwnProperty.call(node, 'expires')) fail(`credential authority graph must not emit expires on ${node['@id'] || '(anonymous node)'}`);
}

if (!person) fail('missing person node');
if (!physician) fail('missing physician node');
if (!dataset) fail('missing dataset node');

if (!mcc) {
  fail('missing Medical Council of Canada organization node');
} else {
  if (!typeList(mcc).includes('Organization')) fail('MCC node must be Organization');
  if (mcc.name !== 'Medical Council of Canada') fail('MCC node has unexpected name');
  if (mcc.url !== 'https://mcc.ca/') fail('MCC node missing official url');
}

if (!kums) {
  fail('missing Kermanshah medical school node');
} else {
  if (!typeList(kums).includes('CollegeOrUniversity')) fail('KUMS node missing CollegeOrUniversity type');
  if (!typeList(kums).includes('EducationalOrganization')) fail('KUMS node missing EducationalOrganization type');
}

if (!medicalDegree) {
  fail('missing medical degree credential node');
} else {
  if (!typeList(medicalDegree).includes('EducationalOccupationalCredential')) fail('medical degree node missing EducationalOccupationalCredential type');
  if (!typeList(medicalDegree).includes('CreativeWork')) fail('medical degree node missing CreativeWork type for about retention');
  if (medicalDegree.credentialCategory !== 'Medical degree') fail('medical degree node has unexpected credentialCategory');
  if (medicalDegree.educationalLevel !== 'Doctor of Medicine') fail('medical degree node has unexpected educationalLevel');
}

if (!mccEquivalency) {
  fail('missing MCC Doctor of Medicine equivalency credential node');
} else {
  if (!typeList(mccEquivalency).includes('EducationalOccupationalCredential')) fail('MCC equivalency node missing EducationalOccupationalCredential type');
  if (!typeList(mccEquivalency).includes('CreativeWork')) fail('MCC equivalency node missing CreativeWork type for about retention');
  if (!String(mccEquivalency.name || '').includes('Doctor of Medicine equivalency')) fail('MCC equivalency node name must center Doctor of Medicine equivalency');
  if (mccEquivalency.credentialCategory !== 'Medical degree equivalency') fail('MCC equivalency node has unexpected credentialCategory');
  if (mccEquivalency.educationalLevel !== 'Doctor of Medicine') fail('MCC equivalency node has unexpected educationalLevel');
  if (mccEquivalency.datePublished !== '2020-09-17') fail('MCC equivalency node has unexpected datePublished');
  if (!hasRef(mccEquivalency, 'recognizedBy', absoluteUrl('/kg/organization#medical-council-of-canada'))) fail('MCC equivalency node missing recognizedBy MCC');
  if (refs(mccEquivalency.identifier).length) fail('MCC equivalency node should not expose report/workflow identifiers');
}

for (const entity of [person, physician].filter(Boolean)) {
  if (!hasIdentifier(entity, 'MINC', 'CAMD-0224-1997')) fail(`${entity['@id']} missing MINC identifier`);
  if (!hasRef(entity, 'hasCredential', absoluteUrl('/kg/credential#mcc-doctor-of-medicine-equivalency'))) fail(`${entity['@id']} missing MCC equivalency credential`);
  if (!hasRef(entity, 'hasCredential', absoluteUrl('/kg/credential#medical-degree'))) fail(`${entity['@id']} missing medical degree credential`);
}

if (dataset) {
  for (const id of [
    absoluteUrl('/kg/organization#medical-council-of-canada'),
    absoluteUrl('/kg/organization#kermanshah-university-medical-sciences-school-of-medicine'),
    absoluteUrl('/kg/credential#medical-degree'),
    absoluteUrl('/kg/credential#mcc-doctor-of-medicine-equivalency')
  ]) {
    if (!hasRef(dataset, 'hasPart', id) && !hasRef(dataset, 'mentions', id) && !hasRef(dataset, 'about', id)) fail(`dataset missing credential authority reference ${id}`);
  }
}

if (failed) process.exit(1);
console.log('Credential authority graph validation passed');
