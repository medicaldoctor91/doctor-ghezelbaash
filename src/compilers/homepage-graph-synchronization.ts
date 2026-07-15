import { site } from '~/domain/entities';
import { homepageGraphSyncContract, homepageSharedGraphFragments } from '~/domain/homepage-graph-sync.mjs';

 type Node = Record<string, any>;
 type Graph = { '@context'?: unknown; '@graph'?: Node[] };

const id = (fragment: string) => `${site.url}#${fragment}`;
const ref = (value: string) => ({ '@id': value });
const asArray = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const hasType = (node: Node, type: string) => asArray(node?.['@type']).includes(type);
const uniqueStrings = (values: unknown[]) => [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
const uniqueRefs = (values: Node[]) => {
  const byId = new Map<string, Node>();
  for (const value of values) if (typeof value?.['@id'] === 'string') byId.set(value['@id'], value);
  return [...byId.values()];
};

const personId = id(homepageGraphSyncContract.entities.person);
const clinicId = id(homepageGraphSyncContract.entities.clinic);
const websiteId = id(homepageGraphSyncContract.entities.website);
const webpageId = id(homepageGraphSyncContract.entities.webpage);
const articleId = id(homepageGraphSyncContract.webpage.articleId);
const contentTableId = id(homepageGraphSyncContract.toc.id);
const legacyIds = new Set([id('person'), id('clinic'), id('doctor')]);
const mapResources = new Set([site.maps, site.mapsSearch, site.openStreetMap]);

function sectionAbout(section: { about: string }) {
  if (section.about === 'clinic') return ref(clinicId);
  if (section.about === 'services') return [ref(personId), ref(clinicId)];
  if (section.about === 'data') return ref(id('knowledge-graph-dataset'));
  return ref(personId);
}

function removeLegacy(value: any): any {
  if (Array.isArray(value)) return value.map(removeLegacy).filter((item) => item !== undefined);
  if (!value || typeof value !== 'object') return value;
  if (typeof value['@id'] === 'string' && legacyIds.has(value['@id'])) return undefined;
  const output: Node = {};
  for (const [key, item] of Object.entries(value)) {
    const cleaned = removeLegacy(item);
    if (cleaned === undefined) continue;
    if (Array.isArray(cleaned) && cleaned.length === 0) continue;
    output[key] = cleaned;
  }
  return output;
}

function ensureNode(byId: Map<string, Node>, nodeId: string, type: string | string[]) {
  const current = byId.get(nodeId) ?? { '@id': nodeId };
  current['@type'] = type;
  byId.set(nodeId, current);
  return current;
}

export function synchronizeHomepageGraph(input: Graph): Graph {
  const cleanedNodes = asArray(input['@graph'])
    .map(removeLegacy)
    .filter((node): node is Node => Boolean(node?.['@id']) && !legacyIds.has(node['@id']));
  const byId = new Map<string, Node>(cleanedNodes.map((node) => [node['@id'], node]));

  const person = ensureNode(byId, personId, 'Person');
  person.name = site.legalName;
  person.alternateName = uniqueStrings([...asArray(person.alternateName), site.name]);
  person.url = personId;
  person.mainEntityOfPage = ref(webpageId);
  person.worksFor = ref(clinicId);
  person.workLocation = ref(clinicId);
  person.affiliation = ref(clinicId);
  person.sameAs = uniqueStrings(asArray<string>(person.sameAs).filter((url) => url !== site.instagramDirect && !mapResources.has(url)));

  const clinic = ensureNode(byId, clinicId, ['MedicalClinic', 'LocalBusiness']);
  clinic.name = site.clinicName;
  clinic.url = clinicId;
  clinic.telephone = site.phone;
  clinic.address = {
    '@type': 'PostalAddress',
    ...(clinic.address ?? {}),
    streetAddress: site.streetAddress,
    addressLocality: site.city,
    addressRegion: site.region,
    postalCode: site.postalCode,
    addressCountry: site.countryCode,
  };
  clinic.geo = {
    '@type': 'GeoCoordinates',
    latitude: site.latitude,
    longitude: site.longitude,
  };
  clinic.hasMap = site.maps;
  clinic.employee = ref(personId);
  clinic.aggregateRating = {
    '@type': 'AggregateRating',
    ratingValue: site.googleBusinessProfile.ratingValue,
    bestRating: site.googleBusinessProfile.bestRating,
    worstRating: 1,
    ratingCount: site.googleBusinessProfile.ratingCount,
    reviewCount: site.googleBusinessProfile.ratingCount,
  };
  clinic.sameAs = uniqueStrings(asArray<string>(clinic.sameAs).filter((url) => url !== site.instagramDirect && !mapResources.has(url)));

  const webpage = ensureNode(byId, webpageId, ['MedicalWebPage', 'ProfilePage']);
  webpage.url = site.url;
  webpage.name = homepageGraphSyncContract.headline;
  webpage.headline = homepageGraphSyncContract.headline;
  webpage.description = site.description;
  webpage.inLanguage = site.language;
  webpage.isPartOf = ref(websiteId);
  webpage.mainEntity = ref(personId);
  webpage.author = ref(personId);
  webpage.reviewedBy = ref(personId);
  webpage.publisher = ref(clinicId);
  webpage.primaryImageOfPage = ref(id(homepageGraphSyncContract.webpage.primaryImageId));
  webpage.about = uniqueRefs([ref(personId), ref(clinicId), ...asArray<Node>(webpage.about)]);

  const website = ensureNode(byId, websiteId, 'WebSite');
  website.url = site.url;
  website.name = `وب‌سایت رسمی ${site.name}`;
  website.inLanguage = site.language;
  website.creator = ref(personId);
  website.publisher = ref(clinicId);
  website.about = [ref(personId), ref(clinicId)];

  const article = ensureNode(byId, articleId, 'Article');
  article.url = site.url;
  article.headline = homepageGraphSyncContract.headline;
  article.mainEntity = ref(personId);
  article.mainEntityOfPage = ref(webpageId);
  article.author = ref(personId);
  article.reviewedBy = ref(personId);
  article.publisher = ref(clinicId);
  article.about = uniqueRefs([ref(personId), ref(clinicId), ...asArray<Node>(article.about)]);

  const sectionNodes = homepageGraphSyncContract.sections.map((section: any) => {
    const node = ensureNode(byId, id(section.id), 'WebPageElement');
    node.name = section.title;
    node.url = id(section.id);
    node.inLanguage = site.language;
    node.isPartOf = ref(webpageId);
    node.about = sectionAbout(section);
    return node;
  });

  const contentTable = ensureNode(byId, contentTableId, 'ItemList');
  contentTable.name = homepageGraphSyncContract.toc.title;
  contentTable.url = contentTableId;
  contentTable.inLanguage = site.language;
  contentTable.isPartOf = ref(webpageId);
  contentTable.about = ref(personId);
  contentTable.numberOfItems = homepageGraphSyncContract.sections.length;
  contentTable.itemListOrder = 'https://schema.org/ItemListOrderAscending';
  contentTable.itemListElement = homepageGraphSyncContract.sections.map((section: any, index: number) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: section.title,
    url: id(section.id),
    item: ref(id(section.id)),
  }));

  const destinationIds = new Set<string>();
  const videoNodes = homepageGraphSyncContract.videos.map((video: any) => {
    destinationIds.add(video.destinationId);
    const node = ensureNode(byId, id(video.graphId), 'VideoObject');
    node.name = video.title;
    node.description = video.description;
    node.url = id(video.graphId);
    node.contentUrl = new URL(`videos/${video.file}`, site.url).href;
    node.thumbnailUrl = new URL(video.thumbnail.replace(/^\//u, ''), site.url).href;
    node.duration = video.duration;
    node.width = video.width;
    node.height = video.height;
    node.inLanguage = site.language;
    node.creator = ref(personId);
    node.author = ref(personId);
    node.publisher = ref(clinicId);
    node.isPartOf = ref(id(video.destinationId));
    node.about = video.sectionId === 'clinic-information-kermanshah' ? ref(clinicId) : ref(personId);
    delete node.mainEntityOfPage;
    return node;
  });

  for (const destinationId of destinationIds) {
    if (byId.has(id(destinationId))) continue;
    const parentVideo = homepageGraphSyncContract.videos.find((video: any) => video.destinationId === destinationId);
    const parentSection = homepageGraphSyncContract.sections.find((section: any) => section.id === parentVideo?.sectionId);
    const node = ensureNode(byId, id(destinationId), 'WebPageElement');
    node.name = destinationId;
    node.url = id(destinationId);
    node.inLanguage = site.language;
    node.isPartOf = ref(id(parentVideo?.sectionId ?? homepageGraphSyncContract.entities.webpage));
    node.about = parentSection ? sectionAbout(parentSection) : ref(personId);
  }

  webpage.hasPart = uniqueRefs([
    ...asArray<Node>(webpage.hasPart),
    ref(contentTableId),
    ...sectionNodes.map((node) => ref(node['@id'])),
    ...[...destinationIds].map((fragment) => ref(id(fragment))),
    ...videoNodes.map((node) => ref(node['@id'])),
  ]);
  website.hasPart = uniqueRefs([...asArray<Node>(website.hasPart), ref(webpageId), ref(contentTableId)]);
  article.hasPart = uniqueRefs([...asArray<Node>(article.hasPart), ...sectionNodes.map((node) => ref(node['@id']))]);

  const orderedIds = homepageSharedGraphFragments.map((fragment: string) => id(fragment));
  const ordered = orderedIds.map((nodeId: string) => byId.get(nodeId)).filter(Boolean) as Node[];
  const sharedSet = new Set(orderedIds);
  const remainder = [...byId.values()].filter((node) => !sharedSet.has(node['@id']));

  for (const node of [...ordered, ...remainder]) {
    if (hasType(node, 'MedicalWebPage') || hasType(node, 'ProfilePage') && node['@id'] === webpageId) node.mainEntity = ref(personId);
  }

  return {
    '@context': input['@context'] ?? 'https://schema.org',
    '@graph': [...ordered, ...remainder],
  };
}
