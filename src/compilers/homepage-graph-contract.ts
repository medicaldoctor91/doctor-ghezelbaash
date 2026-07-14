import { site } from '~/domain/entities';
import { videos } from '~/domain/media.mjs';
import { homepageEntityIds, homepageSections } from '~/domain/homepage-sections';

type Node = Record<string, any>;
type Graph = { '@context'?: unknown; '@graph'?: Node[] };

const id = (fragment: string) => `${site.url}#${fragment}`;
const ref = (value: string) => ({ '@id': value });
const asArray = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const hasType = (node: Node, type: string) => asArray(node?.['@type']).includes(type);
const personId = id(homepageEntityIds.person);
const clinicId = id(homepageEntityIds.clinic);
const webpageId = id('webpage');
const websiteId = id('website');
const articleId = id('article');
const clinicalGuideId = id('clinical-guide');
const contentTableId = id('content-table');
const graphDatasetId = id('knowledge-graph-dataset');
const legacyPersonId = id('person');
const legacyClinicId = id('clinic');
const legacyDoctorId = id('doctor');

const replacements = new Map([
  [legacyPersonId, personId],
  [legacyClinicId, clinicId],
  [legacyDoctorId, personId],
]);

function remap(value: any): any {
  if (typeof value === 'string') return replacements.get(value) ?? value;
  if (Array.isArray(value)) return value.map(remap);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, remap(item)]));
}

function uniqueRefs(values: Node[]) {
  const byId = new Map<string, Node>();
  for (const value of values) {
    const valueId = value?.['@id'];
    if (typeof valueId === 'string') byId.set(valueId, value);
  }
  return [...byId.values()];
}

function sectionAbout(section: (typeof homepageSections)[number]) {
  if (section.about === 'clinic') return ref(clinicId);
  if (section.about === 'services') return [ref(personId), ref(clinicId)];
  if (section.about === 'data') return ref(graphDatasetId);
  return ref(personId);
}

function serviceTarget(node: Node) {
  const text = `${node.name ?? ''} ${node.alternateName ?? ''} ${node.serviceType ?? ''} ${node.category ?? ''}`;
  const rules: Array<[RegExp, string]> = [
    [/بوتاکس|بوتولینوم/iu, 'botulinum-toxin-guide'],
    [/فیلر|ژل|هیالورونیداز/iu, 'dermal-filler-guide'],
    [/نخ|لیفت/iu, 'thread-lift-guide'],
    [/سابسیژن|اسکار|جای جوش/iu, 'subcision-guide'],
    [/ملاسما|لک|پوست|جوان/iu, 'skin-scar-rejuvenation'],
    [/مو|PRP|مزوتراپی/iu, 'hair-loss-and-restoration'],
    [/غبغب|زیر چانه/iu, 'submental-liposuction-guide'],
    [/بلفارو/پلک/iu, 'blepharoplasty-evaluation'],
    [/رینو|بینی/iu, 'rhinoplasty-evaluation'],
    [/فک|ارتوگنات/iu, 'orthognathic-surgery-evaluation'],
    [/جراحی|surgery/iu, 'aesthetic-surgery-and-referral'],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1];
}

function sanitize(value: any, removedIds: Set<string>): any {
  if (Array.isArray(value)) return value.map((item) => sanitize(item, removedIds)).filter((item) => item !== undefined);
  if (!value || typeof value !== 'object') return value;
  if (typeof value['@id'] === 'string' && removedIds.has(value['@id'])) return undefined;
  const result: Node = {};
  for (const [key, item] of Object.entries(value)) {
    const cleaned = sanitize(item, removedIds);
    if (cleaned === undefined) continue;
    if (Array.isArray(cleaned) && cleaned.length === 0) continue;
    result[key] = cleaned;
  }
  return result;
}

