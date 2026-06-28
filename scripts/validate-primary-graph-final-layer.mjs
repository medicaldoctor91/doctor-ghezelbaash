import { absoluteUrl } from '../src/data/site.mjs';
import { services } from '../src/data/services.mjs';
import { buildGlobalGraph } from '../src/lib/globalGraph.mjs';
import { kermanshahPlaceId } from '../src/lib/primaryGraphCompletion.mjs';

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

function hasRef(entity, property, id) {
  return refIds(entity?.[property]).includes(id);
}

function additionalPropertyIds(entity) {
  return refs(entity?.additionalProperty).map((item) => item?.propertyID).filter(Boolean);
}

const graph = buildGlobalGraph();
const nodes = graph?.['@graph'] || [];
const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
const dataset = byId.get(absoluteUrl('/kg/#dataset'));
const website = byId.get(absoluteUrl('/#website'));
const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
const physician = byId.get(absoluteUrl('/#physician'));
const clinic = byId.get(absoluteUrl('/#clinic'));

const policyId = absoluteUrl('/kg/policy#primary-graph-final-layer');
const expertiseSetId = absoluteUrl('/kg/expertise#term-set');
const expertiseTermIds = [
  'aesthetic-medicine-consultation',
  'patient-selection',
  'facial-anatomy-safety',
  'natural-result-design',
  'risk-communication',
  'evidence-based-aesthetic-medicine',
  'research-literacy',
  'local-aesthetic-authority-kermanshah',
  'nap-consistency',
  'official-contact-path'
].map((code) => absoluteUrl(`/kg/expertise#${code}`));
const evidenceListIds = [
  absoluteUrl('/kg/evidence#identity-sameas-list'),
  absoluteUrl('/kg/evidence#medical-directory-list'),
  absoluteUrl('/kg/evidence#local-map-list'),
  absoluteUrl('/kg/evidence#research-authority-list'),
  absoluteUrl('/kg/evidence#media-coverage-list')
];
const occupationIds = [
  absoluteUrl('/kg/occupation#aesthetic-physician'),
  absoluteUrl('/kg/occupation#medical-researcher')
];
const audienceId = absoluteUrl('/kg/audience#aesthetic-consultation-kermanshah');
const localMarketId = absoluteUrl('/kg/place#kermanshah-aesthetic-medicine-market');

const policy = byId.get(policyId);
if (!policy) fail('missing final policy node');
if (policy) {
  if (policy['@type'] !== 'CreativeWork') fail('final policy node must be CreativeWork');
  for (const key of ['graphConsolidationBoundary', 'officialOfferBoundary', 'sameAsBoundary', 'visibleContentBoundary', 'noRankingGuaranteeBoundary', 'privateDataRedactionBoundary']) {
    if (!additionalPropertyIds(policy).includes(key)) fail(`final policy missing ${key}`);
  }
}

const expertiseSet = byId.get(expertiseSetId);
if (!expertiseSet) fail('missing expertise term set');
if (expertiseSet) {
  if (expertiseSet['@type'] !== 'DefinedTermSet') fail('expertise term set must be DefinedTermSet');
  for (const termId of expertiseTermIds) {
    if (!refIds(expertiseSet.hasDefinedTerm).includes(termId)) fail(`expertise set missing term ${termId}`);
  }
}
for (const termId of expertiseTermIds) {
  const term = byId.get(termId);
  if (!term) fail(`missing expertise term ${termId}`);
  if (term && term['@type'] !== 'DefinedTerm') fail(`expertise term must be DefinedTerm: ${termId}`);
}

for (const listId of evidenceListIds) {
  const list = byId.get(listId);
  if (!list) fail(`missing evidence ItemList ${listId}`);
  if (list) {
    if (list['@type'] !== 'ItemList') fail(`evidence node must be ItemList: ${listId}`);
    if (!Number.isInteger(list.numberOfItems)) fail(`evidence ItemList missing numberOfItems: ${listId}`);
    if (!Array.isArray(list.itemListElement)) fail(`evidence ItemList missing itemListElement: ${listId}`);
  }
}

for (const occupationId of occupationIds) {
  const occupation = byId.get(occupationId);
  if (!occupation) fail(`missing occupation node ${occupationId}`);
  if (occupation && occupation['@type'] !== 'Occupation') fail(`occupation node must be Occupation: ${occupationId}`);
}

if (!byId.get(audienceId)) fail('missing local audience node');
if (!byId.get(localMarketId)) fail('missing local market node');

for (const entity of [person, physician].filter(Boolean)) {
  const label = entity['@id'];
  for (const alias of ['دکتر سعید قزلباش', 'Dr. Saeed Ghezelbash', 'Dr. Saeed Ghezelbaash', 'Saeed Ghezelbash']) {
    if (!refs(entity.alternateName).includes(alias)) fail(`${label} missing alias ${alias}`);
  }
  if (!entity.disambiguatingDescription) fail(`${label} missing disambiguatingDescription`);
  for (const occupationId of occupationIds) {
    if (!hasRef(entity, 'hasOccupation', occupationId)) fail(`${label} missing hasOccupation ${occupationId}`);
  }
  if (!hasRef(entity, 'audience', audienceId)) fail(`${label} missing audience`);
  if (!hasRef(entity, 'areaServed', kermanshahPlaceId())) fail(`${label} missing Kermanshah areaServed`);
  if (!hasRef(entity, 'areaServed', localMarketId)) fail(`${label} missing local market areaServed`);
}

