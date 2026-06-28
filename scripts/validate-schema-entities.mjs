import { absoluteUrl } from '../src/data/site.mjs';
import { aestheticServiceConcepts } from '../src/data/aestheticScope.mjs';
import { researchProfile } from '../src/data/research.mjs';
import { services as officialServices } from '../src/data/services.mjs';
import { buildGlobalGraph } from '../src/lib/globalGraph.mjs';

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
const serviceNodes = nodes.filter((node) => node['@type'] === 'Service');
const definedTerms = nodes.filter((node) => node['@type'] === 'DefinedTerm');
const scholarlyArticles = nodes.filter((node) => node['@type'] === 'ScholarlyArticle');
const scholarlyArticleIds = researchProfile.publications.map((publication) => absoluteUrl(`/research/#${publication.key}`));
const conceptIds = aestheticServiceConcepts.map((concept) => absoluteUrl(`/kg/aesthetic-scope#${concept.key}`));
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
}

if (dataset) {
  const citationIds = refIds(dataset.citation);
  for (const articleId of scholarlyArticleIds) {
    if (!citationIds.includes(articleId)) fail(`dataset citation missing scholarly article: ${articleId}`);
  }
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
  if (!Array.isArray(termSet.hasDefinedTerm) || termSet.hasDefinedTerm.length !== aestheticServiceConcepts.length) fail('aesthetic scope term set must include every concept exactly once');
  const termSetIds = refIds(termSet.hasDefinedTerm);
  for (const conceptId of conceptIds) {
    if (!termSetIds.includes(conceptId)) fail(`aesthetic scope term set missing concept: ${conceptId}`);
  }
}

if (aestheticServiceConcepts.length < 100) fail('aesthetic service concept source has not been expanded enough');
if (definedTerms.length < aestheticServiceConcepts.length) fail('global graph missing broad DefinedTerm nodes');

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
}

if (failed) process.exit(1);
console.log('Schema entity separation validation passed');
