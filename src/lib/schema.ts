import type { MarkdownHeading } from 'astro';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { site } from '../data/site';
// @ts-expect-error Shared ESM national authority data.
import { authorityNetwork, editorialReview, nationalAuthoritySignals } from '../data/national-authority.mjs';
// @ts-expect-error Shared ESM product data.
import { procedures, topicGroups } from '../data/knowledge.mjs';
// @ts-expect-error Shared ESM media data.
import { galleryImages, videos } from '../data/media.mjs';
// @ts-expect-error Shared ESM authority and intent data.
import { allAuthorityClaims, buildIntentRegistry, evidenceSources, granularConcepts } from '../data/authority.mjs';
// @ts-expect-error Shared canonical URL registry.
import { videoClipId, videoEntityId, videoHubPageId, videoWatchUrl, videoWebPageId } from '../domain/url-architecture.mjs';
import { readMediaChapters } from './media';
import {
  buildProcedureAnchorMap,
  buildSearchChunks,
  extractCitationRecords,
  extractFaqEntries,
} from './content';

type JsonNode = Record<string, unknown> & { '@id'?: string; '@type'?: string | string[] };

const ids = {
  person: `${site.url}#person`,
  clinic: `${site.url}#clinic`,
  website: `${site.url}#website`,
  page: `${site.url}#webpage`,
  article: `${site.url}#article`,
  faq: `${site.url}#faq`,
  contentMap: `${site.url}#content-map`,
  intentSet: `${site.url}#intent-set`,
  claimSet: `${site.url}#claim-set`,
  evidenceSet: `${site.url}#evidence-set`,
  conceptSet: `${site.url}#concept-set`,
  decisionCapsules: `${site.url}#decision-capsules`,
  answerSet: `${site.url}#answer-registry`,
  credential: `${site.url}#credential-irimc-${site.irimc}`,
  irimcOrganization: 'https://membersearch.irimc.org/#organization',
  offerCatalog: `${site.url}#offered-services`,
  logo: `${site.url}#logo`,
  artifactCatalog: `${site.url}#knowledge-artifact-catalog`,
  intentFeed: `${site.url}#search-intent-data-feed`,
  authorityCorpus: `${site.url}#national-aesthetic-authority-corpus`,
  authorityNetwork: `${site.url}#external-authority-network`,
  editorialReview: `${site.url}#medical-editorial-review`,
  reputationSnapshot: `${site.url}#clinic-reputation-snapshot`,
};

function unique<T>(values: T[]) {
  return [...new Set(values.filter(Boolean))];
}

