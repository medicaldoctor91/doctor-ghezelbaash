import { absoluteUrl } from '../src/data/site.mjs';
import { buildGlobalGraph } from '../src/lib/schema.mjs';

let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

function typeList(entity) {
  return Array.isArray(entity?.['@type']) ? entity['@type'] : [entity?.['@type']].filter(Boolean);
}

const graph = buildGlobalGraph();
const nodes = graph?.['@graph'] || [];
const byId = new Map(nodes.map((node) => [node['@id'], node]));
const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
const clinic = byId.get(absoluteUrl('/#clinic'));
const organization = byId.get(absoluteUrl('/#organization'));
const services = nodes.filter((node) => node['@type'] === 'Service');

if (!person) fail('missing person entity');
if (!clinic) fail('missing clinic entity');
if (!organization) fail('missing organization entity');

if (person) {
  const personTypes = typeList(person);
  if (!personTypes.includes('Person')) fail('person entity must be type Person');
  if (personTypes.includes('Physician')) fail('person entity must not be typed as Physician');
  for (const localBusinessField of ['telephone', 'address', 'priceRange', 'aggregateRating']) {
    if (localBusinessField in person) fail(`person entity must not contain ${localBusinessField}`);
  }
  if (person.worksFor?.['@id'] !== absoluteUrl('/#clinic')) fail('person worksFor must point to clinic');
  if (person.workLocation?.['@id'] !== absoluteUrl('/#clinic')) fail('person workLocation must point to clinic');
  if (!person.jobTitle) fail('person must retain jobTitle');
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

if (organization) {
  const organizationSameAs = organization.sameAs || [];
  for (const personOnlySignal of ['orcid.org', 'ncbi.nlm.nih.gov', 'membersearch.irimc.org', 'linkedin.com/in']) {
    if (organizationSameAs.some((url) => url.includes(personOnlySignal))) {
      fail(`organization sameAs must not include person-only signal: ${personOnlySignal}`);
    }
  }
}

if (services.length < 5) fail('global graph missing service nodes');
for (const service of services) {
  if (service.provider?.['@id'] !== absoluteUrl('/#clinic')) {
    fail(`service provider must be clinic: ${service['@id'] || service.name}`);
  }
}

if (failed) process.exit(1);
console.log('Schema entity separation validation passed');
