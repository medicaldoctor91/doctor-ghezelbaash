import type { MarkdownHeading } from 'astro';
import { site } from '~/domain/entities';
import { priorityIntentAnswers } from '~/domain/priority-intent-answers.mjs';
import { buildCanonicalKnowledgeGraph } from './knowledge-graph';

type Node = Record<string, any>;

const ref = (id: string) => ({ '@id': id });
const asArray = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const hasType = (node: Node, type: string) => asArray(node?.['@type']).includes(type);

function pick(node: Node, fields: string[]): Node {
  return Object.fromEntries(fields.filter((field) => node?.[field] !== undefined).map((field) => [field, node[field]]));
}

export function buildGooglePageGraph(headings: MarkdownHeading[], raw: string) {
  const canonical = buildCanonicalKnowledgeGraph(headings, raw);
  const nodes = canonical['@graph'] as Node[];
  const byId = new Map(nodes.map((node) => [node['@id'], node]));

  const personId = `${site.url}#person`;
  const clinicId = `${site.url}#clinic`;
  const websiteId = `${site.url}#website`;
  const pageId = `${site.url}#webpage`;
  const articleId = `${site.url}#article`;
  const logoId = `${site.url}#logo`;
  const credentialId = `${site.url}#credential-irimc-${site.irimc}`;
  const portraitId = `${site.url}#image-doctor-portrait`;
  const reputationId = `${site.url}#clinic-reputation-snapshot`;
  const priorityAnswerListId = `${site.url}#priority-answer-list`;

  const procedureNodes = nodes.filter((node) =>
    /^https:\/\/www\.ghezelbaash\.ir\/#procedure-/.test(node['@id'] ?? '')
    && (hasType(node, 'MedicalProcedure') || hasType(node, 'SurgicalProcedure')),
  );
  const serviceNodes = nodes.filter((node) =>
    /^https:\/\/www\.ghezelbaash\.ir\/#service-/.test(node['@id'] ?? '')
    && hasType(node, 'Service'),
  );
  const imageNodes = nodes.filter((node) => [
    portraitId,
    `${site.url}#image-doctor-exam`,
    `${site.url}#image-doctor-with-staff`,
  ].includes(node['@id']));

  const personSource = byId.get(personId) as Node;
  const clinicSource = byId.get(clinicId) as Node;
  const websiteSource = byId.get(websiteId) as Node;
  const pageSource = byId.get(pageId) as Node;
  const articleSource = byId.get(articleId) as Node;
  const logoSource = byId.get(logoId) as Node;
  const credentialSource = byId.get(credentialId) as Node;
  const reputationSource = byId.get(reputationId) as Node;
  const priorityAnswerListSource = byId.get(priorityAnswerListId) as Node;

  const offeredProcedureIds = new Set(
    asArray<Node>(clinicSource.availableService)
      .map((item) => item?.['@id'])
      .filter((id): id is string => typeof id === 'string'),
  );
  const offeredProcedureNodes = procedureNodes.filter((node) => offeredProcedureIds.has(node['@id']));

  const person: Node = {
    ...pick(personSource, [
      '@id', 'name', 'givenName', 'familyName', 'honorificPrefix', 'alternateName', 'url', 'jobTitle',
      'description', 'disambiguatingDescription', 'telephone', 'identifier', 'sameAs',
    ]),
    '@type': 'Person',
    image: ref(portraitId),
    hasCredential: ref(credentialId),
    worksFor: ref(clinicId),
    workLocation: ref(clinicId),
    affiliation: ref(clinicId),
    knowsAbout: procedureNodes.map((node) => ref(node['@id'])),
    subjectOf: [ref(articleId), ref(reputationId), ref(priorityAnswerListId)],
  };

  const clinic: Node = {
    ...pick(clinicSource, [
      '@id', 'name', 'alternateName', 'url', 'telephone', 'geo', 'hasMap',
      'openingHoursSpecification', 'contactPoint', 'areaServed', 'identifier', 'sameAs', 'aggregateRating',
    ]),
    address: {
      ...(clinicSource.address ?? {}),
      postalCode: site.postalCode,
    },
    '@type': ['MedicalClinic', 'LocalBusiness'],
    logo: ref(logoId),
    image: imageNodes.map((node) => ref(node['@id'])),
    employee: ref(personId),
    availableService: offeredProcedureNodes.map((node) => ref(node['@id'])),
    subjectOf: [ref(reputationId), ref(priorityAnswerListId)],
  };

  const website: Node = {
    ...pick(websiteSource, ['@type', '@id', 'url', 'name', 'alternateName', 'inLanguage']),
    publisher: ref(clinicId),
    creator: ref(personId),
    about: [ref(personId), ref(clinicId)],
    hasPart: ref(priorityAnswerListId),
  };

  const page: Node = {
    ...pick(pageSource, ['@id', 'url', 'name', 'headline', 'description', 'inLanguage', 'dateCreated', 'datePublished', 'dateModified']),
    '@type': ['MedicalWebPage', 'ProfilePage'],
    isPartOf: ref(websiteId),
    mainEntity: ref(personId),
    primaryImageOfPage: ref(portraitId),
    author: ref(personId),
    reviewedBy: ref(personId),
    publisher: ref(clinicId),
    about: [ref(personId), ref(clinicId), ...procedureNodes.map((node) => ref(node['@id']))],
    mentions: [ref(clinicId), ref(reputationId)],
    hasPart: [ref(articleId), ref(priorityAnswerListId)],
  };

  const article: Node = {
    ...pick(articleSource, ['@type', '@id', 'headline', 'name', 'description', 'inLanguage', 'wordCount']),
    datePublished: site.datePublished,
    dateModified: site.dateModified,
    url: site.url,
    isPartOf: ref(pageId),
    mainEntity: ref(personId),
    author: ref(personId),
    reviewedBy: ref(personId),
    publisher: ref(clinicId),
    image: ref(portraitId),
    about: [ref(personId), ref(clinicId), ...procedureNodes.map((node) => ref(node['@id']))],
    mentions: ref(reputationId),
  };

  const reputation: Node = {
    ...pick(reputationSource, [
      '@type', '@id', 'url', 'name', 'description', 'dateModified', 'temporalCoverage',
      'about', 'isBasedOn', 'mainEntity', 'mentions', 'variableMeasured',
    ]),
    isPartOf: ref(pageId),
  };

  const priorityAnswerList: Node = pick(priorityAnswerListSource, [
    '@type', '@id', 'name', 'url', 'inLanguage', 'numberOfItems', 'about', 'itemListElement',
  ]);

  const priorityNodes: Node[] = priorityIntentAnswers.flatMap((item: { id: string }) => {
    const question = byId.get(`${site.url}#question-${item.id}`);
    const answer = byId.get(`${site.url}#answer-${item.id}`);
    return [question, answer].filter(Boolean).map((node) => pick(node as Node, [
      '@type', '@id', 'name', 'text', 'url', 'inLanguage', 'about', 'acceptedAnswer',
      'author', 'isPartOf', 'keywords', 'additionalProperty',
    ]));
  });

  const compactProcedures = procedureNodes.map((node) => pick(node, [
    '@type', '@id', 'name', 'alternateName', 'url', 'description', 'procedureType',
    'bodyLocation', 'keywords', 'inLanguage', 'additionalProperty',
  ])).map((node) => ({ ...node, isPartOf: ref(pageId), subjectOf: ref(articleId) }));

  const compactServices = serviceNodes.map((node) => pick(node, [
    '@type', '@id', 'name', 'alternateName', 'serviceType', 'category', 'description',
    'areaServed', 'url', 'availableChannel', 'additionalProperty',
  ])).map((node) => ({ ...node, provider: ref(clinicId), subjectOf: ref(articleId) }));

  const graph: Node[] = [
    person,
    clinic,
    website,
    page,
    article,
    reputation,
    priorityAnswerList,
    ...priorityNodes,
    credentialSource,
    logoSource,
    ...imageNodes,
    ...compactProcedures,
    ...compactServices,
  ].filter(Boolean);

  return { '@context': 'https://schema.org', '@graph': graph };
}
