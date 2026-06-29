import { absoluteUrl, site } from '../src/data/site.mjs';
import { services } from '../src/data/services.mjs';
import { buildGlobalGraph } from '../src/lib/globalGraph.mjs';
import { breadcrumbId, contactPageId, serviceListId } from '../src/lib/primaryGraphPageClusters.mjs';
import { graphContactPointId } from '../src/lib/schemaPropertyExpansion.mjs';
import { officialOfferCatalogId } from '../src/lib/officialOfferGraph.mjs';
import { kermanshahPlaceId } from '../src/lib/primaryGraphCompletion.mjs';

let failed = false;
const fail = (message) => { console.error(message); failed = true; };
const refs = (value) => Array.isArray(value) ? value : [value].filter(Boolean);
const refId = (value) => value?.['@id'];
const refIds = (value) => refs(value).map((item) => item?.['@id']).filter(Boolean);
const types = (value) => refs(value?.['@type']);

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

if (!serviceList) fail('missing service list');
if (serviceList && (serviceList['@type'] !== 'ItemList' || serviceList.numberOfItems !== services.length || refs(serviceList.itemListElement).length !== services.length)) fail('invalid service list');

if (!contactPage) fail('missing contact page');
if (contactPage) {
  if (!types(contactPage).includes('ContactPage')) fail('contact page type mismatch');
  if (refId(contactPage.mainEntity) !== absoluteUrl('/#clinic')) fail('contact page mainEntity mismatch');
  if (refId(contactPage.breadcrumb) !== breadcrumbId(site.pages.contact)) fail('contact page breadcrumb mismatch');
  if (!refs(contactPage.potentialAction).some((action) => action?.['@type'] === 'ContactAction')) fail('contact page missing contact action');
  if (!refs(contactPage.potentialAction).some((action) => action?.['@type'] === 'CommunicateAction')) fail('contact page missing communicate action');
}

if (website) {
  if (!refIds(website.hasPart).includes(contactPageId())) fail('website missing contact page');
  if (!refs(website.potentialAction).some((action) => action?.['@type'] === 'ContactAction')) fail('website missing contact action');
}

if (person && refId(person.mainEntityOfPage) !== `${absoluteUrl(site.pages.person)}#webpage`) fail('person page link mismatch');
if (physician && refId(physician.mainEntityOfPage) !== `${absoluteUrl(site.pages.person)}#webpage`) fail('physician page link mismatch');
if (clinic && refId(clinic.mainEntityOfPage) !== `${absoluteUrl(site.pages.clinic)}#webpage`) fail('clinic page link mismatch');
if (dataset && refId(dataset.mainEntityOfPage) !== `${absoluteUrl(site.pages.kg)}#webpage`) fail('dataset page link mismatch');

for (const path of ['/', site.pages.person, site.pages.clinic, site.pages.services, site.pages.kg, site.pages.contact]) {
  const breadcrumb = byId.get(breadcrumbId(path));
  if (!breadcrumb) fail(`missing breadcrumb ${path}`);
  if (breadcrumb && breadcrumb['@type'] !== 'BreadcrumbList') fail(`breadcrumb type mismatch ${path}`);
}

for (const service of services) {
  const serviceId = absoluteUrl(`/${service.slug}/#service`);
  const pageId = `${absoluteUrl(`/${service.slug}/`)}#webpage`;
  const serviceNode = byId.get(serviceId);
  const pageNode = byId.get(pageId);
  const breadcrumb = byId.get(breadcrumbId(`/${service.slug}/`));
  const clusters = nodes.filter((node) => String(node['@id'] || '').startsWith(`${absoluteUrl(`/${service.slug}/`)}#cluster-`));

  if (!serviceNode) fail(`missing service ${service.slug}`);
  if (!pageNode) fail(`missing service page ${service.slug}`);
  if (!breadcrumb) fail(`missing service breadcrumb ${service.slug}`);
  if (clusters.length < 7) fail(`missing service page clusters ${service.slug}`);

  if (serviceNode) {
    if (refId(serviceNode.mainEntityOfPage) !== pageId) fail(`service page ownership mismatch ${service.slug}`);
    if (!refIds(serviceNode.subjectOf).includes(pageId)) fail(`service subjectOf page missing ${service.slug}`);
    if (!refs(serviceNode.potentialAction).some((action) => action?.['@type'] === 'ContactAction')) fail(`service contact action missing ${service.slug}`);
  }

  if (pageNode) {
    if (!types(pageNode).includes('MedicalWebPage')) fail(`service page type mismatch ${service.slug}`);
    if (refId(pageNode.mainEntity) !== serviceId) fail(`service page mainEntity mismatch ${service.slug}`);
    if (refId(pageNode.breadcrumb) !== breadcrumbId(`/${service.slug}/`)) fail(`service page breadcrumb mismatch ${service.slug}`);
    for (const id of [graphContactPointId(), kermanshahPlaceId(), officialOfferCatalogId()]) {
      if (!refIds(pageNode.mentions).includes(id)) fail(`service page mention missing ${service.slug}`);
    }
    if (!refs(pageNode.potentialAction).some((action) => action?.['@type'] === 'CommunicateAction')) fail(`service page communicate action missing ${service.slug}`);
  }

  for (const cluster of clusters) {
    if (cluster['@type'] !== 'WebPageElement') fail(`cluster type mismatch ${cluster['@id']}`);
    if (refId(cluster.isPartOf) !== pageId) fail(`cluster page ownership mismatch ${cluster['@id']}`);
    if (!refIds(cluster.mentions).includes(serviceId)) fail(`cluster service mention missing ${cluster['@id']}`);
  }
}

if (dataset) {
  const parts = refIds(dataset.hasPart);
  for (const id of [serviceListId(), contactPageId()]) if (!parts.includes(id)) fail(`dataset hasPart missing ${id}`);
  for (const service of services) {
    if (!parts.includes(`${absoluteUrl(`/${service.slug}/`)}#webpage`)) fail(`dataset service page missing ${service.slug}`);
    if (nodes.filter((node) => String(node['@id'] || '').startsWith(`${absoluteUrl(`/${service.slug}/`)}#cluster-`) && parts.includes(node['@id'])).length < 7) fail(`dataset cluster references missing ${service.slug}`);
  }
}

if (failed) process.exit(1);
console.log('Primary graph page cluster validation passed');