if (clinic) {
  for (const alias of ['کلینیک زیبایی دکتر سعید قزلباش', 'Doctor Ghezelbaash Aesthetic Clinic']) {
    if (!refs(clinic.alternateName).includes(alias)) fail(`clinic missing alias ${alias}`);
  }
  if (!clinic.disambiguatingDescription) fail('clinic missing disambiguatingDescription');
  if (!hasRef(clinic, 'audience', audienceId)) fail('clinic missing audience');
  if (!hasRef(clinic, 'areaServed', kermanshahPlaceId())) fail('clinic missing Kermanshah areaServed');
  if (!hasRef(clinic, 'areaServed', localMarketId)) fail('clinic missing local market areaServed');
}

if (website && !website.disambiguatingDescription) fail('website missing disambiguatingDescription');
if (dataset && !dataset.disambiguatingDescription) fail('dataset missing disambiguatingDescription');

if (dataset) {
  for (const id of [policyId, expertiseSetId, ...expertiseTermIds, ...evidenceListIds, ...occupationIds, audienceId, localMarketId]) {
    if (!hasRef(dataset, 'hasPart', id)) fail(`dataset.hasPart missing ${id}`);
  }
}

for (const service of services) {
  const serviceId = absoluteUrl(`/${service.slug}/#service`);
  const pageId = absoluteUrl(`/${service.slug}/#webpage`);
  const offerId = absoluteUrl(`/${service.slug}/#offer`);
  const faqPageId = absoluteUrl(`/${service.slug}/#faq`);
  const serviceNode = byId.get(serviceId);
  const pageNode = byId.get(pageId);
  const offerNode = byId.get(offerId);
  const faqPage = byId.get(faqPageId);

  if (!faqPage) fail(`missing FAQPage for ${service.slug}`);
  if (faqPage && faqPage['@type'] !== 'FAQPage') fail(`FAQPage node has wrong type for ${service.slug}`);
  if (serviceNode && !hasRef(serviceNode, 'hasPart', faqPageId)) fail(`service missing FAQPage hasPart ${service.slug}`);
  if (serviceNode && !hasRef(serviceNode, 'subjectOf', faqPageId)) fail(`service missing FAQPage subjectOf ${service.slug}`);
  if (pageNode && !hasRef(pageNode, 'hasPart', faqPageId)) fail(`service page missing FAQPage hasPart ${service.slug}`);

  (service.faq || []).forEach((_, index) => {
    const questionId = absoluteUrl(`/${service.slug}/#faq-question-${index + 1}`);
    const question = byId.get(questionId);
    if (!question) fail(`missing Question node ${questionId}`);
    if (question && question['@type'] !== 'Question') fail(`question node has wrong type ${questionId}`);
    if (question && !question.acceptedAnswer) fail(`question missing acceptedAnswer ${questionId}`);
    if (dataset && !hasRef(dataset, 'hasPart', questionId)) fail(`dataset.hasPart missing Question ${questionId}`);
  });

  if (dataset && !hasRef(dataset, 'hasPart', faqPageId)) fail(`dataset.hasPart missing FAQPage ${faqPageId}`);
  if (serviceNode && !hasRef(serviceNode, 'isRelatedTo', absoluteUrl('/kg/expertise#aesthetic-medicine-consultation'))) fail(`service missing expertise relation ${service.slug}`);
  if (serviceNode && !hasRef(serviceNode, 'audience', audienceId)) fail(`service missing audience ${service.slug}`);
  if (serviceNode && !hasRef(serviceNode, 'areaServed', localMarketId)) fail(`service missing local market areaServed ${service.slug}`);

  if (!offerNode) fail(`missing offer node ${service.slug}`);
  if (offerNode) {
    if (refId(offerNode.seller) !== absoluteUrl('/#clinic')) fail(`offer missing seller ${service.slug}`);
    if (refId(offerNode.availableAtOrFrom) !== absoluteUrl('/#clinic')) fail(`offer missing availableAtOrFrom ${service.slug}`);
    if (!hasRef(offerNode, 'areaServed', localMarketId)) fail(`offer missing local market areaServed ${service.slug}`);
    if (!offerNode.eligibleRegion) fail(`offer missing eligibleRegion ${service.slug}`);
  }
}

for (const node of nodes) {
  for (const url of refs(node.sameAs)) {
    if (typeof url !== 'string') continue;
    if (['gadgetnews.net', 'iranmedlabs.com', 'ninisite.com', 'ninisite.com', 'rokna.net'].some((blocked) => url.includes(blocked))) {
      fail(`sameAs contains blocked media/editorial/forum URL: ${url}`);
    }
  }
}

const graphText = JSON.stringify(graph);
for (const privateNeedle of ['E94583066IMM', '1962-87530', 'E0217736', '1991-05-29', 'medicaldoctor91@gmail.com', 'Yazdan Alley', 'Delgosha street']) {
  if (graphText.includes(privateNeedle)) fail(`graph leaked private credential data: ${privateNeedle}`);
}

if (failed) process.exit(1);
console.log('Primary graph final layer validation passed');
