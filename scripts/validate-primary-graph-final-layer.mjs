import { absoluteUrl } from '../src/data/site.mjs';
import { services } from '../src/data/services.mjs';
import { buildGlobalGraph } from '../src/lib/globalGraph.mjs';
import { kermanshahPlaceId } from '../src/lib/primaryGraphCompletion.mjs';

let failed = false;
const fail = (message) => { console.error(message); failed = true; };
const refs = (value) => Array.isArray(value) ? value : [value].filter(Boolean);
const refId = (value) => value?.['@id'];
const refIds = (value) => refs(value).map((item) => item?.['@id']).filter(Boolean);
const hasRef = (entity, property, id) => refIds(entity?.[property]).includes(id);
const propertyIds = (entity) => refs(entity?.additionalProperty).map((item) => item?.propertyID).filter(Boolean);

const graph = buildGlobalGraph();
const graphText = JSON.stringify(graph);
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
const evidenceListIds = ['identity-sameas-list', 'medical-directory-list', 'local-map-list', 'research-authority-list', 'media-coverage-list'].map((key) => absoluteUrl(`/kg/evidence#${key}`));
const occupationIds = [absoluteUrl('/kg/occupation#aesthetic-physician'), absoluteUrl('/kg/occupation#medical-researcher')];
const audienceId = absoluteUrl('/kg/audience#aesthetic-consultation-kermanshah');
const localMarketId = absoluteUrl('/kg/place#kermanshah-aesthetic-medicine-market');

const policy = byId.get(policyId);
if (!policy) fail('missing final policy node');
if (policy) {
  if (policy['@type'] !== 'CreativeWork') fail('final policy node must be CreativeWork');
  for (const key of ['graphConsolidationBoundary', 'officialOfferBoundary', 'sameAsBoundary', 'visibleContentBoundary', 'noRankingGuaranteeBoundary', 'privateDataRedactionBoundary']) {
    if (!propertyIds(policy).includes(key)) fail(`final policy missing ${key}`);
  }
}

const expertiseSet = byId.get(expertiseSetId);
if (!expertiseSet) fail('missing expertise term set');
if (expertiseSet) {
  if (expertiseSet['@type'] !== 'DefinedTermSet') fail('expertise term set must be DefinedTermSet');
  for (const id of expertiseTermIds) if (!refIds(expertiseSet.hasDefinedTerm).includes(id)) fail(`expertise set missing ${id}`);
}
for (const id of expertiseTermIds) {
  const term = byId.get(id);
  if (!term) fail(`missing expertise term ${id}`);
  if (term && term['@type'] !== 'DefinedTerm') fail(`expertise term type mismatch ${id}`);
}

for (const id of evidenceListIds) {
  const item = byId.get(id);
  if (!item) fail(`missing evidence list ${id}`);
  if (item) {
    if (item['@type'] !== 'ItemList') fail(`evidence list type mismatch ${id}`);
    if (!Number.isInteger(item.numberOfItems)) fail(`evidence list count missing ${id}`);
    if (!Array.isArray(item.itemListElement)) fail(`evidence list items missing ${id}`);
  }
}

for (const id of occupationIds) {
  const occupation = byId.get(id);
  if (!occupation) fail(`missing occupation ${id}`);
  if (occupation && occupation['@type'] !== 'Occupation') fail(`occupation type mismatch ${id}`);
}
if (!byId.get(audienceId)) fail('missing local audience node');
if (!byId.get(localMarketId)) fail('missing local market node');

for (const entity of [person, physician].filter(Boolean)) {
  for (const alias of ['دکتر سعید قزلباش', 'Dr. Saeed Ghezelbash', 'Dr. Saeed Ghezelbaash', 'Saeed Ghezelbash']) {
    if (!refs(entity.alternateName).includes(alias)) fail(`${entity['@id']} missing alias ${alias}`);
  }
  if (!entity.disambiguatingDescription) fail(`${entity['@id']} missing disambiguatingDescription`);
  for (const id of occupationIds) if (!hasRef(entity, 'hasOccupation', id)) fail(`${entity['@id']} missing occupation ${id}`);
  if (!hasRef(entity, 'audience', audienceId)) fail(`${entity['@id']} missing audience`);
  if (!hasRef(entity, 'areaServed', kermanshahPlaceId())) fail(`${entity['@id']} missing Kermanshah areaServed`);
  if (!hasRef(entity, 'areaServed', localMarketId)) fail(`${entity['@id']} missing local market areaServed`);
}