export function applyHomepageGraphContract(input: Graph): Graph {
  const remapped = remap(input) as Graph;
  const sourceNodes = asArray(remapped['@graph']);
  const canonicalFragments = new Set(homepageSections.map((section) => section.id));
  const removedIds = new Set<string>();

  const filtered = sourceNodes.filter((node) => {
    const nodeId = node?.['@id'];
    if (typeof nodeId !== 'string') return false;
    if (/\/#(?:priority-answer-list|question-priority-|answer-priority-)/u.test(nodeId)) {
      removedIds.add(nodeId);
      return false;
    }
    if (hasType(node, 'WebPageElement') && nodeId.startsWith(`${site.url}#`)) {
      const fragment = nodeId.slice(`${site.url}#`.length);
      const allowed = fragment === 'clinical-guide' || canonicalFragments.has(fragment);
      if (!allowed) removedIds.add(nodeId);
      return allowed;
    }
    return true;
  });

  const cleaned = filtered.map((node) => sanitize(node, removedIds)).filter(Boolean) as Node[];
  const byId = new Map(cleaned.map((node) => [node['@id'], node]));

  const sectionNodes: Node[] = homepageSections.map((section) => ({
    '@type': 'WebPageElement',
    '@id': id(section.id),
    name: section.title,
    url: id(section.id),
    inLanguage: site.language,
    isPartOf: ref(webpageId),
    about: sectionAbout(section),
    additionalProperty: [
      { '@type': 'PropertyValue', propertyID: 'intentClass', value: section.intentClass.join(', ') },
      { '@type': 'PropertyValue', propertyID: 'geographyScope', value: section.geographyScope.join(', ') },
    ],
  }));

  const contentTable: Node = {
    '@type': 'ItemList',
    '@id': contentTableId,
    name: 'فهرست کامل راهنمای پزشکی زیبایی',
    url: contentTableId,
    inLanguage: site.language,
    numberOfItems: homepageSections.length,
    isPartOf: ref(webpageId),
    about: ref(personId),
    itemListElement: homepageSections.map((section, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: section.title,
      url: id(section.id),
      item: ref(id(section.id)),
    })),
  };

  const videoNodes: Node[] = videos.map((video: any) => ({
    '@type': 'VideoObject',
    '@id': id(`video-${video.id}`),
    name: video.title,
    description: video.description,
    url: id(`video-${video.id}`),
    contentUrl: new URL(`videos/${video.file}`, site.url).href,
    thumbnailUrl: new URL(video.thumbnail.replace(/^\//u, ''), site.url).href,
    duration: video.duration,
    width: video.width,
    height: video.height,
    uploadDate: site.datePublished,
    inLanguage: site.language,
    creator: ref(personId),
    author: ref(personId),
    isPartOf: ref(id(video.subsectionId ?? video.sectionId)),
    about: video.sectionId === 'clinic-information-kermanshah' ? ref(clinicId) : ref(personId),
    keywords: video.tags,
  }));

  const person = byId.get(personId) ?? { '@type': 'Person', '@id': personId };
  person['@type'] = 'Person';
  person.url = site.url;
  person.mainEntityOfPage = ref(webpageId);
  person.worksFor = ref(clinicId);
  person.workLocation = ref(clinicId);
  person.affiliation = ref(clinicId);
  person.subjectOf = uniqueRefs([
    ...asArray<Node>(person.subjectOf),
    ref(id('medical-research-and-education')),
    ...videoNodes.filter((node) => node.about?.['@id'] === personId).map((node) => ref(node['@id'])),
  ]);

  const clinic = byId.get(clinicId) ?? { '@type': ['MedicalClinic', 'LocalBusiness'], '@id': clinicId };
  clinic['@type'] = ['MedicalClinic', 'LocalBusiness'];
  clinic.url = site.url;
  clinic.hasMap = site.maps;
  clinic.employee = ref(personId);
  clinic.subjectOf = uniqueRefs([
    ...asArray<Node>(clinic.subjectOf),
    ref(id('clinic-information-kermanshah')),
    ...videoNodes.filter((node) => node.about?.['@id'] === clinicId).map((node) => ref(node['@id'])),
  ]);

  const page = byId.get(webpageId);
  if (page) {
    page.mainEntity = ref(personId);
    page.author = ref(personId);
    page.reviewedBy = ref(personId);
    page.publisher = ref(clinicId);
    page.about = uniqueRefs([ref(personId), ref(clinicId), ...asArray<Node>(page.about)]);
    page.hasPart = uniqueRefs([ref(contentTableId), ref(clinicalGuideId), ...sectionNodes.map((node) => ref(node['@id'])), ...videoNodes.map((node) => ref(node['@id']))]);
  }

  const website = byId.get(websiteId);
  if (website) {
    website.creator = ref(personId);
    website.publisher = ref(clinicId);
    website.about = [ref(personId), ref(clinicId)];
    website.hasPart = uniqueRefs([ref(webpageId), ref(contentTableId)]);
  }

  const article = byId.get(articleId);
  if (article) {
    article.mainEntity = ref(personId);
    article.author = ref(personId);
    article.reviewedBy = ref(personId);
    article.publisher = ref(clinicId);
    article.hasPart = sectionNodes.map((node) => ref(node['@id']));
  }

  for (const node of cleaned) {
    if (hasType(node, 'Question') || hasType(node, 'Answer')) node.url = id('aesthetic-faq-kermanshah-iran');
    if (hasType(node, 'Service') || hasType(node, 'MedicalProcedure') || hasType(node, 'SurgicalProcedure')) {
      const target = serviceTarget(node);
      if (target) node.url = id(target);
      if (hasType(node, 'Service')) node.provider = ref(clinicId);
      node.subjectOf = ref(articleId);
    }
  }

  const finalNodes = new Map<string, Node>();
  for (const node of [...cleaned, person, clinic, ...sectionNodes, contentTable, ...videoNodes]) {
    if (node?.['@id']) finalNodes.set(node['@id'], node);
  }

  return {
    '@context': remapped['@context'] ?? 'https://schema.org',
    '@graph': [...finalNodes.values()],
  };
}
