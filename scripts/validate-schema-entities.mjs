import { absoluteUrl } from '../src/data/site.mjs';
import { buildGlobalGraph } from '../src/lib/schema.mjs';

let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function warn(message) {
  console.warn(message);
}

function typeList(entity) {
  return Array.isArray(entity?.['@type']) ? entity['@type'] : [entity?.['@type']].filter(Boolean);
}

const graph = buildGlobalGraph();
const nodes = graph?.['@graph'] || [];
const byId = new Map(nodes.map((node) => [node['@id'], node]));
const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
const physician = byId.get(absoluteUrl('/#physician'));
const clinic = byId.get(absoluteUrl('/#clinic'));
const services = nodes.filter((node) => node['@type'] === 'Service');

if (!person) fail('missing person entity');
if (!physician) fail('missing physician entity');
if (!clinic) fail('missing clinic entity');

if (person) {
  const personTypes = typeList(person);
  if (!personTypes.includes('Person')) fail('person entity must be type Person');
  if (personTypes.includes('Physician')) fail('person node must stay separate from physician node');
  for (const localBusinessField of ['telephone', 'address', 'priceRange', 'aggregateRating']) {
    if (localBusinessField in person) warn(`person entity contains local-business field: ${localBusinessField}`);
  }
  if (person.worksFor?.['@id'] !== absoluteUrl('/#clinic')) fail('person worksFor must point to clinic');
  if (!person.jobTitle) fail('person must retain jobTitle');
}

if (physician) {
  const physicianTypes = typeList(physician);
  if (!physicianTypes.includes('Physician')) fail('physician entity must be type Physician');
  if (!physician.telephone) fail('physician missing telephone');
  if (!physician.priceRange) fail('physician missing priceRange');
  if (physician.address?.postalCode !== '6714657412') fail('physician address missing canonical postalCode');
  if (!physician.medicalSpecialty) fail('physician missing medicalSpecialty');
  if (!Array.isArray(physician.availableService) || physician.availableService.length < 5) fail('physician missing availableService links');
}

if (clinic) {
  const clinicTypes = typeList(clinic);
  for (const requiredType of ['MedicalClinic', 'MedicalBusiness', 'LocalBusiness']) {
    if (!clinicTypes.includes(requiredType)) fail(`clinic entity missing ${requiredType}`);
  }
  if (!clinic.telephone) fail('clinic missing telephone');
  if (!clinic.priceRange) fail('clinic missing priceRange');
  if (clinic.address?.postalCode !== '6714657412') fail('clinic address missing canonical postalCode');
  if (!clinic.aggregateRating) fail('clinic missing aggregateRating');
  if (clinic.founder?.['@id'] !== absoluteUrl('/#dr-saeed-ghezelbash')) fail('clinic founder must point to person');
}

if (services.length < 5) fail('global graph missing service nodes');
for (const service of services) {
  if (service.provider?.['@id'] !== absoluteUrl('/#clinic')) {
    fail(`service provider must be clinic: ${service['@id'] || service.name}`);
  }
}

if (failed) process.exit(1);
console.log('Schema entity separation validation passed');