function plainText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/[|*_`>#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstSubstantiveAnswer(markdown: string) {
  const body = markdown.split(/\r?\n/).slice(1).join('\n').trim();
  const block = body.split(/\n\s*\n/).find((item) => item.trim() && !/^[-|#]/.test(item.trim())) ?? body;
  return plainText(block);
}

function imageUrl(image: { base: string; width: number }) {
  const width = image.width >= 1200 ? 1200 : image.width;
  return `${site.url}images/responsive/${image.base}-${width}.jpg`;
}

const procedureId = (id: string) => `${site.url}#procedure-${id}`;
const procedureTermId = (id: string) => `${site.url}#term-procedure-${id}`;
const serviceId = (id: string) => `${site.url}#service-${id}`;
const conceptId = (id: string) => `${site.url}#concept-${id}`;
const conceptTermId = (id: string) => `${site.url}#term-concept-${id}`;
const conceptServiceId = (id: string) => `${site.url}#concept-service-${id}`;
const intentId = (id: string) => `${site.url}#${id}`;
const claimId = (id: string) => `${site.url}#${id}`;
const evidenceId = (id: string) => `${site.url}#${id}`;
const sectionId = (id: string) => `${site.url}#section-${id}`;

function publicFileSize(relativePath: string) {
  try {
    return statSync(join(process.cwd(), 'public', relativePath.replace(/^\//, ''))).size;
  } catch {
    return undefined;
  }
}

export function buildSchemaParts(headings: MarkdownHeading[], raw: string) {
  const h2Headings = headings.filter((heading) => heading.depth === 2);
  const procedureAnchorMap = buildProcedureAnchorMap(headings);
  const chunks = buildSearchChunks(raw, headings);
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const intents = buildIntentRegistry(site.url);

  const procedureNodes: JsonNode[] = procedures.map((procedure: {
    id: string;
    name: string;
    alternateNames?: string[];
    modality: string;
    relationship: string;
    schemaProcedureType?: string | null;
    bodyLocation?: string;
    serviceCategory?: string;
    scopeNote?: string;
    keywords: string[];
  }) => ({
    '@type': procedure.modality === 'surgical' ? 'SurgicalProcedure' : 'MedicalProcedure',
    '@id': procedureId(procedure.id),
    name: procedure.name,
    ...(procedure.alternateNames?.length ? { alternateName: procedure.alternateNames } : {}),
    url: `${site.url}${procedureAnchorMap[procedure.id] ?? '#top'}`,
    ...(procedure.schemaProcedureType ? { procedureType: `https://schema.org/${procedure.schemaProcedureType}` } : {}),
    ...(procedure.bodyLocation ? { bodyLocation: procedure.bodyLocation } : {}),
    ...(procedure.scopeNote ? { description: procedure.scopeNote } : {}),
    keywords: procedure.keywords,
    inLanguage: site.language,
    isPartOf: { '@id': ids.page },
    subjectOf: { '@id': ids.article },
    additionalProperty: [
      { '@type': 'PropertyValue', propertyID: 'coverageRelationship', name: 'رابطهٔ این روش با کلینیک', value: procedure.relationship },
      { '@type': 'PropertyValue', propertyID: 'modality', name: 'ماهیت روش', value: procedure.modality },
      ...(procedure.serviceCategory ? [{ '@type': 'PropertyValue', propertyID: 'serviceCategory', name: 'دستهٔ خدمت', value: procedure.serviceCategory }] : []),
    ],
  }));

  const procedureTermNodes: JsonNode[] = procedures.map((procedure: {
    id: string;
    name: string;
    alternateNames?: string[];
    modality: string;
    relationship: string;
    keywords: string[];
    scopeNote?: string;
  }) => ({
    '@type': 'DefinedTerm',
    '@id': procedureTermId(procedure.id),
    name: procedure.name,
    ...(procedure.alternateNames?.length ? { alternateName: procedure.alternateNames } : {}),
    termCode: procedure.id,
    description: procedure.scopeNote,
    url: `${site.url}${procedureAnchorMap[procedure.id] ?? '#top'}`,
    inDefinedTermSet: { '@id': ids.conceptSet },
    isRelatedTo: { '@id': procedureId(procedure.id) },
    about: [
      { '@id': ids.person },
      { '@id': ids.clinic },
      { '@id': procedureId(procedure.id) },
    ],
    keywords: procedure.keywords,
    additionalProperty: [
      { '@type': 'PropertyValue', propertyID: 'coverageRelationship', value: procedure.relationship },
      { '@type': 'PropertyValue', propertyID: 'modality', value: procedure.modality },
      { '@type': 'PropertyValue', propertyID: 'clinicalProcedure', value: procedureId(procedure.id) },
    ],
  }));

  const umbrellaServiceNodes: JsonNode[] = procedures
    .filter((procedure: { relationship: string }) => procedure.relationship === 'offered')
    .map((procedure: {
      id: string;
      name: string;
      alternateNames?: string[];
      relationship: string;
      modality: string;
      serviceCategory?: string;
      scopeNote?: string;
      bodyLocation?: string;
    }) => ({
      '@type': 'Service',
      '@id': serviceId(procedure.id),
      name: procedure.name,
      ...(procedure.alternateNames?.length ? { alternateName: procedure.alternateNames } : {}),
      serviceType: procedure.serviceCategory ?? procedure.name,
      category: procedure.modality,
      description: procedure.scopeNote,
      provider: { '@id': ids.clinic },
      areaServed: [
        { '@type': 'City', name: site.city },
        { '@type': 'Country', name: 'ایران', identifier: site.countryCode },
      ],
      url: `${site.url}${procedureAnchorMap[procedure.id] ?? '#top'}`,
      subjectOf: { '@id': ids.article },
      availableChannel: {
        '@type': 'ServiceChannel',
        serviceUrl: `${site.url}${procedureAnchorMap[procedure.id] ?? '#top'}`,
        servicePhone: { '@type': 'ContactPoint', telephone: site.phone, contactType: 'هماهنگی مراجعه' },
        availableLanguage: ['fa'],
      },
      additionalProperty: [
        { '@type': 'PropertyValue', propertyID: 'clinicalConcept', name: 'مفهوم یا روش پزشکی مرتبط', value: procedureId(procedure.id) },
        { '@type': 'PropertyValue', propertyID: 'coverageRelationship', name: 'نوع رابطه با کلینیک', value: procedure.relationship },
        ...(procedure.bodyLocation ? [{ '@type': 'PropertyValue', propertyID: 'bodyLocation', name: 'ناحیهٔ مرتبط', value: procedure.bodyLocation }] : []),
      ],
    }));

  const granularConceptNodes: JsonNode[] = granularConcepts.map((concept: {
    id: string;
    name: string;
    parentProcedureId: string;
    relationship: string;
    modality: string;
    keywords: string[];
    sourceIds: string[];
    doctorRole?: string;
    clinicRole?: string;
    authorityContribution?: string;
    geographyScope?: string[];
    claimId?: string;
  }) => ({
    '@type': concept.modality === 'surgical' ? 'SurgicalProcedure' : 'MedicalProcedure',
    '@id': conceptId(concept.id),
    name: concept.name,
    url: `${site.url}${procedureAnchorMap[concept.parentProcedureId] ?? '#top'}`,
    inLanguage: site.language,
    keywords: concept.keywords,
    isPartOf: { '@id': ids.page },
    subjectOf: [{ '@id': ids.article }, ...concept.sourceIds.map((id) => ({ '@id': evidenceId(id) }))],
    isRelatedTo: { '@id': procedureId(concept.parentProcedureId) },
    mainEntityOfPage: { '@id': ids.page },
    additionalProperty: [
      { '@type': 'PropertyValue', propertyID: 'parentProcedureId', value: concept.parentProcedureId },
      { '@type': 'PropertyValue', propertyID: 'coverageRelationship', value: concept.relationship },
      { '@type': 'PropertyValue', propertyID: 'modality', value: concept.modality },
      ...(concept.doctorRole ? [{ '@type': 'PropertyValue', propertyID: 'doctorRole', value: concept.doctorRole }] : []),
      ...(concept.clinicRole ? [{ '@type': 'PropertyValue', propertyID: 'clinicRole', value: concept.clinicRole }] : []),
      ...(concept.authorityContribution ? [{ '@type': 'PropertyValue', propertyID: 'authorityContribution', value: concept.authorityContribution }] : []),
      ...(concept.geographyScope?.length ? [{ '@type': 'PropertyValue', propertyID: 'geographyScope', value: concept.geographyScope.join(', ') }] : []),
      ...(concept.claimId ? [{ '@type': 'PropertyValue', propertyID: 'claimId', value: claimId(concept.claimId) }] : []),
    ],
  }));

  const conceptTermNodes: JsonNode[] = granularConcepts.map((concept: {
    id: string;
    name: string;
    parentProcedureId: string;
    relationship: string;
    modality: string;
    keywords: string[];
    sourceIds: string[];
    doctorRole?: string;
    clinicRole?: string;
    authorityContribution?: string;
    geographyScope?: string[];
    claimId?: string;
  }) => ({
    '@type': 'DefinedTerm',
    '@id': conceptTermId(concept.id),
    name: concept.name,
    termCode: concept.id,
    url: `${site.url}${procedureAnchorMap[concept.parentProcedureId] ?? '#top'}`,
    inDefinedTermSet: { '@id': ids.conceptSet },
    isRelatedTo: [
      { '@id': conceptId(concept.id) },
      { '@id': procedureId(concept.parentProcedureId) },
    ],
    about: [
      { '@id': ids.person },
      { '@id': ids.clinic },
      { '@id': conceptId(concept.id) },
      { '@id': procedureId(concept.parentProcedureId) },
    ],
    keywords: concept.keywords,
    subjectOf: concept.sourceIds.map((id) => ({ '@id': evidenceId(id) })),
    additionalProperty: [
      { '@type': 'PropertyValue', propertyID: 'coverageRelationship', value: concept.relationship },
      { '@type': 'PropertyValue', propertyID: 'modality', value: concept.modality },
      { '@type': 'PropertyValue', propertyID: 'clinicalConcept', value: conceptId(concept.id) },
      ...(concept.doctorRole ? [{ '@type': 'PropertyValue', propertyID: 'doctorRole', value: concept.doctorRole }] : []),
      ...(concept.authorityContribution ? [{ '@type': 'PropertyValue', propertyID: 'authorityContribution', value: concept.authorityContribution }] : []),
      ...(concept.geographyScope?.length ? [{ '@type': 'PropertyValue', propertyID: 'geographyScope', value: concept.geographyScope.join(', ') }] : []),
      ...(concept.claimId ? [{ '@type': 'PropertyValue', propertyID: 'claimId', value: claimId(concept.claimId) }] : []),
    ],
  }));

  const granularServiceNodes: JsonNode[] = granularConcepts
    .filter((concept: { relationship: string }) => concept.relationship === 'offered')
    .map((concept: { id: string; name: string; parentProcedureId: string; modality: string; keywords: string[]; sourceIds: string[] }) => ({
      '@type': 'Service',
      '@id': conceptServiceId(concept.id),
      name: concept.name,
      serviceType: concept.name,
      category: concept.modality,
      provider: { '@id': ids.clinic },
      areaServed: [
        { '@type': 'City', name: site.city },
        { '@type': 'AdministrativeArea', name: site.region },
        { '@type': 'Country', name: 'ایران', identifier: site.countryCode },
      ],
      url: `${site.url}${procedureAnchorMap[concept.parentProcedureId] ?? '#top'}`,
      subjectOf: [{ '@id': ids.article }, ...concept.sourceIds.map((id) => ({ '@id': evidenceId(id) }))],
      isRelatedTo: { '@id': conceptId(concept.id) },
      keywords: concept.keywords,
      availableChannel: {
        '@type': 'ServiceChannel',
        serviceUrl: `${site.url}${procedureAnchorMap[concept.parentProcedureId] ?? '#top'}`,
        servicePhone: { '@type': 'ContactPoint', telephone: site.phone, contactType: 'هماهنگی مراجعه' },
        availableLanguage: ['fa'],
      },
      additionalProperty: [
        { '@type': 'PropertyValue', propertyID: 'clinicalConcept', value: conceptId(concept.id) },
        { '@type': 'PropertyValue', propertyID: 'coverageRelationship', value: 'offered' },
      ],
    }));

  const evidenceNodes: JsonNode[] = evidenceSources.map((source: {
    id: string;
    name: string;
    url: string;
    sourceType: string;
    evidenceTier: number;
    ownerEntityId: string;
    supports: string[];
    observedAt?: string;
    timeSensitive?: boolean;
    conceptId?: string;
    parentProcedureId?: string;
    relationship?: string;
    modality?: string;
  }) => ({
    '@type': 'WebPage',
    '@id': evidenceId(source.id),
    url: source.url,
    name: source.name,
    inLanguage: source.url.includes('ghezelbaash.ir') ? site.language : undefined,
    about: { '@id': source.ownerEntityId === 'clinic' ? ids.clinic : ids.person },
    ...(source.observedAt ? { dateModified: source.observedAt } : {}),
    additionalProperty: [
      { '@type': 'PropertyValue', propertyID: 'sourceType', value: source.sourceType },
      { '@type': 'PropertyValue', propertyID: 'evidenceTier', value: source.evidenceTier },
      { '@type': 'PropertyValue', propertyID: 'supports', value: source.supports.join(', ') },
      ...(source.timeSensitive ? [{ '@type': 'PropertyValue', propertyID: 'timeSensitive', value: true }] : []),
    ],
  }));

  const claimNodes: JsonNode[] = allAuthorityClaims.map((claim: {
    id: string;
    subject: string;
    predicate: string;
    value: unknown;
    label: string;
    evidenceIds: string[];
    confidence: string;
    statement?: string;
    timeSensitive?: boolean;
    conceptId?: string;
    parentProcedureId?: string;
    relationship?: string;
    modality?: string;
  }) => ({
    '@type': 'Claim',
    '@id': claimId(claim.id),
    name: claim.label,
    text: claim.statement ?? (typeof claim.value === 'string' ? claim.value : JSON.stringify(claim.value)),
    author: { '@id': claim.subject === 'clinic' ? ids.clinic : ids.person },
    about: [
      { '@id': claim.subject === 'clinic' ? ids.clinic : ids.person },
      ...(claim.conceptId ? [{ '@id': conceptId(claim.conceptId) }] : []),
      ...(claim.parentProcedureId ? [{ '@id': procedureId(claim.parentProcedureId) }] : []),
    ],
    appearance: claim.evidenceIds.map((id) => ({ '@id': evidenceId(id) })),
    citation: claim.evidenceIds
      .map((id) => evidenceSources.find((source: { id: string }) => source.id === id)?.url)
      .filter(Boolean),
    additionalProperty: [
      { '@type': 'PropertyValue', propertyID: 'predicate', value: claim.predicate },
      { '@type': 'PropertyValue', propertyID: 'confidence', value: claim.confidence },
      ...(claim.relationship ? [{ '@type': 'PropertyValue', propertyID: 'coverageRelationship', value: claim.relationship }] : []),
      ...(claim.modality ? [{ '@type': 'PropertyValue', propertyID: 'modality', value: claim.modality }] : []),
      ...(claim.timeSensitive ? [{ '@type': 'PropertyValue', propertyID: 'timeSensitive', value: true }] : []),
      ...('doctorRole' in claim && claim.doctorRole ? [{ '@type': 'PropertyValue', propertyID: 'doctorRole', value: claim.doctorRole }] : []),
      ...('clinicRole' in claim && claim.clinicRole ? [{ '@type': 'PropertyValue', propertyID: 'clinicRole', value: claim.clinicRole }] : []),
      ...('authorityContribution' in claim && claim.authorityContribution ? [{ '@type': 'PropertyValue', propertyID: 'authorityContribution', value: claim.authorityContribution }] : []),
    ],
  }));

  const intentNodes: JsonNode[] = intents.map((intent: {
    id: string;
    queryText: string;
    queryVariants: string[];
    conceptId: string;
    parentProcedureId: string;
    relationship: string;
    modality: string;
    dimension: string;
    label: string;
    intentClass: string;
    decisionStage: string;
    authorityContribution: string;
    doctorRole: string;
    clinicRole: string;
    locality: string;
    geographyScope: string;
    brandFocus: boolean;
    registryStatus: string;
    sourceMethod: string;
    claimId: string;
    evidenceIds: string[];
    targetEntityIds: string[];
  }) => {
    const primaryChunk = chunks.find((chunk) => chunk.primaryIntentIds.includes(intent.id));
    const supportingChunk = chunks.find((chunk) => chunk.secondaryIntentIds.includes(intent.id));
    const conceptChunk = chunks.find((chunk) => chunk.conceptIds.includes(intent.conceptId));
    const bestChunk = primaryChunk ?? supportingChunk ?? conceptChunk;
    const coverageStatus = primaryChunk ? 'directly-covered' : supportingChunk ? 'supporting-covered' : conceptChunk ? 'concept-covered' : 'coverage-target';
    const answerEntityId = bestChunk?.depth === 2
      ? `${site.url}#direct-answer-${bestChunk.id}`
      : bestChunk?.answerRole === 'question-answer'
        ? `${site.url}#answer-${bestChunk.id}`
        : undefined;
    return {
      '@type': 'DefinedTerm',
      '@id': intentId(intent.id),
      additionalType: `${site.url}ontology/SearchIntent`,
      name: intent.label,
      alternateName: intent.queryVariants,
      description: `Search Intent فارسی برای ${intent.label}؛ متصل به انتیتی دکتر سعید قزلباش، کلینیک، مفهوم بالینی، Claim، پاسخ و شواهد مرتبط.`,
      termCode: intent.id,
      url: bestChunk?.url ?? site.url,
      inDefinedTermSet: { '@id': ids.intentSet },
      isPartOf: { '@id': ids.intentFeed },
      about: intent.targetEntityIds.map((id) => ({ '@id': id })),
      keywords: [intent.dimension, intent.intentClass, intent.relationship, intent.modality, intent.locality, intent.geographyScope, ...intent.queryVariants],
      subjectOf: intent.evidenceIds.map((id) => ({ '@id': evidenceId(id) })),
      isBasedOn: intent.evidenceIds.map((id) => ({ '@id': evidenceId(id) })),
      mainEntity: { '@id': claimId(intent.claimId) },
      ...(bestChunk ? { mainEntityOfPage: { '@id': sectionId(bestChunk.id) } } : {}),
      isRelatedTo: [
        { '@id': claimId(intent.claimId) },
        { '@id': conceptId(intent.conceptId) },
        { '@id': procedureId(intent.parentProcedureId) },
        ...(bestChunk ? [{ '@id': sectionId(bestChunk.id) }] : []),
        ...(answerEntityId ? [{ '@id': answerEntityId }] : []),
      ],
      additionalProperty: [
        { '@type': 'PropertyValue', propertyID: 'queryText', value: intent.queryText },
        { '@type': 'PropertyValue', propertyID: 'queryVariants', value: intent.queryVariants.join(' | ') },
        { '@type': 'PropertyValue', propertyID: 'intentDimension', value: intent.dimension },
        { '@type': 'PropertyValue', propertyID: 'intentClass', value: intent.intentClass },
        { '@type': 'PropertyValue', propertyID: 'decisionStage', value: intent.decisionStage },
        { '@type': 'PropertyValue', propertyID: 'coverageRelationship', value: intent.relationship },
        { '@type': 'PropertyValue', propertyID: 'modality', value: intent.modality },
        { '@type': 'PropertyValue', propertyID: 'geographyScope', value: intent.geographyScope },
        { '@type': 'PropertyValue', propertyID: 'locality', value: intent.locality },
        { '@type': 'PropertyValue', propertyID: 'brandFocus', value: intent.brandFocus },
        { '@type': 'PropertyValue', propertyID: 'coverageStatus', value: coverageStatus },
        ...(bestChunk ? [{ '@type': 'PropertyValue', propertyID: 'canonicalAnswerUrl', value: bestChunk.url }] : []),
        ...(answerEntityId ? [{ '@type': 'PropertyValue', propertyID: 'answerEntityId', value: answerEntityId }] : []),
        { '@type': 'PropertyValue', propertyID: 'doctorRole', value: intent.doctorRole },
        { '@type': 'PropertyValue', propertyID: 'clinicRole', value: intent.clinicRole },
        { '@type': 'PropertyValue', propertyID: 'authorityContribution', value: intent.authorityContribution },
        { '@type': 'PropertyValue', propertyID: 'sourceMethod', value: intent.sourceMethod },
        { '@type': 'PropertyValue', propertyID: 'registryStatus', value: intent.registryStatus },
        { '@type': 'PropertyValue', propertyID: 'claimId', value: claimId(intent.claimId) },
      ],
    };
  });

  const sectionNodes: JsonNode[] = headings.map((heading, position) => {
    const chunk = chunkById.get(heading.slug);
    return {
      '@type': 'WebPageElement',
      '@id': sectionId(heading.slug),
      name: heading.text,
      url: `${site.url}#${heading.slug}`,
      position: position + 1,
      isPartOf: { '@id': ids.page },
      about: [
        { '@id': ids.person },
        { '@id': ids.clinic },
        ...(chunk?.procedureIds ?? []).map((id) => ({ '@id': procedureId(id) })),
        ...(chunk?.conceptIds ?? []).map((id) => ({ '@id': conceptId(id) })),
      ],
      mentions: [
        ...(chunk?.claimIds ?? []).map((id) => ({ '@id': claimId(id) })),
        ...(chunk?.primaryIntentIds ?? chunk?.intentIds ?? []).map((id) => ({ '@id': intentId(id) })),
      ],
      isBasedOn: (chunk?.evidenceIds ?? []).map((id) => ({ '@id': evidenceId(id) })),
      keywords: unique([...(chunk?.intents ?? []), ...(chunk?.modalities ?? []), chunk?.group.id ?? '']),
      additionalProperty: [
        { '@type': 'PropertyValue', propertyID: 'headingDepth', value: heading.depth },
        ...(chunk ? [
          { '@type': 'PropertyValue', propertyID: 'sourceStartLine', value: chunk.sourceSpan.startLine },
          { '@type': 'PropertyValue', propertyID: 'sourceEndLine', value: chunk.sourceSpan.endLine },
          { '@type': 'PropertyValue', propertyID: 'contentSha256', value: chunk.contentHash.digest },
          { '@type': 'PropertyValue', propertyID: 'medicalSafetyClass', value: chunk.medicalSafetyClass },
          { '@type': 'PropertyValue', propertyID: 'matchedIntentCount', value: chunk.intentCoverage.totalMatched },
          { '@type': 'PropertyValue', propertyID: 'primaryIntentCount', value: chunk.intentCoverage.primaryCount },
          { '@type': 'PropertyValue', propertyID: 'authorityScore', value: chunk.intentCoverage.authorityScore },
          { '@type': 'PropertyValue', propertyID: 'doctorAuthoritySignals', value: chunk.doctorAuthoritySignals.join(', ') },
        ] : []),
      ],
    };
  });

  const faqEntries = extractFaqEntries(raw, headings);
  const faqAnswerNodes: JsonNode[] = faqEntries.map((entry) => ({
    '@type': 'Answer',
    '@id': `${site.url}#answer-${entry.id}`,
    text: entry.directAnswer || entry.answer,
    url: entry.url,
    author: { '@id': ids.person },
    about: [
      { '@id': ids.person },
      { '@id': ids.clinic },
      ...entry.procedureIds.map((id) => ({ '@id': procedureId(id) })),
      ...entry.conceptIds.map((id) => ({ '@id': conceptId(id) })),
    ],
    mentions: entry.claimIds.map((id) => ({ '@id': claimId(id) })),
    isBasedOn: entry.evidenceIds.map((id) => ({ '@id': evidenceId(id) })),
    citation: entry.citationIds,
    additionalProperty: [
      { '@type': 'PropertyValue', propertyID: 'sourceStartLine', value: entry.sourceSpan.startLine },
      { '@type': 'PropertyValue', propertyID: 'sourceEndLine', value: entry.sourceSpan.endLine },
      { '@type': 'PropertyValue', propertyID: 'contentSha256', value: entry.contentHash.digest },
      { '@type': 'PropertyValue', propertyID: 'medicalSafetyClass', value: entry.medicalSafetyClass },
    ],
    isPartOf: { '@id': ids.answerSet },
  }));
  const faqQuestions: JsonNode[] = faqEntries.map((entry) => ({
    '@type': 'Question',
    '@id': `${site.url}#question-${entry.id}`,
    name: entry.question,
    url: entry.url,
    about: [
      { '@id': ids.person },
      { '@id': ids.clinic },
      ...entry.procedureIds.map((id) => ({ '@id': procedureId(id) })),
      ...entry.conceptIds.map((id) => ({ '@id': conceptId(id) })),
    ],
    mentions: entry.claimIds.map((id) => ({ '@id': claimId(id) })),
    isBasedOn: entry.evidenceIds.map((id) => ({ '@id': evidenceId(id) })),
    acceptedAnswer: { '@id': `${site.url}#answer-${entry.id}` },
    isPartOf: { '@id': ids.faq },
  }));
  const sectionAnswerNodes: JsonNode[] = chunks
    .filter((chunk) => chunk.depth === 2)
    .map((chunk) => ({
      '@type': 'Answer',
      '@id': `${site.url}#direct-answer-${chunk.id}`,
      text: firstSubstantiveAnswer(chunk.markdown),
      url: chunk.url,
      author: { '@id': ids.person },
      about: [
        { '@id': ids.person },
        { '@id': ids.clinic },
        ...chunk.procedureIds.map((id) => ({ '@id': procedureId(id) })),
        ...chunk.conceptIds.map((id) => ({ '@id': conceptId(id) })),
      ],
      citation: chunk.externalSources,
      isBasedOn: chunk.evidenceIds.map((id) => ({ '@id': evidenceId(id) })),
      isPartOf: { '@id': ids.answerSet },
      additionalProperty: [
        { '@type': 'PropertyValue', propertyID: 'sourceStartLine', value: chunk.sourceSpan.startLine },
        { '@type': 'PropertyValue', propertyID: 'sourceEndLine', value: chunk.sourceSpan.endLine },
        { '@type': 'PropertyValue', propertyID: 'contentSha256', value: chunk.contentHash.digest },
        { '@type': 'PropertyValue', propertyID: 'medicalSafetyClass', value: chunk.medicalSafetyClass },
      ],
    }));


  const imageNodes: JsonNode[] = galleryImages.map((image: {
    id: string;
    alt: string;
    caption: string;
    base: string;
    width: number;
    height: number;
  }) => {
    const renderedWidth = image.width >= 1200 ? 1200 : image.width;
    const renderedHeight = Math.round(image.height * renderedWidth / image.width);
    const publicPath = `/images/responsive/${image.base}-${renderedWidth}.jpg`;
    const size = publicFileSize(publicPath);
    return {
      '@type': 'ImageObject',
      '@id': `${site.url}#image-${image.id}`,
      contentUrl: imageUrl(image),
      url: imageUrl(image),
      encodingFormat: 'image/jpeg',
      ...(size ? { contentSize: `${size} bytes` } : {}),
      caption: image.caption,
      name: image.alt,
      width: renderedWidth,
      height: renderedHeight,
      representativeOfPage: image.id === 'doctor-portrait',
      creator: { '@id': ids.person },
      copyrightHolder: { '@id': ids.person },
      creditText: site.name,
    };
  });

  const videoNodes: JsonNode[] = videos.map((video: {
    id: string;
    title: string;
    description: string;
    thumbnail: string;
    uploadDate?: string;
    duration: string;
    file: string;
    width: number;
    height: number;
    tags: string[];
    relatedHeadingIncludes: string;
    chapterTrack?: string;
  }) => {
    const heading = headings.find((item) => item.text.includes(video.relatedHeadingIncludes));
    const chunk = heading ? chunkById.get(heading.slug) : undefined;
    const chapters = readMediaChapters(video.chapterTrack);
    const size = publicFileSize(`/videos/${video.file}`);
    return {
      '@type': 'VideoObject',
      '@id': videoEntityId(site.url, video.id),
      name: video.title,
      description: video.description,
      url: videoWatchUrl(site.url, video.id),
      thumbnailUrl: [`${site.url}${video.thumbnail.slice(1)}`],
      ...(video.uploadDate ? { uploadDate: video.uploadDate } : {}),
      duration: video.duration,
      contentUrl: `${site.url}videos/${video.file}`,
      encodingFormat: 'video/mp4',
      width: video.width,
      height: video.height,
      ...(size ? { contentSize: `${size} bytes` } : {}),
      inLanguage: site.language,
      keywords: video.tags,
      isFamilyFriendly: true,
      creator: { '@id': ids.person },
      publisher: { '@id': ids.clinic },
      about: [
        { '@id': ids.person },
        { '@id': ids.clinic },
        ...(chunk?.procedureIds ?? []).map((id) => ({ '@id': procedureId(id) })),
        ...(chunk?.conceptIds ?? []).map((id) => ({ '@id': conceptId(id) })),
      ],
      ...(chapters.length ? { hasPart: chapters.map((chapter) => ({ '@id': videoClipId(site.url, video.id, chapter.index) })) } : {}),
      isPartOf: { '@id': videoHubPageId(site.url) },
      mainEntityOfPage: { '@id': videoWebPageId(site.url, video.id) },
    };
  });

  const clipNodes: JsonNode[] = videos.flatMap((video: {
    id: string; title: string; file: string; chapterTrack?: string; relatedHeadingIncludes: string;
  }) => {
    const heading = headings.find((item) => item.text.includes(video.relatedHeadingIncludes));
    const chunk = heading ? chunkById.get(heading.slug) : undefined;
    return readMediaChapters(video.chapterTrack).map((chapter) => ({
      '@type': 'Clip',
      '@id': videoClipId(site.url, video.id, chapter.index),
      name: `${video.title}: ${chapter.name}`,
      startOffset: chapter.startOffset,
      endOffset: chapter.endOffset,
      url: `${videoWatchUrl(site.url, video.id)}#t=${chapter.startOffset}`,
      contentUrl: `${site.url}videos/${video.file}#t=${chapter.startOffset},${chapter.endOffset}`,
      encodingFormat: 'video/mp4',
      partOf: { '@id': videoEntityId(site.url, video.id) },
      about: [
        { '@id': ids.person },
        { '@id': ids.clinic },
        ...(chunk?.procedureIds ?? []).map((id) => ({ '@id': procedureId(id) })),
        ...(chunk?.conceptIds ?? []).map((id) => ({ '@id': conceptId(id) })),
      ],
      inLanguage: site.language,
    }));
  });

  const citationRecords = extractCitationRecords(raw, headings);
  const citations = citationRecords.map((record) => record.url);
  const keywords = unique([
    site.name,
    site.legalName,
    'پزشک زیبایی کرمانشاه',
    'بهترین دکتر زیبایی کرمانشاه',
    'پوست و مو',
    ...procedures.map((procedure: { name: string }) => procedure.name),
    ...granularConcepts.map((concept: { name: string }) => concept.name),
    ...topicGroups.map((group: { label: string }) => group.label),
  ]);

  const externalProfileNodes: JsonNode[] = site.externalProfiles.map((profile) => ({
    '@type': 'ProfilePage',
    '@id': profile.url,
    url: profile.url,
    name: profile.name,
    about: { '@id': ids.person },
    publisher: { '@type': 'Organization', name: profile.publisher },
    additionalProperty: [
      { '@type': 'PropertyValue', propertyID: 'evidenceType', value: profile.evidenceType },
      { '@type': 'PropertyValue', propertyID: 'evidenceTier', value: profile.evidenceTier },
    ],
  }));


  const authorityAssetNodes: JsonNode[] = [
    {
      '@type': 'WebPage',
      '@id': site.doctorWikidata,
      url: site.doctorWikidata,
      name: 'رکورد Wikidata دکتر سعید قزلباش',
      about: { '@id': ids.person },
      publisher: { '@type': 'Organization', name: 'Wikidata' },
      isPartOf: { '@id': ids.authorityNetwork },
    },
    {
      '@type': 'WebPage',
      '@id': site.placeWikidata,
      url: site.placeWikidata,
      name: 'رکورد Wikidata کلینیک زیبایی دکتر سعید قزلباش',
      about: { '@id': ids.clinic },
      publisher: { '@type': 'Organization', name: 'Wikidata' },
      isPartOf: { '@id': ids.authorityNetwork },
    },
    {
      '@type': 'WebPage',
      '@id': site.maps,
      url: site.maps,
      name: 'پروفایل مکانی Google Maps کلینیک زیبایی دکتر سعید قزلباش',
      about: { '@id': ids.clinic },
      mainEntity: { '@id': ids.clinic },
      isPartOf: { '@id': ids.authorityNetwork },
    },
    {
      '@type': 'CollectionPage',
      '@id': site.ncbiBibliography,
      url: site.ncbiBibliography,
      name: 'کتاب‌شناسی عمومی پژوهش‌های دکتر سعید قزلباش در NCBI',
      about: { '@id': ids.person },
      isPartOf: { '@id': ids.authorityNetwork },
    },
    {
      '@type': 'Dataset',
      '@id': site.huggingFaceDataset,
      url: site.huggingFaceDataset,
      name: 'Dr. Saeed Ghezelbaash Entity Data',
      description: 'دیتاست عمومی AI-readable برای حل انتیتی، خدمات، لوکیشن و داده‌های ساختاریافتهٔ دکتر سعید قزلباش و کلینیک.',
      creator: { '@id': ids.person },
      publisher: { '@type': 'Organization', name: 'Hugging Face' },
      about: [{ '@id': ids.person }, { '@id': ids.clinic }],
      isBasedOn: { '@id': ids.page },
      includedInDataCatalog: { '@id': ids.artifactCatalog },
      isPartOf: { '@id': ids.authorityNetwork },
      inLanguage: site.language,
    },
    {
      '@type': 'SoftwareSourceCode',
      '@id': site.githubRepository,
      url: site.githubRepository,
      codeRepository: site.githubRepository,
      name: 'مخزن عمومی داده‌های ساختاریافتهٔ دکتر سعید قزلباش',
      description: 'مخزن نسخه‌پذیر برای داده‌های انتیتی و دارایی‌های ساختاریافتهٔ پزشک و کلینیک.',
      creator: { '@id': ids.person },
      about: [{ '@id': ids.person }, { '@id': ids.clinic }],
      isBasedOn: { '@id': ids.page },
      isPartOf: { '@id': ids.authorityNetwork },
      programmingLanguage: ['JSON-LD', 'JSON', 'Astro'],
    },
    {
      '@type': 'Dataset',
      '@id': site.zenodoRecord,
      url: site.zenodoRecord,
      name: 'آرشیو DOI داده‌های انتیتی دکتر سعید قزلباش',
      description: 'لایهٔ آرشیو و استناد پایدار برای دارایی‌های داده‌ای پزشک و کلینیک.',
      identifier: { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.5281/zenodo.18765169', url: site.zenodoRecord },
      creator: { '@id': ids.person },
      about: [{ '@id': ids.person }, { '@id': ids.clinic }],
      isBasedOn: { '@id': site.githubRepository },
      isPartOf: { '@id': ids.authorityNetwork },
    },
    {
      '@type': 'ProfilePage',
      '@id': site.githubProfile,
      url: site.githubProfile,
      name: 'پروفایل GitHub دکتر سعید قزلباش',
      about: { '@id': ids.person },
      isPartOf: { '@id': ids.authorityNetwork },
    },
    {
      '@type': 'ProfilePage',
      '@id': site.xProfile,
      url: site.xProfile,
      name: 'پروفایل X دکتر سعید قزلباش',
      about: { '@id': ids.person },
      isPartOf: { '@id': ids.authorityNetwork },
    },
  ];

  const authorityNetworkNode: JsonNode = {
    '@type': 'CollectionPage',
    '@id': ids.authorityNetwork,
    url: `${site.url}authority-network.json`,
    name: 'شبکهٔ عمومی اتوریتی دکتر سعید قزلباش و کلینیک',
    description: 'شبکهٔ قابل‌ردیابی منابع رسمی، پژوهشی، مکانی، گراف دانش، AI، داده و پروفایل‌های بیرونی که به دو انتیتی canonical پزشک و کلینیک متصل‌اند.',
    inLanguage: site.language,
    creator: { '@id': ids.person },
    publisher: { '@id': ids.clinic },
    about: [{ '@id': ids.person }, { '@id': ids.clinic }],
    hasPart: authorityNetwork.map((item: { url: string }) => ({ '@id': item.url })),
    isPartOf: [{ '@id': ids.website }, { '@id': ids.authorityCorpus }],
    dateModified: site.dateModified,
  };

  const editorialReviewNode: JsonNode = {
    '@type': 'CreativeWork',
    '@id': ids.editorialReview,
    url: `${site.url}editorial-review.json`,
    name: 'رکورد بازبینی پزشکی و مسئولیت محتوایی صفحهٔ دکتر سعید قزلباش',
    description: editorialReview.responsibility,
    datePublished: editorialReview.datePublished,
    dateModified: editorialReview.dateModified,
    creator: { '@id': ids.person },
    author: { '@id': ids.person },
    reviewedBy: { '@id': ids.person },
    about: [{ '@id': ids.page }, { '@id': ids.article }, { '@id': ids.person }, { '@id': ids.clinic }],
    isPartOf: [{ '@id': ids.website }, { '@id': ids.authorityCorpus }],
    additionalProperty: editorialReview.reviewScope.map((scope: string, index: number) => ({
      '@type': 'PropertyValue',
      propertyID: `reviewScope-${index + 1}`,
      name: 'دامنهٔ بازبینی',
      value: scope,
    })),
  };

  const reputationSnapshotNode: JsonNode = {
    '@type': 'Dataset',
    '@id': ids.reputationSnapshot,
    url: `${site.url}reputation.json`,
    name: 'Snapshot اعتبار عمومی و مکانی کلینیک زیبایی دکتر سعید قزلباش',
    description: 'رکورد تاریخ‌دار امتیاز عمومی Google Maps، تعداد ارزیابی‌ها، مکان، تماس و اتصال آن به انتیتی پزشک.',
    dateModified: site.googleBusinessProfile.observedAt,
    temporalCoverage: site.googleBusinessProfile.observedAt,
    creator: { '@id': ids.person },
    publisher: { '@id': ids.clinic },
    about: [{ '@id': ids.clinic }, { '@id': ids.person }],
    isBasedOn: site.googleBusinessProfile.sourceUrl,
    isPartOf: [{ '@id': ids.website }, { '@id': ids.authorityCorpus }],
    variableMeasured: [
      { '@type': 'PropertyValue', propertyID: 'ratingValue', value: nationalAuthoritySignals.local.googleRatingSnapshot.ratingValue },
      { '@type': 'PropertyValue', propertyID: 'bestRating', value: nationalAuthoritySignals.local.googleRatingSnapshot.bestRating },
      { '@type': 'PropertyValue', propertyID: 'ratingCount', value: nationalAuthoritySignals.local.googleRatingSnapshot.ratingCount },
      { '@type': 'PropertyValue', propertyID: 'observedAt', value: nationalAuthoritySignals.local.googleRatingSnapshot.observedAt },
    ],
  };

  const researchNodes: JsonNode[] = site.researchProfiles.map((research) => ({
    '@type': 'ScholarlyArticle',
    '@id': research.doiUrl,
    name: research.name,
    headline: research.name,
    url: research.url,
    sameAs: unique([
      research.url,
      research.doiUrl,
      ...('alternateUrl' in research ? [research.alternateUrl] : []),
      ...('fullTextUrl' in research ? [research.fullTextUrl] : []),
    ]),
    inLanguage: 'en',
    datePublished: research.datePublished,
    identifier: [
      { '@type': 'PropertyValue', propertyID: 'DOI', value: research.doi, url: research.doiUrl },
      { '@type': 'PropertyValue', propertyID: 'PMID', value: research.pmid, url: research.url },
      ...('pmcid' in research ? [{ '@type': 'PropertyValue', propertyID: 'PMCID', value: research.pmcid, url: research.fullTextUrl }] : []),
    ],
    author: { '@id': ids.person },
    mainEntityOfPage: { '@type': 'WebPage', '@id': research.url },
    isPartOf: { '@type': 'Periodical', name: research.journal },
    publisher: { '@type': 'Organization', name: research.publisher },
    isAccessibleForFree: Boolean('fullTextUrl' in research || 'alternateUrl' in research),
  }));

  const irimcOrganizationNode: JsonNode = {
    '@type': 'Organization',
    '@id': ids.irimcOrganization,
    name: 'سازمان نظام پزشکی جمهوری اسلامی ایران',
    url: 'https://membersearch.irimc.org/',
  };

  const credentialNode: JsonNode = {
    '@type': 'EducationalOccupationalCredential',
    '@id': ids.credential,
    name: 'دکترای حرفه‌ای پزشکی و ثبت نظام پزشکی',
    credentialCategory: 'دکترای حرفه‌ای پزشکی',
    recognizedBy: { '@id': ids.irimcOrganization },
    identifier: { '@type': 'PropertyValue', propertyID: 'IRIMC', value: site.irimc, url: site.irimcVerification },
    url: site.irimcVerification,
  };

  const offeredUmbrellaProcedures = procedures.filter((procedure: { relationship: string }) => procedure.relationship === 'offered');
  const offeredGranularConcepts = granularConcepts.filter((concept: { relationship: string }) => concept.relationship === 'offered');
  const allProcedureRefs = procedures.map((procedure: { id: string }) => ({ '@id': procedureId(procedure.id) }));
  const allConceptRefs = granularConcepts.map((concept: { id: string }) => ({ '@id': conceptId(concept.id) }));
  const allProcedureTermRefs = procedures.map((procedure: { id: string }) => ({ '@id': procedureTermId(procedure.id) }));
  const allConceptTermRefs = granularConcepts.map((concept: { id: string }) => ({ '@id': conceptTermId(concept.id) }));
  const allIntentRefs = intents.map((intent: { id: string }) => ({ '@id': intentId(intent.id) }));
  const offeredProcedureRefs = offeredUmbrellaProcedures.map((procedure: { id: string }) => ({ '@id': procedureId(procedure.id) }));
  const offeredConceptRefs = offeredGranularConcepts.map((concept: { id: string }) => ({ '@id': conceptId(concept.id) }));
  const offeredServiceRefs = [
    ...umbrellaServiceNodes.map((node) => ({ '@id': node['@id'] })),
    ...granularServiceNodes.map((node) => ({ '@id': node['@id'] })),
  ];

  const offerCatalogNode: JsonNode = {
    '@type': 'OfferCatalog',
    '@id': ids.offerCatalog,
    name: 'خدمات و مسیرهای درمانی ارائه‌شده در کلینیک',
    url: `${site.url}#coverage-matrix-title`,
    numberOfItems: offeredServiceRefs.length,
    itemListElement: offeredServiceRefs.map((serviceRef, index) => ({
      '@type': 'Offer',
      position: index + 1,
      itemOffered: serviceRef,
      offeredBy: { '@id': ids.clinic },
    })),
  };

  const personNode: JsonNode = {
    '@type': ['Person', 'IndividualPhysician'],
    '@id': ids.person,
    name: site.legalName,
    givenName: site.givenName,
    familyName: site.familyName,
    alternateName: [site.name, site.latinName, site.instagramHandle],
    url: site.url,
    image: { '@id': `${site.url}#image-doctor-portrait` },
    jobTitle: 'پزشک، پژوهشگر و مدرس پزشکی زیبایی',
    occupationalCategory: 'پزشک دارای دکترای حرفه‌ای پزشکی',
    hasOccupation: [
      {
        '@type': 'Occupation',
        name: 'پزشک',
        occupationalCategory: 'پزشک دارای دکترای حرفه‌ای پزشکی',
      },
      {
        '@type': 'Occupation',
        name: 'پژوهشگر پزشکی',
        description: 'مشارکت در پژوهش‌های بالینی و روان‌پزشکی با آثار قابل‌ردیابی از طریق DOI، PMID، PubMed و ORCID.',
      },
      {
        '@type': 'Occupation',
        name: 'مدرس پزشکی زیبایی',
        description: 'آموزش پزشکان با تمرکز بر آناتومی، انتخاب بیمار، تصمیم‌گیری پیش از تکنیک و مرز ارجاع.',
      },
    ],
    description: 'پزشک دارای دکترای حرفه‌ای پزشکی با تمرکز بر پزشکی زیبایی، پوست و مو و تصمیم‌گیری تشخیصی پیش از مداخله.',
    disambiguatingDescription: `دکتر محمدسعید قزلباش با شماره نظام پزشکی ${site.irimc} و محل فعالیت در کرمانشاه؛ شناخته‌شده با نام حرفه‌ای دکتر سعید قزلباش.`,
    telephone: site.phone,
    knowsLanguage: ['fa'],
    identifier: [
      { '@type': 'PropertyValue', propertyID: 'IRIMC', value: site.irimc, url: site.irimcVerification },
      { '@type': 'PropertyValue', propertyID: 'ORCID', value: site.orcid, url: site.orcidUrl },
      { '@type': 'PropertyValue', propertyID: 'Instagram', value: site.instagramHandle, url: site.instagram },
      { '@type': 'PropertyValue', propertyID: 'Wikidata', value: site.doctorWikidataId, url: site.doctorWikidata },
    ],
    hasCredential: { '@id': ids.credential },
    memberOf: { '@id': ids.irimcOrganization },
    sameAs: unique([site.irimcVerification, site.orcidUrl, site.instagram, site.doctorWikidata, site.huggingFaceProfile, site.githubProfile, site.linkedinProfile, site.aboutMeProfile, site.linktreeProfile, site.xProfile]),
    practicesAt: { '@id': ids.clinic },
    workLocation: { '@id': ids.clinic },
    worksFor: { '@id': ids.clinic },
    affiliation: { '@id': ids.clinic },
    knowsAbout: [...allProcedureRefs, ...allConceptRefs, ...allProcedureTermRefs, ...allConceptTermRefs, { '@id': ids.intentSet }],
    mainEntityOfPage: { '@id': ids.page },
    potentialAction: [
      { '@type': 'CommunicateAction', name: 'تماس با کلینیک دکتر سعید قزلباش', target: `tel:${site.phone}` },
      { '@type': 'CommunicateAction', name: 'مشاوره مستقیم با پزشک', target: site.instagramDirect },
      { '@type': 'ViewAction', name: 'دیدن نمونه‌کارها در Reels اینستاگرام', target: site.instagramReels },
      { '@type': 'FollowAction', name: 'دنبال‌کردن صفحه رسمی دکتر سعید قزلباش', target: site.instagram },
      { '@type': 'ViewAction', name: 'بررسی هویت در سازمان نظام پزشکی', target: site.irimcVerification },
    ],
    subjectOf: [
      { '@id': ids.article },
      ...externalProfileNodes.map((node) => ({ '@id': node['@id'] })),
      ...authorityAssetNodes.map((node) => ({ '@id': node['@id'] })),
      { '@id': ids.authorityNetwork },
      { '@id': ids.editorialReview },
      { '@id': ids.reputationSnapshot },
      ...claimNodes.map((node) => ({ '@id': node['@id'] })),
      { '@id': site.ncbiBibliography },
      { '@id': site.zenodoRecord },
      { '@id': site.githubRepository },
      { '@id': ids.authorityCorpus },
      { '@id': ids.intentFeed },
    ],
  };

  const clinicNode: JsonNode = {
    '@type': ['MedicalClinic', 'LocalBusiness'],
    '@id': ids.clinic,
    name: site.clinicName,
    url: site.url,
    logo: { '@id': ids.logo },
    telephone: site.phone,
    image: imageNodes.map((image) => ({ '@id': image['@id'] })),
    address: {
      '@type': 'PostalAddress',
      streetAddress: site.streetAddress,
      addressLocality: site.city,
      addressRegion: site.region,
      addressCountry: site.countryCode,
    },
    geo: { '@type': 'GeoCoordinates', latitude: site.latitude, longitude: site.longitude },
    hasMap: [site.maps, site.mapsSearch, site.openStreetMap],
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'],
      opens: '16:00',
      closes: '22:00',
    }],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'هماهنگی مراجعه',
      telephone: site.phone,
      availableLanguage: ['fa'],
      areaServed: { '@type': 'Country', name: 'ایران', identifier: site.countryCode },
    },
    areaServed: [
      { '@type': 'City', name: site.city },
      { '@type': 'AdministrativeArea', name: site.region },
      { '@type': 'Country', name: 'ایران', identifier: site.countryCode },
    ],
    identifier: [
      { '@type': 'PropertyValue', propertyID: 'GooglePlaceID', value: site.googlePlaceId, url: site.mapsSearch },
      { '@type': 'PropertyValue', propertyID: 'GoogleCID', value: site.googleCid, url: site.maps },
      { '@type': 'PropertyValue', propertyID: 'Wikidata', value: site.placeWikidataId, url: site.placeWikidata },
      { '@type': 'PropertyValue', propertyID: 'OpenStreetMapNode', value: site.openStreetMapNode, url: site.openStreetMap },
    ],
    sameAs: [site.maps, site.mapsSearch, site.openStreetMap, site.placeWikidata, site.instagram],
    employee: { '@id': ids.person },
    availableService: [...offeredProcedureRefs, ...offeredConceptRefs],
    hasOfferCatalog: { '@id': ids.offerCatalog },
    subjectOf: [{ '@id': ids.reputationSnapshot }, { '@id': ids.authorityNetwork }, { '@id': ids.editorialReview }],
    potentialAction: [
      { '@type': 'CommunicateAction', name: 'تماس برای هماهنگی مراجعه', target: `tel:${site.phone}` },
      { '@type': 'CommunicateAction', name: 'مشاوره مستقیم با پزشک در اینستاگرام', target: site.instagramDirect },
      { '@type': 'ViewAction', name: 'دیدن نمونه‌کارها در Reels اینستاگرام', target: site.instagramReels },
      { '@type': 'ViewAction', name: 'مسیریابی کلینیک در Google Maps', target: site.maps },
      { '@type': 'FollowAction', name: 'مشاهده اینستاگرام رسمی پزشک و کلینیک', target: site.instagram },
    ],
  };

  const clinicKnowledgeNode: JsonNode = {
    ...clinicNode,
    additionalProperty: [
      { '@type': 'PropertyValue', propertyID: 'googleMapsRatingSnapshot', name: 'میانگین امتیاز Google Maps در تاریخ ثبت‌شده', value: site.googleBusinessProfile.ratingValue, url: site.googleBusinessProfile.sourceUrl },
      { '@type': 'PropertyValue', propertyID: 'googleMapsRatingCountSnapshot', name: 'تعداد امتیازهای Google Maps در تاریخ ثبت‌شده', value: site.googleBusinessProfile.ratingCount, url: site.googleBusinessProfile.sourceUrl },
      { '@type': 'PropertyValue', propertyID: 'googleMapsSnapshotObservedAt', name: 'تاریخ ثبت snapshot عمومی Google Maps', value: site.googleBusinessProfile.observedAt },
      { '@type': 'PropertyValue', propertyID: 'sourceTruthObservedAt', name: 'تاریخ تطبیق با سایت زنده رسمی', value: site.sourceTruthObservedAt },
    ],
  };

  const websiteNode: JsonNode = {
    '@type': 'WebSite',
    '@id': ids.website,
    url: site.url,
    name: site.title,
    alternateName: [site.clinicName, site.name],
    inLanguage: site.language,
    publisher: { '@id': ids.clinic },
    creator: { '@id': ids.person },
    about: [{ '@id': ids.person }, { '@id': ids.clinic }, ...allProcedureRefs, ...allConceptRefs],
    hasPart: [
      { '@id': ids.page },
      { '@id': ids.intentSet },
      { '@id': ids.claimSet },
      { '@id': ids.evidenceSet },
      { '@id': ids.conceptSet },
      { '@id': ids.decisionCapsules },
      { '@id': ids.answerSet },
      { '@id': ids.artifactCatalog },
      { '@id': ids.authorityCorpus },
      { '@id': ids.authorityNetwork },
      { '@id': ids.editorialReview },
      { '@id': ids.reputationSnapshot },
      { '@id': ids.intentFeed },
    ],
  };

  const pageNode: JsonNode = {
    '@type': 'MedicalWebPage',
    '@id': ids.page,
    url: site.url,
    name: site.title,
    headline: site.articleHeadline,
    description: site.description,
    inLanguage: site.language,
    isPartOf: { '@id': ids.website },
    mainEntity: [{ '@id': ids.person }, { '@id': ids.clinic }],
    primaryImageOfPage: { '@id': `${site.url}#image-doctor-portrait` },
    about: [{ '@id': ids.person }, { '@id': ids.clinic }, ...allProcedureRefs, ...allConceptRefs],
    author: { '@id': ids.person },
    reviewedBy: { '@id': ids.person },
    lastReviewed: site.dateModified,
    dateCreated: site.datePublished,
    datePublished: site.datePublished,
    dateModified: site.dateModified,
    significantLink: [site.instagram],
    isAccessibleForFree: true,
    medicalAudience: { '@type': 'MedicalAudience', audienceType: 'بیماران، متقاضیان درمان‌های زیبایی و پزشکان علاقه‌مند به تصمیم‌گیری بالینی' },
    hasPart: [
      { '@id': ids.article },
      { '@id': ids.faq },
      { '@id': ids.contentMap },
      { '@id': ids.intentSet },
      { '@id': ids.claimSet },
      { '@id': ids.evidenceSet },
      { '@id': ids.conceptSet },
      { '@id': ids.decisionCapsules },
      { '@id': ids.answerSet },
      { '@id': ids.authorityCorpus },
      { '@id': ids.authorityNetwork },
      { '@id': ids.editorialReview },
      { '@id': ids.reputationSnapshot },
      { '@id': ids.intentFeed },
      { '@id': `${site.url}#entity-authority-panel` },
      { '@id': `${site.url}#national-authority-layer` },
      { '@id': `${site.url}#service-coverage-panel` },
      { '@id': `${site.url}#video-knowledge-hub` },
      { '@id': `${site.url}#conversion-dock` },
      ...sectionNodes.map((section) => ({ '@id': section['@id'] })),
      ...videoNodes.map((video) => ({ '@id': video['@id'] })),
    ],
  };

  const articleNode: JsonNode = {
    '@type': 'Article',
    '@id': ids.article,
    headline: site.articleHeadline,
    description: site.description,
    inLanguage: site.language,
    dateModified: site.dateModified,
    datePublished: site.datePublished,
    author: { '@id': ids.person },
    reviewedBy: { '@id': ids.person },
    publisher: { '@id': ids.clinic },
    mainEntityOfPage: { '@id': ids.page },
    about: [{ '@id': ids.person }, { '@id': ids.clinic }, ...allProcedureRefs, ...allConceptRefs],
    mentions: [
      ...claimNodes.map((node) => ({ '@id': node['@id'] })),
      ...researchNodes.map((node) => ({ '@id': node['@id'] })),
    ],
    image: imageNodes.slice(0, 3).map((image) => ({ '@id': image['@id'] })),
    articleSection: h2Headings.map((heading) => heading.text),
    wordCount: plainText(raw).split(/\s+/).filter(Boolean).length,
    keywords,
    citation: citations,
    isAccessibleForFree: true,
    copyrightHolder: { '@id': ids.person },
    subjectOf: [{ '@id': ids.editorialReview }, { '@id': ids.authorityNetwork }],
  };

  const faqNode: JsonNode = {
    '@type': 'FAQPage',
    '@id': ids.faq,
    url: site.url,
    name: 'پرسش‌های تصمیم‌ساز درباره درمان‌های زیبایی',
    isPartOf: { '@id': ids.page },
    about: [{ '@id': ids.person }, { '@id': ids.clinic }, ...allProcedureRefs, ...allConceptRefs],
    mainEntity: faqQuestions.map((question) => ({ '@id': question['@id'] })),
  };

  const answerSetNode: JsonNode = {
    '@type': 'CollectionPage',
    '@id': ids.answerSet,
    url: `${site.url}answers.json`,
    name: 'رجیستری پاسخ‌های مستقیم و پرسش‌وپاسخ پزشکی زیبایی',
    description: 'پاسخ‌های عیناً مشتق‌شده از متن visible با URL، source span، hash، انتیتی و شواهد مرتبط.',
    mainEntity: [
      ...sectionAnswerNodes.map((answer) => ({ '@id': answer['@id'] })),
      ...faqQuestions.map((question) => ({ '@id': question['@id'] })),
      ...faqAnswerNodes.map((answer) => ({ '@id': answer['@id'] })),
    ],
    about: [{ '@id': ids.person }, { '@id': ids.clinic }, ...allProcedureRefs, ...allConceptRefs],
    isPartOf: { '@id': ids.website },
  };

  const contentMapNode: JsonNode = {
    '@type': 'ItemList',
    '@id': ids.contentMap,
    name: 'نقشهٔ کامل محتوای راهنمای جامع پزشکی زیبایی',
    numberOfItems: headings.length,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    itemListElement: headings.map((heading, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: heading.text,
      url: `${site.url}#${heading.slug}`,
      item: { '@id': sectionId(heading.slug) },
    })),
  };

  const intentSetNode: JsonNode = {
    '@type': 'DefinedTermSet',
    '@id': ids.intentSet,
    name: 'نقشهٔ Search Intentهای پزشکی زیبایی دکتر سعید قزلباش',
    description: 'پوشش حداکثری جست‌وجوهای اطلاعاتی، تشخیصی، محلی، ملی، مقایسه‌ای، ایمنی، کاندیداتوری، قیمت، نقاهت، ماندگاری، پرونده پیچیده و مرز جراحی برای خدمات و موضوعات مرتبط.',
    hasDefinedTerm: intentNodes.map((node) => ({ '@id': node['@id'] })),
    about: [{ '@id': ids.person }, { '@id': ids.clinic }, ...allProcedureRefs, ...allConceptRefs],
    isPartOf: { '@id': ids.authorityCorpus },
  };

  const intentFeedNode: JsonNode = {
    '@type': 'DataFeed',
    '@id': ids.intentFeed,
    name: 'فید Search Intentهای محلی و ملی پزشکی زیبایی دکتر سعید قزلباش',
    description: 'فید ساختاریافتهٔ Intentها با اتصال به پزشک، کلینیک، مفهوم بالینی، مرحله تصمیم، Claim، Evidence و دامنه جغرافیایی.',
    url: `${site.url}intents.json`,
    inLanguage: site.language,
    creator: { '@id': ids.person },
    publisher: { '@id': ids.clinic },
    about: [{ '@id': ids.person }, { '@id': ids.clinic }, ...allProcedureRefs, ...allConceptRefs],
    dataFeedElement: allIntentRefs,
    isPartOf: { '@id': ids.authorityCorpus },
    dateModified: site.dateModified,
  };

  const authorityCorpusNode: JsonNode = {
    '@type': 'Dataset',
    '@id': ids.authorityCorpus,
    name: 'پیکرهٔ ملی دانش و تصمیم پزشکی زیبایی دکتر سعید قزلباش',
    description: 'پیکرهٔ عمومی و ماشین‌خوان متصل به صفحه canonical شامل انتیتی پزشک و کلینیک، خدمات، جراحی‌های مرتبط، Search Intentها، Claimها، Evidenceها، پاسخ‌ها و رسانه‌ها.',
    url: `${site.url}knowledge-manifest.json`,
    inLanguage: site.language,
    creator: { '@id': ids.person },
    publisher: { '@id': ids.clinic },
    about: [{ '@id': ids.person }, { '@id': ids.clinic }, ...allProcedureRefs, ...allConceptRefs],
    hasPart: [
      { '@id': ids.intentSet },
      { '@id': ids.intentFeed },
      { '@id': ids.claimSet },
      { '@id': ids.evidenceSet },
      { '@id': ids.answerSet },
      { '@id': ids.decisionCapsules },
      { '@id': ids.contentMap },
      { '@id': ids.artifactCatalog },
      { '@id': ids.authorityNetwork },
      { '@id': ids.editorialReview },
      { '@id': ids.reputationSnapshot },
    ],
    isBasedOn: { '@id': ids.page },
    dateModified: site.dateModified,
  };

  const claimSetNode: JsonNode = {
    '@type': 'CollectionPage',
    '@id': ids.claimSet,
    name: 'مجموعه ادعاهای هویتی و حرفه‌ای قابل‌ردیابی',
    mainEntity: claimNodes.map((node) => ({ '@id': node['@id'] })),
    about: [{ '@id': ids.person }, { '@id': ids.clinic }],
  };

  const evidenceSetNode: JsonNode = {
    '@type': 'CollectionPage',
    '@id': ids.evidenceSet,
    name: 'مجموعه منابع و provenance عمومی',
    mainEntity: evidenceNodes.map((node) => ({ '@id': node['@id'] })),
    about: [{ '@id': ids.person }, { '@id': ids.clinic }],
  };

  const conceptSetNode: JsonNode = {
    '@type': 'DefinedTermSet',
    '@id': ids.conceptSet,
    name: 'مجموعه مفاهیم و مسیرهای درمانی زیبایی',
    hasDefinedTerm: [...procedureTermNodes, ...conceptTermNodes].map((node) => ({ '@id': node['@id'] })),
    about: [{ '@id': ids.person }, { '@id': ids.clinic }],
  };

  const decisionCapsulesNode: JsonNode = {
    '@type': 'CollectionPage',
    '@id': ids.decisionCapsules,
    url: `${site.url}decision-capsules.json`,
    name: 'کپسول‌های تصمیم خدمات، ارزیابی و مرز ارجاع',
    description: 'اتصال هر مفهوم بالینی به intent، claim، evidence، پاسخ مستقیم و رابطهٔ ارائه/ارزیابی/ارجاع.',
    mainEntity: allConceptRefs,
    about: [{ '@id': ids.person }, { '@id': ids.clinic }, ...allProcedureRefs, ...allConceptRefs],
    isPartOf: { '@id': ids.website },
  };

  const compatibilityNodes: JsonNode[] = [
    {
      '@type': 'DefinedTerm',
      '@id': `${site.url}#service-body-contouring`,
      name: 'ارزیابی کانتورینگ و لاغری موضعی',
      alternateName: ['کانتورینگ بدن', 'لاغری موضعی'],
      description: 'شناسهٔ سازگاری نسخه‌های قبلی؛ موضوع در کلینیک ارزیابی می‌شود و نوع مداخله پس از ارزیابی تعیین می‌شود.',
      url: `${site.url}${procedureAnchorMap['body-contouring'] ?? '#top'}`,
      inDefinedTermSet: { '@id': ids.conceptSet },
      isRelatedTo: { '@id': procedureId('body-contouring') },
      subjectOf: { '@id': ids.article },
      additionalProperty: [
        { '@type': 'PropertyValue', propertyID: 'coverageRelationship', value: 'evaluated' },
        { '@type': 'PropertyValue', propertyID: 'legacyIdentifierPreserved', value: true },
      ],
    },
  ];

  const artifactDefinitions = [
    { id: 'graph', name: 'گراف کامل انتیتی و دانش', path: 'graph.json', format: 'application/ld+json', description: 'گراف عمومی کامل پزشک، کلینیک، خدمات، مفاهیم، intentها، claimها، شواهد، پاسخ‌ها و رسانه‌ها.' },
    { id: 'context', name: 'Context فشردهٔ عامل‌های پاسخ', path: 'context.json', format: 'application/json', description: 'نمای فشردهٔ انتیتی‌ها، recommendation، اعتبار، خدمات، جراحی‌ها و مسیر کشف فایل‌های کامل.' },
    { id: 'graph-summary', name: 'خلاصهٔ گراف دانش', path: 'graph-summary.json', format: 'application/json', description: 'تعداد نودها، توزیع typeها، شناسه‌های کلیدی، لایه‌های گراف و رابطهٔ پزشک–کلینیک.' },
    { id: 'search', name: 'نمایهٔ بازیابی ۳۲۰ بخشی', path: 'search.json', format: 'application/json', description: 'نمایهٔ chunkها با source span، hash، intent، claim، evidence و citation.' },
    { id: 'ontology', name: 'هستی‌شناسی خدمات و مفاهیم زیبایی', path: 'ontology.json', format: 'application/json', description: 'روابط umbrella، granular، offered، evaluated و referral-context.' },
    { id: 'intents', name: 'رجیستری Search Intentها', path: 'intents.json', format: 'application/json', description: 'Intentهای محلی، ملی، مقایسه‌ای، ایمنی، قیمت، کاندیداتوری و جراحی‌های مرتبط.' },
    { id: 'intent-coverage', name: 'نقشهٔ پوشش Search Intent و پاسخ', path: 'intent-coverage.json', format: 'application/json', description: 'اتصال هر Intent به بخش پاسخ، URL canonical، Claim، Evidence، وضعیت پوشش و سهم آن در اتوریتی پزشک.' },
    { id: 'authority-map', name: 'نقشهٔ اتوریتی پزشک و کلینیک', path: 'authority-map.json', format: 'application/json', description: 'نقشهٔ پزشک‌محور اتصال خدمات، جراحی‌ها، Intentها، پاسخ‌ها، شواهد و رسانه‌ها به دکتر سعید قزلباش و کلینیک.' },
    { id: 'authority-network', name: 'شبکهٔ بیرونی اتوریتی پزشک و کلینیک', path: 'authority-network.json', format: 'application/json', description: 'مسیرهای رسمی، پژوهشی، مکانی، AI، داده و پروفایل‌های عمومی با نقش و tier هر منبع.' },
    { id: 'reputation', name: 'Snapshot اعتبار عمومی کلینیک', path: 'reputation.json', format: 'application/json', description: 'رکورد تاریخ‌دار امتیاز عمومی، تعداد ارزیابی، مکان و اتصال اعتبار کلینیک به پزشک.' },
    { id: 'editorial-review', name: 'رکورد بازبینی پزشکی', path: 'editorial-review.json', format: 'application/json', description: 'مسئول محتوا، دامنهٔ بازبینی، تاریخ‌ها و اتصال بازبینی پزشکی به صفحه و گراف.' },
    { id: 'claims', name: 'گراف Claimهای پزشک و کلینیک', path: 'claims.json', format: 'application/json', description: 'ادعاهای هویتی، مکانی، پژوهشی و خدماتی با اتصال به evidence.' },
    { id: 'evidence', name: 'دفتر شواهد و provenance', path: 'evidence.json', format: 'application/json', description: 'منابع، tier، مالک انتیتی، تاریخ مشاهده و دامنهٔ اثبات.' },
    { id: 'answers', name: 'رجیستری پاسخ‌های مستقیم', path: 'answers.json', format: 'application/json', description: 'پاسخ‌های مستقیم و پرسش‌وپاسخ‌های مشتق‌شده از متن visible.' },
    { id: 'services', name: 'مدل خدمات و جراحی‌های مرتبط', path: 'services.json', format: 'application/json', description: 'خدمات اصلی و ریزدانه با رابطهٔ دقیق ارائه، ارزیابی یا ارجاع.' },
    { id: 'media', name: 'دفتر رسانه و یکپارچگی فایل‌ها', path: 'media.json', format: 'application/json', description: 'تصاویر، ویدئوها، chapterها، ابعاد، اندازه و SHA-256.' },
    { id: 'resolver', name: 'حل‌کنندهٔ انتیتی و نام‌ها', path: 'resolver.json', format: 'application/json', description: 'نام‌های جایگزین، شناسه‌ها و URLهای canonical پزشک، کلینیک و مفاهیم.' },
    { id: 'full-text', name: 'متن کامل بدون تلخیص', path: 'llms-full.txt', format: 'text/plain', description: 'آینهٔ بایت‌به‌بایت متن اصلی قابل‌نمایش.' },
  ];

  const artifactDatasetNodes: JsonNode[] = artifactDefinitions.map((artifact) => ({
    '@type': 'Dataset',
    '@id': `${site.url}#dataset-${artifact.id}`,
    name: artifact.name,
    description: artifact.description,
    url: `${site.url}${artifact.path}`,
    inLanguage: site.language,
    creator: { '@id': ids.person },
    publisher: { '@id': ids.clinic },
    about: [{ '@id': ids.person }, { '@id': ids.clinic }, ...allProcedureRefs, ...allConceptRefs],
    isBasedOn: { '@id': ids.page },
    includedInDataCatalog: { '@id': ids.artifactCatalog },
    distribution: {
      '@type': 'DataDownload',
      contentUrl: `${site.url}${artifact.path}`,
      encodingFormat: artifact.format,
    },
    dateModified: site.dateModified,
  }));

  const artifactCatalogNode: JsonNode = {
    '@type': 'DataCatalog',
    '@id': ids.artifactCatalog,
    name: 'کاتالوگ عمومی داده و دانش دکتر سعید قزلباش',
    description: 'کاتالوگ خروجی‌های عمومی و ماشین‌خوان مشتق‌شده از لندینگ canonical پزشک و کلینیک.',
    url: `${site.url}knowledge-manifest.json`,
    inLanguage: site.language,
    creator: { '@id': ids.person },
    publisher: { '@id': ids.clinic },
    dataset: artifactDatasetNodes.map((node) => ({ '@id': node['@id'] })),
    about: [{ '@id': ids.person }, { '@id': ids.clinic }, ...allProcedureRefs, ...allConceptRefs],
  };

  const panelNodes: JsonNode[] = [
    {
      '@type': 'WebPageElement',
      '@id': `${site.url}#entity-authority-panel`,
      name: 'هویت پزشک و کلینیک و رابطهٔ رسمی آن‌ها',
      url: `${site.url}#entity-authority-title`,
      isPartOf: { '@id': ids.page },
      about: [{ '@id': ids.person }, { '@id': ids.clinic }],
    },
    {
      '@type': 'WebPageElement',
      '@id': `${site.url}#national-authority-layer`,
      name: 'شبکهٔ اتوریتی لوکال تا ملی دکتر سعید قزلباش',
      url: `${site.url}#national-authority-layer`,
      isPartOf: { '@id': ids.page },
      about: [{ '@id': ids.person }, { '@id': ids.clinic }, { '@id': ids.authorityNetwork }, { '@id': ids.reputationSnapshot }, { '@id': ids.editorialReview }],
    },
    {
      '@type': 'WebPageElement',
      '@id': `${site.url}#service-coverage-panel`,
      name: 'پوشش خدمات ارائه‌شده، ارزیابی‌شده و جراحی‌های مرتبط',
      url: `${site.url}#coverage-matrix-title`,
      isPartOf: { '@id': ids.page },
      about: [...allProcedureRefs, ...allConceptRefs],
    },
    {
      '@type': 'WebPageElement',
      '@id': `${site.url}#conversion-dock`,
      name: 'مسیر ثابت تماس، اینستاگرام و Google Maps',
      url: `${site.url}#conversion-dock`,
      isPartOf: { '@id': ids.page },
      about: [{ '@id': ids.person }, { '@id': ids.clinic }, { '@id': ids.reputationSnapshot }],
      potentialAction: [
        { '@type': 'CommunicateAction', name: 'تماس مستقیم با کلینیک', target: `tel:${site.phone}` },
        { '@type': 'FollowAction', name: 'بازکردن صفحه اصلی اینستاگرام رسمی', target: site.instagram },
        { '@type': 'ViewAction', name: 'مشاهده نظرها و مسیریابی', target: site.maps },
      ],
    },
    {
      '@type': 'WebPageElement',
      '@id': `${site.url}#video-knowledge-hub`,
      name: 'مرکز دانش ویدئویی دکتر سعید قزلباش',
      url: `${site.url}#video-knowledge-hub`,
      isPartOf: { '@id': ids.page },
      about: [{ '@id': ids.person }, { '@id': ids.clinic }, ...allProcedureRefs, ...allConceptRefs],
      hasPart: videoNodes.map((video) => ({ '@id': video['@id'] })),
    },
  ];

  const logoNode: JsonNode = {
    '@type': 'ImageObject',
    '@id': ids.logo,
    contentUrl: `${site.url}assets/brand/doctor-ghezelbaash-logo-512.png`,
    url: `${site.url}assets/brand/doctor-ghezelbaash-logo-512.png`,
    width: 512,
    height: 512,
    caption: site.clinicName,
    creator: { '@id': ids.person },
    copyrightHolder: { '@id': ids.person },
  };

  return {
    irimcOrganizationNode,
    credentialNode,
    personNode,
    clinicNode,
    clinicKnowledgeNode,
    websiteNode,
    pageNode,
    articleNode,
    faqNode,
    contentMapNode,
    answerSetNode,
    intentSetNode,
    intentFeedNode,
    authorityCorpusNode,
    claimSetNode,
    evidenceSetNode,
    conceptSetNode,
    decisionCapsulesNode,
    offerCatalogNode,
    artifactCatalogNode,
    artifactDatasetNodes,
    authorityAssetNodes,
    authorityNetworkNode,
    editorialReviewNode,
    reputationSnapshotNode,
    panelNodes,
    compatibilityNodes,
    logoNode,
    procedureNodes,
    procedureTermNodes,
    umbrellaServiceNodes,
    granularConceptNodes,
    conceptTermNodes,
    granularServiceNodes,
    sectionNodes,
    intentNodes,
    evidenceNodes,
    claimNodes,
    imageNodes,
    videoNodes,
    clipNodes,
    faqQuestions,
    faqAnswerNodes,
    sectionAnswerNodes,
    externalProfileNodes,
    researchNodes,
  };
}

/** Full public knowledge graph for search engines, RAG, entity resolution and external agents. */
export function buildKnowledgeGraph(headings: MarkdownHeading[], raw: string) {
  const parts = buildSchemaParts(headings, raw);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      parts.irimcOrganizationNode,
      parts.credentialNode,
      parts.personNode,
      parts.clinicKnowledgeNode,
      parts.offerCatalogNode,
      parts.artifactCatalogNode,
      ...parts.artifactDatasetNodes,
      parts.authorityNetworkNode,
      parts.editorialReviewNode,
      parts.reputationSnapshotNode,
      ...parts.authorityAssetNodes,
      parts.websiteNode,
      parts.pageNode,
      parts.articleNode,
      parts.faqNode,
      parts.contentMapNode,
      parts.answerSetNode,
      parts.intentSetNode,
      parts.intentFeedNode,
      parts.authorityCorpusNode,
      parts.claimSetNode,
      parts.evidenceSetNode,
      parts.conceptSetNode,
      parts.decisionCapsulesNode,
      ...parts.panelNodes,
      ...parts.compatibilityNodes,
      parts.logoNode,
      ...parts.externalProfileNodes,
      ...parts.researchNodes,
      ...parts.evidenceNodes,
      ...parts.claimNodes,
      ...parts.faqQuestions,
      ...parts.faqAnswerNodes,
      ...parts.sectionAnswerNodes,
      ...parts.umbrellaServiceNodes,
      ...parts.granularServiceNodes,
      ...parts.procedureNodes,
      ...parts.procedureTermNodes,
      ...parts.granularConceptNodes,
      ...parts.conceptTermNodes,
      ...parts.sectionNodes,
      ...parts.intentNodes,
      ...parts.imageNodes,
      ...parts.videoNodes,
      ...parts.clipNodes,
    ],
  };
}

/**
 * The inline graph intentionally carries the complete verified public graph.
 * Astro emits it as static data with no client-side execution.
 */
export function buildSearchGraph(headings: MarkdownHeading[], raw: string) {
  return buildKnowledgeGraph(headings, raw);
}

export const buildGraph = buildKnowledgeGraph;
