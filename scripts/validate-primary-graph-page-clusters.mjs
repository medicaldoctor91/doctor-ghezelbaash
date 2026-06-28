import { absoluteUrl, site } from '../src/data/site.mjs';
import { services } from '../src/data/services.mjs';
import { buildGlobalGraph } from '../src/lib/globalGraph.mjs';
import { aestheticConceptsForService } from '../src/lib/aestheticScopeGraph.mjs';
import { officialOfferCatalogId } from '../src/lib/officialOfferGraph.mjs';
import { kermanshahPlaceId } from '../src/lib/primaryGraphCompletion.mjs';
import {
  breadcrumbId,
  contactPageId,
  pageClusterId,
  serviceListId
} from '../src/lib/primaryGraphPageClusters.mjs';
import { graphContactPointId } from '../src/lib/schemaPropertyExpansion.mjs';

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

function typeList(entity) {
  return Array.isArray(entity?.['@type']) ? entity['@type'] : [entity?.['@type']].filter(Boolean);
}

const graph = buildGlobalGraph();
const nodes = graph?.['@graph'] || [];
const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
const website = byId.get(absoluteUrl('/#website'));
const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
const physician = byId.get(absoluteUrl('/#physician'));
const clinic = byId.get(absoluteUrl('/#clinic'));
const dataset = byId.get(absoluteUrl('/kg/#dataset'));
const serviceList = byId.get(serviceListId());
const contactPage = byId.get(contactPageId());
const requiredClusterKeys = ['overview', 'use-cases', 'process', 'decision-criteria', 'risk-signals', 'faq', 'related-concepts'];

if (!serviceList) fail('missing service ItemList node');
if (!contactPage) fail('missing ContactPage node');

if (person && refId(person.mainEntityOfPage) !== `${absoluteUrl(site.pages.person)}#webpage`) fail('person missing mainEntityOfPage');
if (physician && refId(physician.mainEntityOfPage) !== `${absoluteUrl(site.pages.person)}#webpage`) fail('physician missing mainEntityOfPage');
if (clinic && refId(clinic.mainEntityOfPage) !== `${absoluteUrl(site.pages.clinic)}#webpage`) fail('clinic missing mainEntityOfPage');
if (dataset && refId(dataset.mainEntityOfPage) !== `${absoluteUrl(site.pages.kg)}#webpage`) fail('dataset missing mainEntityOfPage');

if (website) {
  const websiteParts = refIds(website.hasPart);
  if (!websiteParts.includes(contactPageId())) fail('website missing contact page hasPart');
  if (!refs(website.potentialAction).some((action) => action?.['@type'] === 'ContactAction')) fail('website missing ContactAction');
}

if (serviceList) {
  if (serviceList['@type'] !== 'ItemList') fail('service list must be ItemList');
  if (serviceList.numberOfItems !== services.length) fail('service list numberOfItems mismatch');
  if (!Array.isArray(serviceList.itemListElement) || serviceList.itemListElement.length !== services.length) fail('service list item count mismatch');
}

if (contactPage) {
  if (!typeList(contactPage).includes('ContactPage')) fail('contact page must include ContactPage type');
  if (refId(contactPage.mainEntity) !== absoluteUrl('/#clinic')) fail('contact page mainEntity must be clinic');
  if (refId(contactPage.breadcrumb) !== breadcrumbId(site.pages.contact)) fail('contact page missing breadcrumb');
  if (!refs(contactPage.potentialAction).some((action) => action?.['@type'] === 'ContactAction')) fail('contact page missing ContactAction');
  if (!refs(contactPage.potentialAction).some((action) => action?.['@type'] === 'CommunicateAction')) fail('contact page missing CommunicateAction');
}

for (const [path, name] of [
  ['/', 'home'],
  [site.pages.person, 'person'],
  [site.pages.clinic, 'clinic'],
  [site.pages.services, 'services'],
  [site.pages.kg, 'kg'],
  [site.pages.contact, 'contact']
]) {
  const breadcrumb = byId.get(breadcrumbId(path));
  if (!breadcrumb) fail(`missing breadcrumb for ${name}`);
  if (breadcrumb && breadcrumb['@type'] !== 'BreadcrumbList') fail(`breadcrumb must be BreadcrumbList: ${name}`);
}

