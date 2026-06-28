import { absoluteUrl } from '../src/data/site.mjs';
import { aestheticServiceConcepts } from '../src/data/aestheticScope.mjs';
import { researchProfile } from '../src/data/research.mjs';
import { services as officialServices } from '../src/data/services.mjs';
import { buildGlobalGraph } from '../src/lib/globalGraph.mjs';
import {
  entityCrosswalkDatasetId,
  entityRelationTermSetId,
  wikidataLikeRelationMappings
} from '../src/lib/entityCrosswalk.mjs';
import {
  officialOfferCatalogId,
  officialOfferId,
  officialServiceId
} from '../src/lib/officialOfferGraph.mjs';

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

function refIds(value) {
  return (Array.isArray(value) ? value : [value].filter(Boolean))
    .map((item) => item?.['@id'])
    .filter(Boolean);
}

function identifierValues(entity, propertyID) {
  return (Array.isArray(entity?.identifier) ? entity.identifier : [entity?.identifier].filter(Boolean))
    .filter((identifier) => identifier?.propertyID === propertyID)
    .map((identifier) => identifier.value);
}

function propertyValues(entity, propertyID) {
  return (Array.isArray(entity?.additionalProperty) ? entity.additionalProperty : [entity?.additionalProperty].filter(Boolean))
    .filter((property) => property?.propertyID === propertyID)
    .map((property) => property.value);
}

const graph = buildGlobalGraph();
const nodes = graph?.['@graph'] || [];
const byId = new Map(nodes.map((node) => [node['@id'], node]));
const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
const physician = byId.get(absoluteUrl('/#physician'));
const clinic = byId.get(absoluteUrl('/#clinic'));
const dataset = byId.get(absoluteUrl('/kg/#dataset'));
const researchCollection = byId.get(absoluteUrl('/research/#collection'));
const termSet = byId.get(absoluteUrl('/kg/aesthetic-scope#term-set'));
const offerCatalog = byId.get(officialOfferCatalogId());
const crosswalkDataset = byId.get(entityCrosswalkDatasetId());
const relationTermSet = byId.get(entityRelationTermSetId());
const serviceNodes = nodes.filter((node) => node['@type'] === 'Service');
const offerNodes = nodes.filter((node) => node['@type'] === 'Offer');
const definedTerms = nodes.filter((node) => node['@type'] === 'DefinedTerm');
const scholarlyArticles = nodes.filter((node) => node['@type'] === 'ScholarlyArticle');
const scholarlyArticleIds = researchProfile.publications.map((publication) => absoluteUrl(`/research/#${publication.key}`));
const conceptIds = aestheticServiceConcepts.map((concept) => absoluteUrl(`/kg/aesthetic-scope#${concept.key}`));
const officialServiceIds = officialServices.map(officialServiceId);
const officialOfferIds = officialServices.map(officialOfferId);
const blockedSameAsHosts = ['iranmedlabs.com', 'ninisite.com', 'rokna.net', 'namnak.com', 'khabaronline.ir', 'gadgetnews.net', 'niniban.com'];
const requiredConceptKeys = [
  'botox-masseter',
  'hyaluronic-acid-filler',
  'mesogel',
  'hydrogel-injection',
  'profhilo',
  'exosome-hair',
  'blepharoplasty',
  'rhinoplasty',
  'body-liposuction',
  'hyaluronidase-filler-dissolving'
];

if (!person) fail('missing person entity');
if (!physician) fail('missing physician entity');
if (!clinic) fail('missing clinic entity');
if (!dataset) fail('missing knowledge graph dataset');
if (!researchCollection) fail('missing research collection entity');
if (!termSet) fail('missing aesthetic scope term set');
if (!offerCatalog) fail('missing official offer catalog');
if (!crosswalkDataset) fail('missing entity crosswalk dataset');
if (!relationTermSet) fail('missing entity relation term set');

for (const node of nodes) {
  const sameAsValues = Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs].filter(Boolean);
  for (const sameAsUrl of sameAsValues) {
    if (blockedSameAsHosts.some((host) => sameAsUrl.includes(host))) {
      fail(`blocked media/editorial/forum URL leaked into sameAs for ${node['@id'] || node.name}: ${sameAsUrl}`);
    }
  }
}

