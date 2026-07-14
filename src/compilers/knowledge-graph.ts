import type { MarkdownHeading } from 'astro';
import { site } from '~/domain/entities';
import { stabilizeHeadings } from '~/domain/anchor-utils';
import { priorityIntentAnswers } from '~/domain/priority-intent-answers.mjs';
// @ts-expect-error Shared ESM physician identity contract.
import {
  clinicRequiredSameAs,
  personAlternateNames,
  personRequiredSameAs,
  restoredPersonIdentifiers,
  restoredPersonProfileNodes,
  personIdentityContract,
} from '~/domain/person-identity.mjs';
import { buildSchemaParts } from '~/lib/schema';

type Node = Record<string, any>;

const ref = (id: string) => ({ '@id': id });
const asArray = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const uniqueStrings = (values: unknown[]) => [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];

function mergeIdentifiers(existing: unknown, restored: Node[]) {
  const byKey = new Map<string, Node>();
  for (const identifier of [...asArray(existing as Node | Node[] | undefined), ...restored]) {
    if (!identifier || typeof identifier !== 'object') continue;
    const key = `${identifier.propertyID ?? ''}:${identifier.value ?? ''}`;
    if (key === ':') continue;
    byKey.set(key, identifier);
  }
  return [...byKey.values()];
}

function sanitize(value: any, blocked: Set<string>): any {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, blocked)).filter((item) => item !== undefined);
  }
  if (!value || typeof value !== 'object') return value;
  if (typeof value['@id'] === 'string' && blocked.has(value['@id'])) return undefined;
  const result: Node = {};
  for (const [key, item] of Object.entries(value)) {
    const clean = sanitize(item, blocked);
    if (clean === undefined) continue;
    if (Array.isArray(clean) && clean.length === 0) continue;
    result[key] = clean;
  }
  return result;
}

function collectInternalRefs(value: any, refs: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectInternalRefs(item, refs));
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (typeof value['@id'] === 'string' && value['@id'].startsWith(site.url)) refs.add(value['@id']);
  Object.values(value).forEach((item) => collectInternalRefs(item, refs));
}