if (clinic) {
  for (const alias of ['کلینیک زیبایی دکتر سعید قزلباش', 'Doctor Ghezelbaash Aesthetic Clinic']) if (!refs(clinic.alternateName).includes(alias)) fail(`clinic missing alias ${alias}`);
  if (!clinic.disambiguatingDescription) fail('clinic missing disambiguatingDescription');
  if (!hasRef(clinic, 'audience', audienceId)) fail('clinic missing audience');
  if (!hasRef(clinic, 'areaServed', kermanshahPlaceId())) fail('clinic missing Kermanshah areaServed');
  if (!hasRef(clinic, 'areaServed', localMarketId)) fail('clinic missing local market areaServed');
}

if (website && !website.disambiguatingDescription) fail('website missing disambiguatingDescription');
if (dataset && !dataset.disambiguatingDescription) fail('dataset missing disambiguatingDescription');
if (dataset) for (const id of [policyId, expertiseSetId, ...expertiseTermIds, ...evidenceListIds, ...occupationIds, audienceId, localMarketId]) if (!hasRef(dataset, 'hasPart', id)) fail(`dataset.hasPart missing ${id}`);

for (const service of services) {
  const serviceId = absoluteUrl(`/${service.slug}/#service`);
  const pageId = absoluteUrl(`/${service.slug}/#webpage`);
  const offerId = absoluteUrl(`/${service.slug}/#offer`);
  const faqPageId = absoluteUrl(`/${service.slug}/#faq`);
  const serviceNode = byId.get(serviceId);
  const pageNode = byId.get(pageId);
  const offerNode = byId.get(offerId);
  const faqPage = byId.get(faqPageId);

  if (!faqPage) fail(`missing FAQPage ${service.slug}`);
  if (faqPage && faqPage['@type'] !== 'FAQPage') fail(`FAQPage type mismatch ${service.slug}`);
  if (serviceNode && !hasRef(serviceNode, 'subjectOf', faqPageId)) fail(`service subjectOf missing FAQPage ${service.slug}`);
  if (pageNode && !hasRef(pageNode, 'hasPart', faqPageId)) fail(`service page missing FAQPage ${service.slug}`);
  if (dataset && !hasRef(dataset, 'hasPart', faqPageId)) fail(`dataset missing FAQPage ${service.slug}`);
  if (serviceNode && !hasRef(serviceNode, 'audience', audienceId)) fail(`service missing audience ${service.slug}`);
  if (serviceNode && !hasRef(serviceNode, 'areaServed', localMarketId)) fail(`service missing local market ${service.slug}`);

  (service.faq || []).forEach((_, index) => {
    const questionId = absoluteUrl(`/${service.slug}/#faq-question-${index + 1}`);
    const question = byId.get(questionId);
    if (!question) fail(`missing Question ${questionId}`);
    if (question && question['@type'] !== 'Question') fail(`Question type mismatch ${questionId}`);
    if (question && !question.acceptedAnswer) fail(`Question answer missing ${questionId}`);
    if (dataset && !hasRef(dataset, 'hasPart', questionId)) fail(`dataset missing Question ${questionId}`);
  });

  if (!offerNode) fail(`missing offer ${service.slug}`);
  if (offerNode) {
    if (refId(offerNode.seller) !== absoluteUrl('/#clinic')) fail(`offer seller mismatch ${service.slug}`);
    if (refId(offerNode.availableAtOrFrom) !== absoluteUrl('/#clinic')) fail(`offer location mismatch ${service.slug}`);
    if (!hasRef(offerNode, 'areaServed', localMarketId)) fail(`offer local market missing ${service.slug}`);
    if (!offerNode.eligibleRegion) fail(`offer eligibleRegion missing ${service.slug}`);
  }
}

for (const node of nodes) for (const url of refs(node.sameAs)) if (typeof url === 'string' && ['gadgetnews.net', 'iranmedlabs.com', 'ninisite.com', 'rokna.net'].some((host) => url.includes(host))) fail(`blocked URL in sameAs ${url}`);
for (const needle of ['E94583066IMM', '1962-87530', 'E0217736', '1991-05-29', 'medicaldoctor91@gmail.com', 'Yazdan Alley', 'Delgosha street']) if (graphText.includes(needle)) fail(`private data leaked ${needle}`);

if (failed) process.exit(1);
console.log('Primary graph final layer validation passed');