if (person) {
  const personTypes = typeList(person);
  if (!personTypes.includes('Person')) fail('person entity must be type Person');
  if (personTypes.includes('Physician')) fail('person node must stay separate from physician node');
  for (const localBusinessField of ['telephone', 'address', 'priceRange', 'aggregateRating']) {
    if (localBusinessField in person) warn(`person entity contains local-business field: ${localBusinessField}`);
  }
  if (person.worksFor?.['@id'] !== absoluteUrl('/#clinic')) fail('person worksFor must point to clinic');
  if (!person.jobTitle) fail('person must retain jobTitle');
  if (!Array.isArray(person.knowsAbout) || person.knowsAbout.length < aestheticServiceConcepts.length) fail('person missing broad aesthetic knowsAbout concepts');
  const subjectOfIds = refIds(person.subjectOf);
  for (const articleId of scholarlyArticleIds) {
    if (!subjectOfIds.includes(articleId)) fail(`person subjectOf missing scholarly article: ${articleId}`);
  }
}

if (physician) {
  const physicianTypes = typeList(physician);
  if (!physicianTypes.includes('Physician')) fail('physician entity must be type Physician');
  if (!physician.telephone) fail('physician missing telephone');
  if (!physician.priceRange) fail('physician missing priceRange');
  if (physician.address?.postalCode !== '6714657412') fail('physician address missing canonical postalCode');
  if (!physician.medicalSpecialty) fail('physician missing medicalSpecialty');
  if (!Array.isArray(physician.availableService) || physician.availableService.length !== officialServices.length) fail('physician availableService must stay limited to official services');
  if (!Array.isArray(physician.makesOffer) || physician.makesOffer.length !== officialServices.length) fail('physician makesOffer must stay limited to official services');
  if (physician.hasOfferCatalog?.['@id'] !== officialOfferCatalogId()) fail('physician must point to official offer catalog');
  if (!Array.isArray(physician.knowsAbout) || physician.knowsAbout.length < aestheticServiceConcepts.length) fail('physician missing broad aesthetic knowsAbout concepts');
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
  if (!Array.isArray(clinic.availableService) || clinic.availableService.length !== officialServices.length) fail('clinic availableService must stay limited to official services');
  if (!Array.isArray(clinic.makesOffer) || clinic.makesOffer.length !== officialServices.length) fail('clinic makesOffer must stay limited to official services');
  if (clinic.hasOfferCatalog?.['@id'] !== officialOfferCatalogId()) fail('clinic must point to official offer catalog');
}

if (dataset) {
  const citationIds = refIds(dataset.citation);
  const hasPartIds = refIds(dataset.hasPart);
  for (const articleId of scholarlyArticleIds) {
    if (!citationIds.includes(articleId)) fail(`dataset citation missing scholarly article: ${articleId}`);
  }
  for (const requiredPartId of [
    entityCrosswalkDatasetId(),
    entityRelationTermSetId(),
    absoluteUrl('/kg/aesthetic-scope#term-set'),
    officialOfferCatalogId(),
    absoluteUrl('/research/#collection'),
    ...officialServiceIds
  ]) {
    if (!hasPartIds.includes(requiredPartId)) fail(`knowledge graph dataset missing hasPart: ${requiredPartId}`);
  }
}

if (crosswalkDataset) {
  if (!typeList(crosswalkDataset).includes('Dataset')) fail('entity crosswalk node must be Dataset');
  if (crosswalkDataset.isPartOf?.['@id'] !== absoluteUrl('/kg/#dataset')) fail('entity crosswalk dataset must be part of main dataset');
  const crosswalkHasPartIds = refIds(crosswalkDataset.hasPart);
  for (const requiredPartId of [entityRelationTermSetId(), absoluteUrl('/kg/aesthetic-scope#term-set'), officialOfferCatalogId(), absoluteUrl('/research/#collection')]) {
    if (!crosswalkHasPartIds.includes(requiredPartId)) fail(`entity crosswalk dataset missing hasPart: ${requiredPartId}`);
  }
  if (!String(crosswalkDataset.measurementTechnique || '').includes('Schema.org relationship crosswalk')) fail('entity crosswalk missing measurementTechnique');
}

if (relationTermSet) {
  if (relationTermSet['@type'] !== 'DefinedTermSet') fail('entity relation set must be DefinedTermSet');
  if (!Array.isArray(relationTermSet.hasDefinedTerm) || relationTermSet.hasDefinedTerm.length !== wikidataLikeRelationMappings.length) fail('relation term set must include every relationship mapping');
}