for (const service of services) {
  const serviceNodeId = absoluteUrl(`/${service.slug}/#service`);
  const pageNodeId = `${absoluteUrl(`/${service.slug}/`)}#webpage`;
  const serviceNode = byId.get(serviceNodeId);
  const pageNode = byId.get(pageNodeId);
  const breadcrumb = byId.get(breadcrumbId(`/${service.slug}/`));
  const conceptIds = aestheticConceptsForService(service.key).map((concept) => absoluteUrl(`/kg/aesthetic-scope#${concept.key}`));

  if (!serviceNode) fail(`missing service node: ${service.slug}`);
  if (!pageNode) fail(`missing service page node: ${service.slug}`);
  if (!breadcrumb) fail(`missing service breadcrumb: ${service.slug}`);

  if (serviceNode) {
    if (refId(serviceNode.mainEntityOfPage) !== pageNodeId) fail(`service missing mainEntityOfPage: ${service.slug}`);
    if (!refIds(serviceNode.subjectOf).includes(pageNodeId)) fail(`service missing subjectOf page: ${service.slug}`);
    if (!refIds(serviceNode.isRelatedTo).some((id) => conceptIds.includes(id))) fail(`service missing concept isRelatedTo: ${service.slug}`);
    if (!refs(serviceNode.potentialAction).some((action) => action?.['@type'] === 'ContactAction')) fail(`service missing ContactAction: ${service.slug}`);
  }

  if (pageNode) {
    if (!typeList(pageNode).includes('MedicalWebPage')) fail(`service page must include MedicalWebPage: ${service.slug}`);
    if (refId(pageNode.mainEntity) !== serviceNodeId) fail(`service page mainEntity mismatch: ${service.slug}`);
    if (refId(pageNode.breadcrumb) !== breadcrumbId(`/${service.slug}/`)) fail(`service page missing breadcrumb ref: ${service.slug}`);
    if (!refIds(pageNode.mentions).includes(graphContactPointId())) fail(`service page missing ContactPoint mention: ${service.slug}`);
    if (!refIds(pageNode.mentions).includes(kermanshahPlaceId())) fail(`service page missing Kermanshah mention: ${service.slug}`);
    if (!refIds(pageNode.mentions).includes(officialOfferCatalogId())) fail(`service page missing OfferCatalog mention: ${service.slug}`);
    if (!refs(pageNode.potentialAction).some((action) => action?.['@type'] === 'CommunicateAction')) fail(`service page missing CommunicateAction: ${service.slug}`);
  }

  for (const clusterKey of requiredClusterKeys) {
    const clusterId = pageClusterId(service, clusterKey);
    const cluster = byId.get(clusterId);
    if (!cluster) {
      fail(`missing service page cluster: ${service.slug} ${clusterKey}`);
      continue;
    }
    if (cluster['@type'] !== 'WebPageElement') fail(`cluster must be WebPageElement: ${clusterId}`);
    if (refId(cluster.isPartOf) !== pageNodeId) fail(`cluster must be part of service page: ${clusterId}`);
    if (!refIds(cluster.mentions).includes(serviceNodeId)) fail(`cluster mentions missing service: ${clusterId}`);
  }

  for (const conceptId of conceptIds.slice(0, 12)) {
    const concept = byId.get(conceptId);
    if (!concept) continue;
    if (!refIds(concept.isRelatedTo).includes(serviceNodeId)) fail(`concept missing service relation: ${conceptId}`);
    if (refId(concept.mainEntityOfPage) !== pageNodeId) fail(`concept missing mainEntityOfPage: ${conceptId}`);
  }
}

if (dataset) {
  const datasetParts = refIds(dataset.hasPart);
  if (!datasetParts.includes(serviceListId())) fail('dataset missing service list hasPart');
  if (!datasetParts.includes(contactPageId())) fail('dataset missing contact page hasPart');
  for (const service of services) {
    if (!datasetParts.includes(`${absoluteUrl(`/${service.slug}/`)}#webpage`)) fail(`dataset missing service page hasPart: ${service.slug}`);
    for (const clusterKey of requiredClusterKeys) {
      if (!datasetParts.includes(pageClusterId(service, clusterKey))) fail(`dataset missing cluster hasPart: ${service.slug} ${clusterKey}`);
    }
  }
}

if (failed) process.exit(1);
console.log('Primary graph page cluster validation passed');