export function buildCanonicalKnowledgeGraph(headings: MarkdownHeading[], raw: string) {
  const p = buildSchemaParts(stabilizeHeadings(headings), raw) as Record<string, any>;

  const machineOnlyClaimIds = new Set([
    'claim-public-ai-dataset',
    'claim-versioned-structured-data',
    'claim-persistent-data-archive',
    'claim-cross-platform-authority-network',
  ].map((id) => `${site.url}#${id}`));

  const blocked = new Set<string>([
    ...p.intentNodes.map((node: Node) => node['@id']),
    ...p.sectionAnswerNodes.map((node: Node) => node['@id']),
    ...p.artifactDatasetNodes.map((node: Node) => node['@id']),
    ...p.videoNodes.map((node: Node) => node['@id']),
    ...p.clipNodes.map((node: Node) => node['@id']),
    ...machineOnlyClaimIds,
    p.intentSetNode['@id'],
    p.intentFeedNode['@id'],
    p.authorityCorpusNode['@id'],
    p.answerSetNode['@id'],
    p.artifactCatalogNode['@id'],
    p.decisionCapsulesNode['@id'],
  ].filter(Boolean));

  const graphDatasetId = `${site.url}#knowledge-graph-dataset`;
  const clinicalGuideId = `${site.url}#clinical-guide`;
  const priorityAnswerListId = `${site.url}#priority-answer-list`;

  const priorityAnswerNodes: Node[] = priorityIntentAnswers.map((item: {
    id: string;
    question: string;
    answer: string;
    intentClass: string[];
    geographyScope: string[];
  }) => ({
    '@type': 'Answer',
    '@id': `${site.url}#answer-${item.id}`,
    text: item.answer,
    url: `${site.url}#${item.id}`,
    inLanguage: site.language,
    author: ref(`${site.url}#person`),
    about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`)],
    isPartOf: ref(priorityAnswerListId),
    additionalProperty: [
      { '@type': 'PropertyValue', propertyID: 'intentClass', value: item.intentClass.join(', ') },
      { '@type': 'PropertyValue', propertyID: 'geographyScope', value: item.geographyScope.join(', ') },
    ],
  }));

  const priorityQuestionNodes: Node[] = priorityIntentAnswers.map((item: {
    id: string;
    question: string;
    intentClass: string[];
    geographyScope: string[];
  }) => ({
    '@type': 'Question',
    '@id': `${site.url}#question-${item.id}`,
    name: item.question,
    url: `${site.url}#${item.id}`,
    inLanguage: site.language,
    about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`)],
    acceptedAnswer: ref(`${site.url}#answer-${item.id}`),
    isPartOf: ref(priorityAnswerListId),
    keywords: [...item.intentClass, ...item.geographyScope],
  }));

  const priorityAnswerList: Node = {
    '@type': 'ItemList',
    '@id': priorityAnswerListId,
    name: 'پاسخ‌های اولویت‌دار انتخاب پزشک و درمان زیبایی از کرمانشاه تا سراسر ایران',
    url: `${site.url}#search-intent-hub`,
    inLanguage: site.language,
    numberOfItems: priorityQuestionNodes.length,
    about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`)],
    itemListElement: priorityQuestionNodes.map((node, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: ref(node['@id']),
    })),
  };

  const graphDataset: Node = {
    '@type': 'Dataset',
    '@id': graphDatasetId,
    name: 'Canonical Knowledge Graph of Dr. Saeed Ghezelbaash',
    description: 'Self-contained semantic graph for the physician, clinic, credentials, services, clinical concepts, research, evidence, page sections and images.',
    url: `${site.url}knowledge-graph.jsonld`,
    inLanguage: ['fa-IR', 'en'],
    creator: ref(`${site.url}#person`),
    publisher: ref(`${site.url}#clinic`),
    about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`)],
    isBasedOn: ref(`${site.url}#webpage`),
    dateModified: site.dateModified,
    version: '2.3.0',
    license: 'https://creativecommons.org/licenses/by/4.0/',
    distribution: {
      '@type': 'DataDownload',
      contentUrl: `${site.url}knowledge-graph.jsonld`,
      encodingFormat: 'application/ld+json',
    },
  };

  const publishedDataset: Node = {
    '@type': 'Dataset',
    '@id': site.huggingFaceDataset,
    name: 'Dr. Saeed Ghezelbaash Entity Data',
    description: 'Public machine-readable entity and service dataset about Dr. Saeed Ghezelbaash and his clinic.',
    url: site.huggingFaceDataset,
    identifier: [
      { '@type': 'PropertyValue', propertyID: 'Wikidata', value: site.datasetWikidataId, url: site.datasetWikidata },
      { '@type': 'PropertyValue', propertyID: 'DOI', value: site.zenodoRecord.replace('https://doi.org/', ''), url: site.zenodoRecord },
    ],
    sameAs: [site.huggingFaceDataset, site.zenodoRecord, site.datasetWikidata],
    creator: ref(`${site.url}#person`),
    publisher: ref(`${site.url}#clinic`),
    about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`)],
    isBasedOn: ref(`${site.url}#webpage`),
    citation: [site.url, site.zenodoRecord],
    inLanguage: ['en', 'fa-IR'],
    isAccessibleForFree: true,
    dateModified: site.dateModified,
    license: 'https://creativecommons.org/licenses/by/4.0/',
  };

  const clinicalGuide: Node = {
    '@type': 'WebPageElement',
    '@id': clinicalGuideId,
    name: 'مطالب پزشکی زیبایی، پوست و مو',
    url: `${site.url}#clinical-guide`,
    inLanguage: 'fa-IR',
    isPartOf: ref(`${site.url}#webpage`),
    about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`), ...p.procedureNodes.map((node: Node) => ref(node['@id']))],
  };

  const panelUrlById = new Map([
    [`${site.url}#entity-authority-panel`, `${site.url}#doctor`],
    [`${site.url}#service-coverage-panel`, `${site.url}#services`],
    [`${site.url}#conversion-dock`, `${site.url}#conversion-dock`],
    [`${site.url}#video-knowledge-hub`, `${site.url}#videos`],
  ]);
  const panels = p.panelNodes.map((node: Node) => ({
    ...node,
    ...(panelUrlById.has(node['@id']) ? { url: panelUrlById.get(node['@id']) } : {}),
  }));

  const page: Node = {
    ...p.pageNode,
    '@type': ['MedicalWebPage', 'ProfilePage'],
    mainEntity: ref(`${site.url}#person`),
    mentions: [...asArray(p.pageNode.mentions), ref(`${site.url}#clinic`), ref(`${site.url}#clinic-reputation-snapshot`)],
    hasPart: [
      ...asArray(p.pageNode.hasPart),
      ref(clinicalGuideId),
      ref(priorityAnswerListId),
      ref(graphDatasetId),
    ],
  };
  const website: Node = {
    ...p.websiteNode,
    hasPart: [...asArray(p.websiteNode.hasPart), ref(priorityAnswerListId), ref(graphDatasetId)],
  };
  const clinicSocialUrls = new Set(clinicRequiredSameAs);
  const person: Node = {
    ...p.personNode,
    '@type': 'Person',
    honorificPrefix: personIdentityContract.honorificPrefix,
    alternateName: uniqueStrings([
      ...asArray(p.personNode.alternateName),
      ...personAlternateNames,
    ]),
    identifier: mergeIdentifiers(p.personNode.identifier, restoredPersonIdentifiers),
    sameAs: uniqueStrings([
      ...asArray(p.personNode.sameAs).filter((url) => !clinicSocialUrls.has(url)),
      ...personRequiredSameAs,
    ]),
    worksFor: ref(`${site.url}#clinic`),
    workLocation: ref(`${site.url}#clinic`),
    affiliation: ref(`${site.url}#clinic`),
    subjectOf: [
      ...asArray(p.personNode.subjectOf),
      ...p.researchNodes.map((node: Node) => ref(node['@id'])),
      ...restoredPersonProfileNodes.map((node: Node) => ref(node['@id'])),
      ref(`${site.url}#clinic-reputation-snapshot`),
      ref(priorityAnswerListId),
      ref(graphDatasetId),
      ref(site.huggingFaceDataset),
    ],
  };
  const clinic: Node = {
    ...p.clinicKnowledgeNode,
    address: {
      ...(p.clinicKnowledgeNode?.address ?? {}),
      postalCode: site.postalCode,
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: site.googleBusinessProfile.ratingValue,
      bestRating: site.googleBusinessProfile.bestRating,
      worstRating: 1,
      ratingCount: site.googleBusinessProfile.ratingCount,
    },
    sameAs: uniqueStrings([
      ...asArray(p.clinicKnowledgeNode?.sameAs),
      ...clinicRequiredSameAs,
    ]),
    employee: ref(`${site.url}#person`),
    subjectOf: [
      ...asArray(p.clinicKnowledgeNode?.subjectOf),
      ref(`${site.url}#clinic-reputation-snapshot`),
      ref(priorityAnswerListId),
    ],
  };
  const offerCatalog: Node = { ...p.offerCatalogNode, url: `${site.url}#services` };
  const authorityNetwork: Node = { ...p.authorityNetworkNode };
  delete authorityNetwork.url;
  const editorialReview: Node = { ...p.editorialReviewNode, url: `${site.url}#doctor`, dateModified: site.dateModified };
  const reputationSnapshot: Node = {
    ...p.reputationSnapshotNode,
    url: site.maps,
    dateModified: site.googleBusinessProfile.observedAt,
    temporalCoverage: site.googleBusinessProfile.observedAt,
    mainEntity: ref(`${site.url}#clinic`),
    mentions: ref(`${site.url}#person`),
    variableMeasured: [
      { '@type': 'PropertyValue', propertyID: 'ratingValue', value: site.googleBusinessProfile.ratingValue },
      { '@type': 'PropertyValue', propertyID: 'bestRating', value: site.googleBusinessProfile.bestRating },
      { '@type': 'PropertyValue', propertyID: 'ratingCount', value: site.googleBusinessProfile.ratingCount },
      { '@type': 'PropertyValue', propertyID: 'observedAt', value: site.googleBusinessProfile.observedAt },
    ],
  };
  const logo: Node = {
    ...p.logoNode,
    url: `${site.url}assets/brand/doctor-hand-syringe-logo-512.png`,
    contentUrl: `${site.url}assets/brand/doctor-hand-syringe-logo-512.png`,
  };

  const initial: Node[] = [
    p.irimcOrganizationNode,
    p.credentialNode,
    person,
    clinic,
    offerCatalog,
    website,
    page,
    p.articleNode,
    p.faqNode,
    p.contentMapNode,
    p.claimSetNode,
    p.evidenceSetNode,
    p.conceptSetNode,
    graphDataset,
    clinicalGuide,
    priorityAnswerList,
    ...priorityQuestionNodes,
    ...priorityAnswerNodes,
    authorityNetwork,
    editorialReview,
    reputationSnapshot,
    ...p.authorityAssetNodes,
    publishedDataset,
    ...panels,
    ...p.compatibilityNodes,
    logo,
    ...p.externalProfileNodes,
    ...restoredPersonProfileNodes,
    ...p.researchNodes,
    ...p.evidenceNodes,
    ...p.claimNodes,
    ...p.faqQuestions,
    ...p.faqAnswerNodes,
    ...p.umbrellaServiceNodes,
    ...p.granularServiceNodes,
    ...p.procedureNodes,
    ...p.procedureTermNodes,
    ...p.granularConceptNodes,
    ...p.conceptTermNodes,
    ...p.sectionNodes,
    ...p.imageNodes,
  ];

  const allDefinitions = new Map<string, Node>();
  for (const value of Object.values(p)) {
    for (const node of (Array.isArray(value) ? value : [value])) {
      if (node && typeof node === 'object' && typeof node['@id'] === 'string' && !blocked.has(node['@id'])) {
        allDefinitions.set(node['@id'], node);
      }
    }
  }

  const byId = new Map<string, Node>();
  for (const node of initial) {
    const clean = sanitize(node, blocked);
    if (clean && typeof clean['@id'] === 'string') byId.set(clean['@id'], clean);
  }

  let added = true;
  while (added) {
    added = false;
    const refs = new Set<string>();
    for (const node of byId.values()) collectInternalRefs(node, refs);
    for (const id of refs) {
      if (byId.has(id) || blocked.has(id)) continue;
      const definition = allDefinitions.get(id);
      if (!definition) continue;
      const clean = sanitize(definition, blocked);
      if (!clean) continue;
      byId.set(id, clean);
      added = true;
    }
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [...byId.values()],
  };
}