for (const mapping of wikidataLikeRelationMappings) {
  const relationNode = byId.get(absoluteUrl(`/kg/entity-crosswalk#${mapping.key}`));
  if (!relationNode) {
    fail(`missing relation mapping term: ${mapping.key}`);
    continue;
  }
  if (relationNode.inDefinedTermSet?.['@id'] !== entityRelationTermSetId()) fail(`relation term missing relation set: ${mapping.key}`);
  if (relationNode.alternateName !== mapping.schemaProperty) fail(`relation term schema property mismatch: ${mapping.key}`);
}

if (researchCollection) {
  const mainEntityIds = refIds(researchCollection.mainEntity);
  for (const articleId of scholarlyArticleIds) {
    if (!mainEntityIds.includes(articleId)) fail(`research collection missing article: ${articleId}`);
  }
}

if (scholarlyArticles.length < researchProfile.publications.length) fail('global graph missing ScholarlyArticle nodes');
for (const publication of researchProfile.publications) {
  const article = byId.get(absoluteUrl(`/research/#${publication.key}`));
  if (!article) {
    fail(`missing scholarly article node: ${publication.key}`);
    continue;
  }
  if (article.author?.['@id'] !== absoluteUrl('/#dr-saeed-ghezelbash')) fail(`article author must point to person: ${publication.key}`);
  if (!identifierValues(article, 'DOI').includes(publication.doi)) fail(`article missing DOI identifier: ${publication.key}`);
  if (!identifierValues(article, 'PMID').includes(publication.pmid)) fail(`article missing PMID identifier: ${publication.key}`);
  if (!identifierValues(article, 'PMCID').includes(publication.pmcid)) fail(`article missing PMCID identifier: ${publication.key}`);
}

if (termSet) {
  if (termSet['@type'] !== 'DefinedTermSet') fail('aesthetic scope node must be DefinedTermSet');
  if (!Array.isArray(termSet.hasDefinedTerm) || termSet.hasDefinedTerm.length < aestheticServiceConcepts.length) fail('aesthetic scope term set must include every aesthetic concept');
  const termSetIds = refIds(termSet.hasDefinedTerm);
  for (const conceptId of conceptIds) {
    if (!termSetIds.includes(conceptId)) fail(`aesthetic scope term set missing concept: ${conceptId}`);
  }
}

if (aestheticServiceConcepts.length < 100) fail('aesthetic service concept source has not been expanded enough');
if (definedTerms.length < aestheticServiceConcepts.length + wikidataLikeRelationMappings.length) fail('global graph missing broad DefinedTerm nodes');

for (const conceptKey of requiredConceptKeys) {
  const conceptNode = byId.get(absoluteUrl(`/kg/aesthetic-scope#${conceptKey}`));
  if (!conceptNode) {
    fail(`global graph missing required aesthetic concept: ${conceptKey}`);
    continue;
  }
  if (!propertyValues(conceptNode, 'offerStatus').includes('knowledge-scope')) fail(`concept must remain knowledge-scope: ${conceptKey}`);
}

if (serviceNodes.length < officialServices.length) fail('global graph missing service nodes');
for (const service of serviceNodes) {
  if (service.provider?.['@id'] !== absoluteUrl('/#clinic')) {
    fail(`service provider must be clinic: ${service['@id'] || service.name}`);
  }
  if (officialServiceIds.includes(service['@id']) && !officialOfferIds.includes(service.offers?.['@id'])) {
    fail(`official service must point to its offer: ${service['@id']}`);
  }
}

if (offerCatalog) {
  if (offerCatalog['@type'] !== 'OfferCatalog') fail('official offer catalog must be OfferCatalog');
  const catalogOfferIds = refIds((offerCatalog.itemListElement || []).map((item) => item.item));
  for (const offerId of officialOfferIds) {
    if (!catalogOfferIds.includes(offerId)) fail(`official offer catalog missing offer: ${offerId}`);
  }
}

if (offerNodes.length !== officialServices.length) fail('Offer nodes must match official services only');
for (const offer of offerNodes) {
  if (!officialOfferIds.includes(offer['@id'])) fail(`unexpected offer node: ${offer['@id']}`);
  if (!officialServiceIds.includes(offer.itemOffered?.['@id'])) fail(`offer itemOffered must be official service only: ${offer['@id']}`);
  if (offer.offeredBy?.['@id'] !== absoluteUrl('/#clinic')) fail(`offer offeredBy must be clinic: ${offer['@id']}`);
  if (!propertyValues(offer, 'offerStatus').includes('official-current-service')) fail(`offer missing official-current-service status: ${offer['@id']}`);
}

if (failed) process.exit(1);
console.log('Schema entity separation validation passed');
