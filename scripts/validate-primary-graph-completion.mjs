import { absoluteUrl } from '../src/data/site.mjs';
import { services } from '../src/data/services.mjs';
import { buildGlobalGraph } from '../src/lib/globalGraph.mjs';
import {
  aestheticMedicineSpecialtyId,
  dataCatalogId,
  kermanshahPlaceId,
  medicalCredentialId
} from '../src/lib/primaryGraphCompletion.mjs';

let failed = false;
function fail(message) {
  console.error(message);
  failed = true;
}

function refId(value) {
  return value?.['@id'];
}

function refs(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function refIds(value) {
  return refs(value).map((item) => item?.['@id']).filter(Boolean);
}

function typeList(entity) {
  return Array.isArray(entity?.['@type']) ? entity['@type'] : [entity?.['@type']].filter(Boolean);
}

const graph = buildGlobalGraph();
const nodes = graph?.['@graph'] || [];
const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
const catalog = byId.get(dataCatalogId());
const credential = byId.get(medicalCredentialId());
const place = byId.get(kermanshahPlaceId());
const specialty = byId.get(aestheticMedicineSpecialtyId());
const website = byId.get(absoluteUrl('/#website'));
const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
const physician = byId.get(absoluteUrl('/#physician'));
const clinic = byId.get(absoluteUrl('/#clinic'));
const dataset = byId.get(absoluteUrl('/kg/#dataset'));
const termSet = byId.get(absoluteUrl('/kg/aesthetic-scope#term-set'));

if (!catalog) fail('missing DataCatalog node');
if (!credential) fail('missing medical credential node');
if (!place) fail('missing Kermanshah place node');
if (!specialty) fail('missing aesthetic medicine specialty node');

if (catalog) {
  if (catalog['@type'] !== 'DataCatalog') fail('catalog must be DataCatalog');
  if (refId(catalog.dataset) !== absoluteUrl('/kg/#dataset')) fail('catalog dataset must point to primary dataset');
  if (!Array.isArray(catalog.distribution) || catalog.distribution.length < 20) fail('catalog missing machine asset distribution');
}

if (credential) {
  if (credential['@type'] !== 'EducationalOccupationalCredential') fail('credential must be EducationalOccupationalCredential');
  if (credential.identifier?.value !== '167430') fail('credential missing medical council number');
  if (refId(credential.about) !== absoluteUrl('/#dr-saeed-ghezelbash')) fail('credential must be about person');
}

if (place) {
  if (place['@type'] !== 'City') fail('place must be City');
  if (place.name !== 'Kermanshah') fail('place must be Kermanshah');
  if (!place.geo?.latitude || !place.geo?.longitude) fail('place missing geo coordinates');
}

if (specialty) {
  if (specialty['@type'] !== 'DefinedTerm') fail('specialty must be DefinedTerm');
  if (specialty.termCode !== 'aesthetic-medicine') fail('specialty termCode mismatch');
}

if (website) {
  if (refId(website.mainEntity) !== absoluteUrl('/kg/#dataset')) fail('website mainEntity must point to primary dataset');
  const websitePartIds = refIds(website.hasPart);
  for (const requiredPage of [
    `${absoluteUrl('/')}#webpage`,
    `${absoluteUrl('/dr-saeed-ghezelbash/')}#webpage`,
    `${absoluteUrl('/dr-saeed-ghezelbash-aesthetic-clinic/')}#webpage`,
    `${absoluteUrl('/services/')}#webpage`,
    `${absoluteUrl('/kg/')}#webpage`,
    ...services.map((service) => `${absoluteUrl(`/${service.slug}/`)}#webpage`)
  ]) {
    if (!websitePartIds.includes(requiredPage)) fail(`website missing page hasPart: ${requiredPage}`);
  }
}

if (person) {
  if (!refIds(person.hasCredential).includes(medicalCredentialId())) fail('person missing credential reference');
  if (!refIds(person.knowsAbout).includes(aestheticMedicineSpecialtyId())) fail('person missing aesthetic specialty knowsAbout');
}

if (physician) {
  if (!refIds(physician.hasCredential).includes(medicalCredentialId())) fail('physician missing credential reference');
  if (!refIds(physician.medicalSpecialty).includes(aestheticMedicineSpecialtyId())) fail('physician missing aesthetic specialty reference');
  if (refId(physician.areaServed) !== kermanshahPlaceId()) fail('physician areaServed must be Kermanshah place');
}

if (clinic) {
  if (refId(clinic.areaServed) !== kermanshahPlaceId()) fail('clinic areaServed must be Kermanshah place');
}

if (dataset) {
  if (refId(dataset.includedInDataCatalog) !== dataCatalogId()) fail('dataset must be included in DataCatalog');
  if (refId(dataset.spatialCoverage) !== kermanshahPlaceId()) fail('dataset spatialCoverage must point to Kermanshah place');
  if (dataset.isAccessibleForFree !== true) fail('dataset must mark isAccessibleForFree true');
  const mainEntityIds = refIds(dataset.mainEntity);
  for (const requiredEntity of [absoluteUrl('/#dr-saeed-ghezelbash'), absoluteUrl('/#physician'), absoluteUrl('/#clinic'), absoluteUrl('/kg/aesthetic-scope#term-set')]) {
    if (!mainEntityIds.includes(requiredEntity)) fail(`dataset mainEntity missing ${requiredEntity}`);
  }
}

if (termSet && !refIds(termSet.hasDefinedTerm).includes(aestheticMedicineSpecialtyId())) {
  fail('aesthetic term set missing aesthetic medicine specialty term');
}

for (const service of services) {
  const serviceNode = byId.get(absoluteUrl(`/${service.slug}/#service`));
  const pageNode = byId.get(`${absoluteUrl(`/${service.slug}/`)}#webpage`);
  if (!serviceNode) fail(`missing service node: ${service.slug}`);
  if (!pageNode) fail(`missing service page node: ${service.slug}`);
  if (serviceNode && refId(serviceNode.serviceArea) !== kermanshahPlaceId()) fail(`service missing Kermanshah serviceArea: ${service.slug}`);
  if (serviceNode && refId(serviceNode.availableAtOrFrom) !== absoluteUrl('/#clinic')) fail(`service missing clinic availableAtOrFrom: ${service.slug}`);
  if (pageNode && !typeList(pageNode).includes('WebPage')) fail(`service page node must be WebPage: ${service.slug}`);
  if (pageNode && refId(pageNode.mainEntity) !== absoluteUrl(`/${service.slug}/#service`)) fail(`service page mainEntity mismatch: ${service.slug}`);
}

if (failed) process.exit(1);
console.log('Primary graph completion validation passed');
