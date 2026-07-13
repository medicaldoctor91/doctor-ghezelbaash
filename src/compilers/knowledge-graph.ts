import type { MarkdownHeading } from 'astro';
import { site } from '~/domain/entities';
import { videos } from '~/domain/media.mjs';
import { stabilizeHeadings } from '~/domain/anchor-utils';
import {
  videoClipId,
  videoEntityId,
  videoMomentUrl,
  videoWatchUrl,
  videoWebPageId,
} from '~/domain/url-architecture.mjs';
// @ts-expect-error Shared ESM physician identity contract.
import {
  clinicRequiredSameAs,
  personAlternateNames,
  personRequiredSameAs,
  restoredPersonIdentifiers,
  restoredPersonProfileNodes,
  personIdentityContract,
} from '~/domain/person-identity.mjs';
import { readMediaChapters } from '~/lib/media';
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
    description: 'Self-contained semantic graph for the physician, clinic, credentials, services, clinical concepts, research, evidence, page sections, images and videos.',
    url: `${site.url}knowledge-graph.jsonld`,
    inLanguage: ['fa-IR', 'en'],
    creator: ref(`${site.url}#person`),
    publisher: ref(`${site.url}#clinic`),
    about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`)],
    isBasedOn: ref(`${site.url}#webpage`),
    dateModified: site.dateModified,
    version: '2.1.0',
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

  const clinicalGuide: Node = {
    '@type': 'WebPageElement',
    '@id': clinicalGuideId,
    name: 'مطالب پزشکی زیبایی، پوست و مو',
    url: `${site.url}#clinical-guide`,
    inLanguage: 'fa-IR',
    isPartOf: ref(`${site.url}#webpage`),
    about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`), ...p.procedureNodes.map((node: Node) => ref(node['@id']))],
  };

  const sourceVideos = new Map<string, Node>(p.videoNodes.map((node: Node) => [node['@id'], node]));
  const sourceClips = new Map<string, Node>(p.clipNodes.map((node: Node) => [node['@id'], node]));

  const canonicalClipNodes: Node[] = videos
    .filter((video: any) => video.durationSeconds >= 30)
    .flatMap((video: any) => readMediaChapters(video.chapterTrack).map((chapter) => {
      const id = videoClipId(site.url, video.id, chapter.index);
      const source = sourceClips.get(id) ?? {};
      const node: Node = {
        ...source,
        '@type': 'Clip',
        '@id': id,
        name: source.name ?? `${video.title}: ${chapter.name}`,
        startOffset: chapter.startOffset,
        endOffset: chapter.endOffset,
        url: videoMomentUrl(site.url, video.id, chapter.startOffset),
        isPartOf: ref(videoEntityId(site.url, video.id)),
      };
      delete node.partOf;
      return node;
    }));

  const canonicalVideoNodes: Node[] = videos.map((video: any) => {
    const id = videoEntityId(site.url, video.id);
    const source = sourceVideos.get(id) ?? {};
    const clips = canonicalClipNodes.filter((clip) => clip.isPartOf?.['@id'] === id);
    const node: Node = {
      ...source,
      '@type': 'VideoObject',
      '@id': id,
      name: video.title,
      description: video.description,
      url: videoWatchUrl(site.url, video.id),
      thumbnailUrl: [`${site.url}${video.thumbnail.replace(/^\//u, '')}`],
      uploadDate: video.uploadDate ?? site.dateModified,
      duration: video.duration,
      contentUrl: `${site.url}videos/${video.file}`,
      encodingFormat: 'video/mp4',
      width: video.width,
      height: video.height,
      inLanguage: site.language,
      keywords: video.tags,
      creator: ref(`${site.url}#person`),
      publisher: ref(`${site.url}#clinic`),
      about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`)],
      mainEntityOfPage: ref(videoWebPageId(site.url, video.id)),
      isPartOf: ref(videoWebPageId(site.url, video.id)),
      potentialAction: {
        '@type': 'SeekToAction',
        target: `${videoWatchUrl(site.url, video.id)}?t={seek_to_second_number}`,
        'startOffset-input': 'required name=seek_to_second_number',
      },
    };
    if (clips.length) node.hasPart = clips.map((clip) => ref(clip['@id']));
    else delete node.hasPart;
    return node;
  });

  const videoWatchPageNodes: Node[] = videos.map((video: any) => ({
    '@type': 'WebPage',
    '@id': videoWebPageId(site.url, video.id),
    url: videoWatchUrl(site.url, video.id),
    name: video.title,
    headline: video.title,
    description: video.description,
    inLanguage: site.language,
    isPartOf: ref(`${site.url}#website`),
    mainEntity: ref(videoEntityId(site.url, video.id)),
    about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`)],
    author: ref(`${site.url}#person`),
    reviewedBy: ref(`${site.url}#person`),
    publisher: ref(`${site.url}#clinic`),
    dateCreated: video.uploadDate ?? site.dateModified,
    datePublished: video.uploadDate ?? site.dateModified,
    dateModified: site.dateModified,
  }));

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
    hasPart: [
      ...(p.websiteNode.hasPart ?? []),
      ref(graphDatasetId),
      ...videoWatchPageNodes.map((node) => ref(node['@id'])),
    ],
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
      ...videoWatchPageNodes.map((node) => ref(node['@id'])),
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
    ...videoWatchPageNodes,
    ...canonicalVideoNodes,
    ...canonicalClipNodes,
  ];

  const allDefinitions = new Map<string, Node>();
  for (const value of Object.values(p)) {
    for (const node of (Array.isArray(value) ? value : [value])) {
      if (node && typeof node === 'object' && typeof node['@id'] === 'string' && !blocked.has(node['@id'])) {
        allDefinitions.set(node['@id'], node);
      }
    }
  }
  for (const node of [...videoWatchPageNodes, ...canonicalVideoNodes, ...canonicalClipNodes]) {
    allDefinitions.set(node['@id'], node);
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
