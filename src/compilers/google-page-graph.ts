import type { MarkdownHeading } from 'astro';
import { site } from '~/domain/entities';
import { stabilizeHeadings } from '~/domain/anchor-utils';
import { buildSchemaParts } from '~/lib/schema';

type Node = Record<string, any>;

const compactRef = (id: string) => ({ '@id': id });


const inlineDefinitionFields = [
  '@type',
  '@id',
  'name',
  'alternateName',
  'description',
  'url',
  'inLanguage',
  'keywords',
  'bodyLocation',
  'procedureType',
  'additionalProperty',
] as const;

function collectSameSiteReferences(value: unknown, references: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectSameSiteReferences(item, references));
    return;
  }

  if (!value || typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length === 1
    && typeof record['@id'] === 'string'
    && record['@id'].startsWith(`${site.url}#`)
  ) {
    references.add(record['@id']);
  }

  Object.values(record).forEach((item) => collectSameSiteReferences(item, references));
}

function compactInlineDefinition(node: Node): Node {
  const definition = Object.fromEntries(
    inlineDefinitionFields
      .filter((field) => node[field] !== undefined)
      .map((field) => [field, node[field]]),
  ) as Node;

  // Keep the inline graph within Google's page-level rich-result profile.
  // The full graph retains the more specific Dataset type.
  if (definition['@type'] === 'Dataset') definition['@type'] = 'CreativeWork';

  return definition;
}

export function buildGooglePageGraph(headings: MarkdownHeading[], raw: string) {
  headings = stabilizeHeadings(headings);
  const parts = buildSchemaParts(headings, raw) as Record<string, any>;
  const selectedServices = (parts.umbrellaServiceNodes as Node[]).slice(0, 12);
  const selectedServiceRefs = selectedServices.map((node) => compactRef(node['@id']));
  const selectedProcedures = (parts.procedureNodes as Node[])
    .filter((node) => selectedServices.some((service) => service.name === node.name))
    .slice(0, 12);

  const person: Node = {
    ...parts.personNode,
    '@type': 'Person',
    sameAs: [site.irimcVerification, site.orcidUrl, site.doctorWikidata, site.instagram, site.huggingFaceProfile, site.githubProfile],
    workLocation: compactRef(`${site.url}#clinic`),
    knowsAbout: selectedProcedures.map((node) => compactRef(node['@id'])),
    subjectOf: [compactRef(`${site.url}#article`)],
  };
  delete person.practicesAt;
  delete person.worksFor;
  delete person.affiliation;

  const clinic: Node = {
    ...parts.clinicNode,
    employee: compactRef(`${site.url}#person`),
    availableService: selectedServiceRefs,
    additionalProperty: [
      {
        '@type': 'PropertyValue',
        propertyID: 'googleMapsPublicRatingSnapshot',
        name: 'Snapshot تاریخ‌دار بازخورد عمومی Google Maps',
        value: `${site.googleBusinessProfile.ratingValue}/${site.googleBusinessProfile.bestRating} from ${site.googleBusinessProfile.ratingCount} ratings`,
        url: site.googleBusinessProfile.sourceUrl,
        dateModified: site.googleBusinessProfile.observedAt,
      },
    ],
  };
  delete clinic.hasOfferCatalog;

  const page: Node = {
    ...parts.pageNode,
    // This is a medical mega-landing, not a dedicated author/profile page.
    // Keeping ProfilePage here would conflict with Google's ProfilePage use cases.
    '@type': 'MedicalWebPage',
    mainEntity: [compactRef(`${site.url}#person`), compactRef(`${site.url}#clinic`)],
    about: [compactRef(`${site.url}#person`), compactRef(`${site.url}#clinic`), ...selectedProcedures.map((node) => compactRef(node['@id']))],
    hasPart: [compactRef(`${site.url}#article`), compactRef(`${site.url}#video-watch-pages`)],
  };

  const article: Node = {
    ...parts.articleNode,
    about: page.about,
    mentions: [
      ...selectedProcedures.map((node) => compactRef(node['@id'])),
      ...parts.researchNodes.map((node: Node) => compactRef(node['@id'])),
    ],
    subjectOf: compactRef(`${site.url}#video-watch-pages`),
  };


  const videoWatchPageList: Node = {
    '@type': 'ItemList',
    '@id': `${site.url}#video-watch-pages`,
    name: 'صفحات ویدئویی آموزشی دکتر سعید قزلباش',
    description: 'فهرست صفحات مستقل ویدئو، متن تحریریه و فصل‌بندی هر رسانه.',
    numberOfItems: parts.videoNodes.length,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    itemListElement: (parts.videoNodes as Node[]).map((node, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: node.name,
      url: node.url,
      item: {
        '@type': 'WebPage',
        '@id': node.mainEntityOfPage?.['@id'],
        url: node.url,
        name: node.name,
      },
    })),
  };

  const conversionDock = (parts.panelNodes as Node[])
    .find((node) => node['@id'] === `${site.url}#conversion-dock`);

  const website: Node = {
    '@type': 'WebSite',
    '@id': `${site.url}#website`,
    url: site.url,
    name: site.title,
    inLanguage: site.language,
    publisher: compactRef(`${site.url}#clinic`),
    creator: compactRef(`${site.url}#person`),
    about: [compactRef(`${site.url}#person`), compactRef(`${site.url}#clinic`)],
  };

  const graph: Node[] = [
    parts.irimcOrganizationNode,
    parts.credentialNode,
    person,
    clinic,
    website,
    page,
    article,
    parts.logoNode,
    ...parts.imageNodes,
    ...selectedProcedures,
    ...selectedServices,
    ...parts.researchNodes,
    ...(conversionDock ? [conversionDock] : []),
    videoWatchPageList,
  ];

  const definedIds = new Set(
    graph
      .map((node) => node['@id'])
      .filter((id): id is string => typeof id === 'string'),
  );
  const referencedIds = new Set<string>();
  graph.forEach((node) => collectSameSiteReferences(node, referencedIds));

  const supplementalCandidates: Node[] = [
    parts.authorityNetworkNode,
    parts.editorialReviewNode,
    parts.reputationSnapshotNode,
    ...parts.procedureNodes,
    ...parts.granularConceptNodes,
  ];
  const supplementalNodes = supplementalCandidates
    .filter((node) => (
      typeof node['@id'] === 'string'
      && referencedIds.has(node['@id'])
      && !definedIds.has(node['@id'])
    ))
    .map(compactInlineDefinition);

  return {
    '@context': 'https://schema.org',
    '@graph': [...graph, ...supplementalNodes],
  };
}
