import { absoluteUrl } from '../src/data/site.mjs';
import { services } from '../src/data/services.mjs';
import { buildGlobalGraph } from '../src/lib/globalGraph.mjs';
import { entityCrosswalkDatasetId, entityRelationTermSetId } from '../src/lib/entityCrosswalk.mjs';
import { officialOfferCatalogId } from '../src/lib/officialOfferGraph.mjs';
import { dataCatalogId, kermanshahPlaceId, medicalCredentialId, aestheticMedicineSpecialtyId } from '../src/lib/primaryGraphCompletion.mjs';
import { primaryGraphGovernancePolicyId } from '../src/lib/primaryGraphRelations.mjs';

let failed = false;
function fail(message) {
  console.error(message);
  failed = true;
}

function refs(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function refId(value) {
  return value?.['@id'];
}

function refIds(value) {
  return refs(value).map((item) => item?.['@id']).filter(Boolean);
}

function propertyValues(entity, propertyID) {
  return refs(entity?.additionalProperty)
    .filter((property) => property?.propertyID === propertyID)
    .map((property) => property.value);
}

const graph = buildGlobalGraph();
const nodes = graph?.['@graph'] || [];
const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
const website = byId.get(absoluteUrl('/#website'));
const organization = byId.get(absoluteUrl('/#organization'));
const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
const physician = byId.get(absoluteUrl('/#physician'));
const clinic = byId.get(absoluteUrl('/#clinic'));
const dataset = byId.get(absoluteUrl('/kg/#dataset'));
const catalog = byId.get(dataCatalogId());
const policy = byId.get(primaryGraphGovernancePolicyId());
const termSet = byId.get(absoluteUrl('/kg/aesthetic-scope#term-set'));
const offerCatalog = byId.get(officialOfferCatalogId());
const crosswalkDataset = byId.get(entityCrosswalkDatasetId());
const relationTermSet = byId.get(entityRelationTermSetId());
const researchCollection = byId.get(absoluteUrl('/research/#collection'));
const primaryGraphId = absoluteUrl('/graph-ghezelbaash-final.jsonld');
const requiredPrimaryEntityIds = [
  absoluteUrl('/#dr-saeed-ghezelbash'),
  absoluteUrl('/#physician'),
  absoluteUrl('/#clinic'),
  absoluteUrl('/#website'),
  absoluteUrl('/#organization'),
  absoluteUrl('/kg/#dataset'),
  dataCatalogId(),
  officialOfferCatalogId(),
  entityCrosswalkDatasetId(),
  entityRelationTermSetId(),
  absoluteUrl('/kg/aesthetic-scope#term-set'),
  absoluteUrl('/research/#collection'),
  medicalCredentialId(),
  kermanshahPlaceId(),
  aestheticMedicineSpecialtyId()
];

if (!policy) fail('missing primary graph governance policy node');

if (policy) {
  if (policy['@type'] !== 'CreativeWork') fail('governance policy must be CreativeWork');
  if (refId(policy.mainEntity) !== absoluteUrl('/kg/#dataset')) fail('governance policy mainEntity must be dataset');
  if (refId(policy.isPartOf) !== absoluteUrl('/kg/#dataset')) fail('governance policy must be part of dataset');
  const aboutIds = refIds(policy.about);
  for (const id of requiredPrimaryEntityIds) {
    if (!aboutIds.includes(id)) fail(`governance policy missing primary entity in about: ${id}`);
  }
  for (const requiredProperty of ['graphConsolidationPolicy', 'offerBoundaryPolicy', 'sameAsPolicy']) {
    if (!propertyValues(policy, requiredProperty).length) fail(`governance policy missing ${requiredProperty}`);
  }
}

if (website) {
  if (refId(website.creator) !== absoluteUrl('/#dr-saeed-ghezelbash')) fail('website creator must be person');
  if (refId(website.maintainer) !== absoluteUrl('/#clinic')) fail('website maintainer must be clinic');
  if (!refIds(website.subjectOf).includes(primaryGraphId)) fail('website subjectOf must include primary graph');
  for (const id of requiredPrimaryEntityIds) {
    if (!refIds(website.mentions).includes(id)) fail(`website mentions missing ${id}`);
  }
}

if (organization) {
  if (refId(organization.founder) !== absoluteUrl('/#dr-saeed-ghezelbash')) fail('organization founder must be person');
  if (!refIds(organization.member).includes(absoluteUrl('/#physician'))) fail('organization member must include physician');
}

for (const entity of [person, physician, clinic, termSet, offerCatalog, crosswalkDataset, researchCollection].filter(Boolean)) {
  const subjectOfIds = refIds(entity.subjectOf);
  if (!subjectOfIds.includes(primaryGraphId)) fail(`${entity['@id']} subjectOf missing primary graph`);
  if (!subjectOfIds.includes(primaryGraphGovernancePolicyId())) fail(`${entity['@id']} subjectOf missing governance policy`);
}

if (person) {
  if (!refs(person.knowsLanguage).includes('fa-IR') || !refs(person.knowsLanguage).includes('en')) fail('person missing knowsLanguage fa-IR/en');
  if (!refIds(person.mentions).includes(dataCatalogId())) fail('person mentions missing DataCatalog');
}

if (physician) {
  if (!refs(physician.knowsLanguage).includes('fa-IR') || !refs(physician.knowsLanguage).includes('en')) fail('physician missing knowsLanguage fa-IR/en');
  if (!refIds(physician.mentions).includes(medicalCredentialId())) fail('physician mentions missing credential');
}

if (clinic) {
  for (const id of [absoluteUrl('/#dr-saeed-ghezelbash'), absoluteUrl('/#physician'), kermanshahPlaceId(), officialOfferCatalogId()]) {
    if (!refIds(clinic.mentions).includes(id)) fail(`clinic mentions missing ${id}`);
  }
}

if (dataset) {
  if (dataset.schemaVersion !== 'https://schema.org/version/latest/') fail('dataset missing schemaVersion');
  if (refId(dataset.creator) !== absoluteUrl('/#dr-saeed-ghezelbash')) fail('dataset creator must be person');
  if (refId(dataset.publisher) !== absoluteUrl('/#clinic')) fail('dataset publisher must be clinic');
  if (refId(dataset.provider) !== absoluteUrl('/#clinic')) fail('dataset provider must be clinic');
  if (refId(dataset.maintainer) !== absoluteUrl('/#clinic')) fail('dataset maintainer must be clinic');
  if (refId(dataset.accountablePerson) !== absoluteUrl('/#dr-saeed-ghezelbash')) fail('dataset accountablePerson must be person');
  for (const id of [primaryGraphGovernancePolicyId(), dataCatalogId(), medicalCredentialId(), kermanshahPlaceId(), aestheticMedicineSpecialtyId()]) {
    if (!refIds(dataset.hasPart).includes(id)) fail(`dataset hasPart missing ${id}`);
  }
  for (const service of services) {
    if (!refIds(dataset.mentions).includes(absoluteUrl(`/${service.slug}/#service`))) fail(`dataset mentions missing service ${service.slug}`);
  }
}

if (catalog) {
  if (refId(catalog.mainEntity) !== absoluteUrl('/kg/#dataset')) fail('catalog mainEntity must be dataset');
  for (const id of [absoluteUrl('/kg/#dataset'), entityCrosswalkDatasetId(), officialOfferCatalogId(), absoluteUrl('/kg/aesthetic-scope#term-set'), absoluteUrl('/research/#collection')]) {
    if (!refIds(catalog.hasPart).includes(id)) fail(`catalog hasPart missing ${id}`);
  }
}

for (const service of services) {
  const serviceNode = byId.get(absoluteUrl(`/${service.slug}/#service`));
  if (!serviceNode) {
    fail(`missing service node ${service.slug}`);
    continue;
  }
  if (!refIds(serviceNode.subjectOf).includes(primaryGraphId)) fail(`service subjectOf missing primary graph: ${service.slug}`);
  if (!refIds(serviceNode.subjectOf).includes(primaryGraphGovernancePolicyId())) fail(`service subjectOf missing policy: ${service.slug}`);
  for (const id of [absoluteUrl('/#clinic'), absoluteUrl('/#physician'), officialOfferCatalogId(), kermanshahPlaceId()]) {
    if (!refIds(serviceNode.mentions).includes(id)) fail(`service mentions missing ${id}: ${service.slug}`);
  }
}

if (failed) process.exit(1);
console.log('Primary graph relation hardening validation passed');
