import type { MarkdownHeading } from 'astro';
import { site } from '~/domain/entities';
import { stabilizeHeadings } from '~/domain/anchor-utils';
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
    version: '2.2.0',
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
    hasPart: [
      ...(p.pageNode.hasPart ?? []),
      ref(clinicalGuideId),
      ref(graphDatasetId),
    ],
  };
  const website: Node = {
    ...p.websiteNode,
    hasPart: [...(p.websiteNode.hasPart ?? []), ref(graphDatasetId)],
  };
  const clinicSocialUrls = new Set(clinicRequiredSameAs);
  const person: Node = {
    ...p.personNode,
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
      ...(p.personNode.subjectOf ?? []),
      ...p.researchNodes.map((node: Node) => ref(node['@id'])),
      ...restoredPersonProfileNodes.map((node: Node) => ref(node['@id'])),
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
    sameAs: uniqueStrings([
      ...asArray(p.clinicKnowledgeNode?.sameAs),
      ...clinicRequiredSameAs,
    ]),
    employee: ref(`${site.url}#person`),
  };
  const offerCatalog: Node = { ...p.offerCatalogNode, url: `${site.url}#services` };
  const authorityNetwork: Node = { ...p.authorityNetworkNode };
  delete authorityNetwork.url;
  const editorialReview: Node = { ...p.editorialReviewNode, url: `${site.url}#doctor` };
  const reputationSnapshot: Node = { ...p.reputationSnapshotNode, url: site.maps };
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
    publishedDataset,
    clinicalGuide,
    authorityNetwork,
    editorialReview,
    reputationSnapshot,
    ...p.authorityAssetNodes,
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
