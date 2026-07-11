import type { MarkdownHeading } from 'astro';
import { site } from '~/domain/entities';
import { stabilizeHeadings } from '~/domain/anchor-utils';
// @ts-expect-error Canonical ESM intent catalogue.
import { buildIntentRegistry } from '~/domain/claims.mjs';
import { buildSearchChunks } from '~/lib/content';
import { buildAnswerUnits } from './answers';
import { shardByBytes, pad } from './utils';

export function buildIntentControlRegistry(raw: string, headings: MarkdownHeading[]) {
  headings = stabilizeHeadings(headings);
  const chunks = buildSearchChunks(raw, headings);
  const answers = buildAnswerUnits(raw, headings);
  const answerBySection = new Map(answers.map((answer) => [answer.visibleSectionId, answer]));
  return buildIntentRegistry(site.url).map((intent: any) => {
    const direct = chunks.find((chunk) => chunk.primaryIntentIds.includes(intent.id) && answerBySection.has(chunk.id));
    const supported = chunks.find((chunk) => chunk.primaryIntentIds.includes(intent.id) || chunk.secondaryIntentIds.includes(intent.id));
    const entity = chunks.find((chunk) => chunk.conceptIds.includes(intent.conceptId));
    const target = direct ?? supported ?? entity;
    const answer = direct ? answerBySection.get(direct.id) : undefined;
    const status = direct && answer?.answerText && answer?.sourceSpan && answer?.reviewedBy && answer?.lastReviewed && answer.evidenceIds.length
      ? 'authored-direct'
      : supported
        ? 'authored-supported'
        : entity
          ? 'entity-supported'
          : intent.relationship === 'referral-context'
            ? 'candidate'
            : 'uncovered';
    return {
      ...intent,
      status,
      canonicalAnswerUrl: target?.url ?? null,
      answerId: answer?.id ?? null,
      answerText: answer?.answerText ?? null,
      visibleSectionId: target?.id ?? null,
      sourceSpan: target?.sourceSpan ?? null,
      conceptId: intent.conceptId,
      dimensionId: intent.dimension,
      evidenceIds: target?.evidenceIds ?? intent.evidenceIds ?? [],
      reviewedBy: answer?.reviewedBy ?? null,
      lastReviewed: answer?.lastReviewed ?? null,
    };
  });
}

export function buildIntentCategories(raw: string, headings: MarkdownHeading[]) {
  const registry = buildIntentControlRegistry(raw, headings);
  const categories = new Map<string, any[]>();
  for (const intent of registry) {
    const category = intent.parentProcedureId || intent.conceptId?.split('-')[0] || 'general';
    categories.set(category, [...(categories.get(category) ?? []), intent]);
  }
  return [...categories.entries()].flatMap(([slug, intents]) => {
    const shards = shardByBytes(intents, 280_000);
    return shards.map((records, index) => ({ slug: shards.length === 1 ? slug : `${slug}-${pad(index)}`, intents: records }));
  });
}

export function buildReverseIntentIndex(raw: string, headings: MarkdownHeading[]) {
  const registry = buildIntentControlRegistry(raw, headings);
  return registry.flatMap((intent: any) => [intent.queryText, ...(intent.queryVariants ?? [])]
    .filter(Boolean)
    .map((query) => ({ q: query, i: intent.id, c: intent.conceptId, d: intent.dimension })));
}

export function buildReverseIntentShards(raw: string, headings: MarkdownHeading[]) {
  return shardByBytes(buildReverseIntentIndex(raw, headings), 280_000)
    .map((records, index) => ({ slug: `reverse-${pad(index)}`, records }));
}

export function buildSearchShards(raw: string, headings: MarkdownHeading[]) {
  headings = stabilizeHeadings(headings);
  const records = buildSearchChunks(raw, headings).map((chunk) => ({
    id: chunk.id,
    url: chunk.url,
    headingPath: [...chunk.breadcrumb, chunk.title],
    queryAliases: chunk.queryAliases,
    text: chunk.text,
    conceptIds: chunk.conceptIds,
    primaryConceptId: chunk.primaryConceptId,
    procedureIds: chunk.procedureIds,
    primaryProcedureId: chunk.primaryProcedureId,
    primaryIntentIds: chunk.primaryIntentIds.slice(0, 8),
    secondaryIntentIds: chunk.secondaryIntentIds.slice(0, 12),
    claimIds: chunk.claimIds,
    evidenceIds: chunk.evidenceIds,
    contentHash: chunk.contentHash.digest,
    sourceSpan: chunk.sourceSpan,
    medicalSafetyClass: chunk.medicalSafetyClass,
  }));
  return shardByBytes(records, 900_000).map((records, index) => ({ slug: `chunks-${pad(index)}`, records }));
}

export function buildAnswerShards(raw: string, headings: MarkdownHeading[]) {
  return shardByBytes(buildAnswerUnits(raw, headings), 650_000)
    .map((records, index) => ({ slug: `answers-${pad(index)}`, records }));
}
