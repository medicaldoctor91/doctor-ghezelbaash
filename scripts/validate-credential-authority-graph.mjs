import { absoluteUrl } from '../src/data/site.mjs';
import { buildGlobalGraph } from '../src/lib/globalGraph.mjs';

let failed = false;
const fail = (message) => { console.error(message); failed = true; };
const refs = (value) => Array.isArray(value) ? value : [value].filter(Boolean);
const refIds = (value) => refs(value).map((item) => item?.['@id']).filter(Boolean);
const types = (node) => refs(node?.['@type']);
const hasRef = (entity, property, id) => refIds(entity?.[property]).includes(id);

const graph = buildGlobalGraph();
const nodes = graph?.['@graph'] || [];
const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));

const personId = absoluteUrl('/#dr-saeed-ghezelbash');
const physicianId = absoluteUrl('/#physician');
const datasetId = absoluteUrl('/kg/#dataset');
const medicalDegreeId = absoluteUrl('/kg/credential#medical-degree');
const mccEquivalencyId = absoluteUrl('/kg/credential#mcc-doctor-of-medicine-equivalency');
const schoolId = absoluteUrl('/kg/organization#kermanshah-university-medical-sciences-school-of-medicine');
const mccId = absoluteUrl('/kg/organization#medical-council-of-canada');

const person = byId.get(personId);
const physician = byId.get(physicianId);
const dataset = byId.get(datasetId);
const medicalDegree = byId.get(medicalDegreeId);
const mccEquivalency = byId.get(mccEquivalencyId);
const school = byId.get(schoolId);
const mcc = byId.get(mccId);

for (const [label, node] of [
  ['person', person],
  ['physician', physician],
  ['dataset', dataset],
  ['medical degree', medicalDegree],
  ['MCC equivalency', mccEquivalency],
  ['medical school', school],
  ['medical council', mcc]
]) {
  if (!node) fail(`missing credential authority node: ${label}`);
}

for (const credential of [medicalDegree, mccEquivalency].filter(Boolean)) {
  if (!types(credential).includes('EducationalOccupationalCredential')) fail(`${credential['@id']} must include EducationalOccupationalCredential`);
  if (!types(credential).includes('CreativeWork')) fail(`${credential['@id']} must include CreativeWork`);
  if (!hasRef(credential, 'about', personId)) fail(`${credential['@id']} must be about person`);
}

for (const entity of [person, physician].filter(Boolean)) {
  const linkedIds = [...refIds(entity.hasCredential), ...refIds(entity.subjectOf)];
  if (!linkedIds.includes(medicalDegreeId)) fail(`${entity['@id']} missing medical degree reference`);
  if (!linkedIds.includes(mccEquivalencyId)) fail(`${entity['@id']} missing MCC equivalency reference`);
}

if (dataset) {
  const datasetRefs = [...refIds(dataset.hasPart), ...refIds(dataset.mentions), ...refIds(dataset.about)];
  for (const id of [medicalDegreeId, mccEquivalencyId, schoolId, mccId]) {
    if (!datasetRefs.includes(id)) fail(`dataset missing credential authority reference ${id}`);
  }
}

if (failed) process.exit(1);
console.log('Credential authority graph validation passed');
