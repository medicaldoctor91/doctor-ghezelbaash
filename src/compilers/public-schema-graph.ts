type JsonObject = Record<string, any>;

type JsonLdGraph = {
  '@context'?: unknown;
  '@graph'?: JsonObject[];
};

const SITE = 'https://www.ghezelbaash.ir/';
const id = (fragment: string) => `${SITE}#${fragment}`;
const CORE_IDS = [
  id('mohammad-saeed-ghezelbash'),
  id('dr-saeed-ghezelbash-aesthetic-clinic'),
  id('website'),
  id('webpage'),
  id('credential-irimc-167430'),
  id('logo'),
  id('image-doctor-portrait'),
  id('image-doctor-exam'),
  id('image-doctor-with-staff'),
  id('clinic-reputation-snapshot'),
] as const;

const pick = (node: JsonObject | undefined, fields: string[]): JsonObject => {
  if (!node) return {};
  return Object.fromEntries(fields
    .filter((field) => node[field] !== undefined)
    .map((field) => [field, node[field]]));
};

const asArray = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];

const minimalProcedure = (node: JsonObject | undefined): JsonObject | null => {
  if (!node?.['@id']) return null;
  return pick(node, [
    '@type',
    '@id',
    'name',
    'description',
    'url',
    'bodyLocation',
    'procedureType',
  ]);
};

export function buildPublicSchemaGraph(graph: JsonLdGraph): JsonLdGraph {
  const nodes = asArray(graph['@graph']);
  const byId = new Map(nodes
    .filter((node) => typeof node?.['@id'] === 'string')
    .map((node) => [node['@id'], node]));

  const personSource = byId.get(id('mohammad-saeed-ghezelbash'));
  const clinicSource = byId.get(id('dr-saeed-ghezelbash-aesthetic-clinic'));
  const websiteSource = byId.get(id('website'));
  const webpageSource = byId.get(id('webpage'));

  if (!personSource || !clinicSource || !websiteSource || !webpageSource) {
    throw new Error('Public schema core entities are missing from the Homepage graph.');
  }

  const knownTopicNames = asArray(personSource.knowsAbout)
    .map((item) => typeof item === 'string'
      ? item
      : typeof item?.['@id'] === 'string'
        ? byId.get(item['@id'])?.name ?? item['@id']
        : null)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  const availableProcedureIds = asArray(clinicSource.availableService)
    .map((item) => item?.['@id'])
    .filter((value): value is string => typeof value === 'string');
  const procedures = availableProcedureIds
    .map((procedureId) => minimalProcedure(byId.get(procedureId)))
    .filter((node): node is JsonObject => Boolean(node));

  const person = pick(personSource, [
    '@type', '@id', 'name', 'givenName', 'familyName', 'honorificPrefix',
    'alternateName', 'url', 'jobTitle', 'description',
    'disambiguatingDescription', 'telephone', 'identifier', 'sameAs',
    'image', 'hasCredential', 'worksFor', 'workLocation', 'affiliation',
    'mainEntityOfPage',
  ]);
  person.knowsAbout = [...new Set(knownTopicNames)];

  const clinic = pick(clinicSource, [
    '@type', '@id', 'name', 'alternateName', 'url', 'telephone', 'geo',
    'hasMap', 'openingHoursSpecification', 'contactPoint', 'areaServed',
    'identifier', 'sameAs', 'aggregateRating', 'address', 'logo', 'image',
    'employee',
  ]);
  clinic.availableService = procedures.map((node) => ({ '@id': node['@id'] }));

  const website = pick(websiteSource, [
    '@type', '@id', 'url', 'name', 'alternateName', 'inLanguage',
    'publisher', 'creator',
  ]);
  website.about = [
    { '@id': person['@id'] },
    { '@id': clinic['@id'] },
  ];
  website.hasPart = [{ '@id': webpageSource['@id'] }];

  const webpage = pick(webpageSource, [
    '@type', '@id', 'url', 'name', 'headline', 'description', 'inLanguage',
    'dateCreated', 'datePublished', 'dateModified', 'isPartOf', 'mainEntity',
    'primaryImageOfPage', 'author', 'reviewedBy', 'publisher',
  ]);
  webpage.about = [
    { '@id': person['@id'] },
    { '@id': clinic['@id'] },
  ];
  webpage.mentions = [{ '@id': clinic['@id'] }];

  const coreNodes = CORE_IDS
    .slice(4)
    .map((nodeId) => byId.get(nodeId))
    .filter((node): node is JsonObject => Boolean(node));

  return {
    '@context': graph['@context'] ?? 'https://schema.org',
    '@graph': [person, clinic, website, webpage, ...coreNodes, ...procedures],
  };
}
