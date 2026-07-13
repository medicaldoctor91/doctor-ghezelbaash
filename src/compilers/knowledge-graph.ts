import type { MarkdownHeading } from 'astro';
import { site } from '~/domain/entities';
import { stabilizeHeadings } from '~/domain/anchor-utils';
import { buildSchemaParts } from '~/lib/schema';

type Node = Record<string, any>;

const ref = (id: string) => ({ '@id': id });

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
  const blocked = new Set<string>([
    ...p.intentNodes.map((node: Node) => node['@id']),
    ...p.sectionAnswerNodes.map((node: Node) => node['@id']),
    ...p.artifactDatasetNodes.map((node: Node) => node['@id']),
    p.intentSetNode['@id'],
    p.intentFeedNode['@id'],
    p.authorityCorpusNode['@id'],
    p.answerSetNode['@id'],
    p.artifactCatalogNode['@id'],
  ].filter(Boolean));

  const graphDatasetId = `${site.url}#knowledge-graph-dataset`;
  const retrievalDatasetId = `${site.url}#retrieval-corpus`;
  const knowledgeSectionId = `${site.url}#knowledge-resources`;

  const graphDataset: Node = {
    '@type': 'Dataset',
    '@id': graphDatasetId,
    name: 'Canonical Knowledge Graph of Dr. Saeed Ghezelbaash',
    description: 'Self-contained semantic graph for the physician, clinic, credentials, services, clinical concepts, research, evidence, page sections, images and videos.',
    url: `${site.url}knowledge-graph.jsonld`,
    inLanguage: ['fa-IR', 'en'],
    creator: ref(`${site.url}#person`),
    publisher: ref(`${site.url}#clinic`),
    about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`)],
    isBasedOn: ref(`${site.url}#webpage`),
    dateModified: site.dateModified,
    version: '1.0.0',
    license: 'https://creativecommons.org/licenses/by/4.0/',
    distribution: {
      '@type': 'DataDownload',
      contentUrl: `${site.url}knowledge-graph.jsonld`,
      encodingFormat: 'application/ld+json',
    },
  };

  const retrievalDataset: Node = {
    '@type': 'Dataset',
    '@id': retrievalDatasetId,
    name: 'Retrieval Corpus of Dr. Saeed Ghezelbaash',
    description: 'Search, answer, intent, evidence and provenance records derived from the canonical visible page and kept separate from the semantic knowledge graph.',
    url: `${site.url}search/index.json`,
    inLanguage: ['fa-IR', 'en'],
    creator: ref(`${site.url}#person`),
    publisher: ref(`${site.url}#clinic`),
    about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`)],
    isBasedOn: ref(`${site.url}#webpage`),
    dateModified: site.dateModified,
    distribution: [
      { '@type': 'DataDownload', contentUrl: `${site.url}search/index.json`, encodingFormat: 'application/json' },
      { '@type': 'DataDownload', contentUrl: `${site.url}answers/index.json`, encodingFormat: 'application/json' },
      { '@type': 'DataDownload', contentUrl: `${site.url}intents/index.json`, encodingFormat: 'application/json' },
      { '@type': 'DataDownload', contentUrl: `${site.url}evidence/sources.json`, encodingFormat: 'application/json' },
      { '@type': 'DataDownload', contentUrl: `${site.url}evidence/internal-provenance.json`, encodingFormat: 'application/json' },
      { '@type': 'DataDownload', contentUrl: `${site.url}media/index.json`, encodingFormat: 'application/json' },
    ],
  };

  const publishedDataset: Node = {
    '@type': 'Dataset',
    '@id': site.huggingFaceDataset,
    name: 'Dr. Saeed Ghezelbaash Entity Data',
    description: 'Published entity, clinic, service, evidence and authority dataset with persistent external identifiers.',
    url: site.huggingFaceDataset,
    identifier: [
      { '@type': 'PropertyValue', propertyID: 'Wikidata', value: site.datasetWikidataId, url: site.datasetWikidata },
      { '@type': 'PropertyValue', propertyID: 'DOI', value: site.zenodoRecord.replace('https://doi.org/', ''), url: site.zenodoRecord },
    ],
    sameAs: [site.huggingFaceDataset, site.zenodoRecord, site.datasetWikidata],
    creator: ref(`${site.url}#person`),
    publisher: ref(`${site.url}#clinic`),
    about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`)],
    inLanguage: ['en', 'fa-IR'],
    isAccessibleForFree: true,
    dateModified: site.dateModified,
  };

  const knowledgeSection: Node = {
    '@type': 'WebPageElement',
    '@id': knowledgeSectionId,
    name: 'Knowledge graph, entity identifiers and AI retrieval resources',
    url: `${site.url}#knowledge-resources`,
    inLanguage: ['fa-IR', 'en'],
    isPartOf: ref(`${site.url}#webpage`),
    about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`), ref(graphDatasetId), ref(retrievalDatasetId)],
    hasPart: [ref(graphDatasetId), ref(retrievalDatasetId), ref(site.huggingFaceDataset)],
  };

  const page: Node = {
    ...p.pageNode,
    mainEntity: ref(`${site.url}#person`),
    hasPart: [...(p.pageNode.hasPart ?? []), ref(knowledgeSectionId), ref(graphDatasetId), ref(retrievalDatasetId)],
  };
  const website: Node = {
    ...p.websiteNode,
    hasPart: [...(p.websiteNode.hasPart ?? []), ref(graphDatasetId), ref(retrievalDatasetId)],
  };
  const person: Node = {
    ...p.personNode,
    subjectOf: [
      ...(p.personNode.subjectOf ?? []),
      ...p.researchNodes.map((node: Node) => ref(node['@id'])),
      ref(graphDatasetId),
      ref(site.huggingFaceDataset),
    ],
  };

  const initial: Node[] = [
    p.irimcOrganizationNode,
    p.credentialNode,
    person,
    p.clinicKnowledgeNode,
    p.offerCatalogNode,
    website,
    page,
    p.articleNode,
    p.faqNode,
    p.contentMapNode,
    p.claimSetNode,
    p.evidenceSetNode,
    p.conceptSetNode,
    p.decisionCapsulesNode,
    graphDataset,
    retrievalDataset,
    publishedDataset,
    knowledgeSection,
    p.authorityNetworkNode,
    p.editorialReviewNode,
    p.reputationSnapshotNode,
    ...p.authorityAssetNodes,
    ...p.panelNodes,
    ...p.compatibilityNodes,
    p.logoNode,
    ...p.externalProfileNodes,
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
    ...p.videoNodes,
    ...p.clipNodes,
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
