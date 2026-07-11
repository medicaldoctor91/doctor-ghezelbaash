import { getHeadings, rawContent } from '../content/landing.md';
import { buildSearchChunks, buildProcedureAnchorMap } from '../lib/content';
import { site } from '../data/site';
// @ts-expect-error Shared ESM authority data.
import { allAuthorityClaims, buildIntentRegistry, evidenceSources, granularConcepts } from '../data/authority.mjs';

export const prerender = true;

function firstSubstantiveParagraph(markdown: string) {
  return markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find((block) => block && !/^(#{1,6}|[-*+] |\d+\. |\|)/.test(block))
    ?.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[\n*_`>#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() ?? '';
}

export function GET() {
  const raw = rawContent();
  const headings = getHeadings();
  const chunks = buildSearchChunks(raw, headings);
  const anchors = buildProcedureAnchorMap(headings);
  const intents = buildIntentRegistry(site.url);
  const evidenceMap = Object.fromEntries(evidenceSources.map((source: { id: string }) => [source.id, source]));
  const claimMap = Object.fromEntries(allAuthorityClaims.map((claim: { id: string }) => [claim.id, claim]));

  const capsules = granularConcepts.map((concept: {
    id: string; name: string; parentProcedureId: string; relationship: string; modality: string;
    keywords: string[]; sourceIds: string[]; doctorRole: string; clinicRole: string;
    authorityContribution: string; geographyScope: string[]; claimId: string;
  }) => {
    const matchedChunks = chunks
      .filter((chunk) => chunk.conceptIds.includes(concept.id))
      .sort((a, b) => {
        const aTitle = a.title.includes(concept.name) ? 0 : 1;
        const bTitle = b.title.includes(concept.name) ? 0 : 1;
        return aTitle - bTitle || a.depth - b.depth || a.sourceSpan.startLine - b.sourceSpan.startLine;
      });
    const primary = matchedChunks[0];
    const conceptIntents = intents.filter((intent: { conceptId: string }) => intent.conceptId === concept.id);
    const coverageClaimId = `claim-coverage-${concept.id}`;
    const claim = claimMap[coverageClaimId];
    return {
      id: `decision-capsule-${concept.id}`,
      conceptId: concept.id,
      conceptEntityId: `${site.url}#concept-${concept.id}`,
      parentProcedureId: concept.parentProcedureId,
      parentProcedureEntityId: `${site.url}#procedure-${concept.parentProcedureId}`,
      name: concept.name,
      relationship: concept.relationship,
      modality: concept.modality,
      doctorRole: concept.doctorRole,
      clinicRole: concept.clinicRole,
      authorityContribution: concept.authorityContribution,
      geographyScope: concept.geographyScope,
      canonicalUrl: primary?.url ?? `${site.url}${anchors[concept.parentProcedureId] ?? '#top'}`,
      directAnswer: primary ? firstSubstantiveParagraph(primary.markdown) : '',
      directAnswerSource: primary ? {
        chunkId: primary.id,
        sourceSpan: primary.sourceSpan,
        contentHash: primary.contentHash,
        derivation: 'verbatim-first-substantive-visible-paragraph',
      } : null,
      supportingChunkIds: matchedChunks.map((chunk) => chunk.id),
      answerAuthoritySignals: [...new Set(matchedChunks.flatMap((chunk) => chunk.doctorAuthoritySignals))],
      primaryIntentIds: [...new Set(matchedChunks.flatMap((chunk) => chunk.primaryIntentIds))],
      secondaryIntentIds: [...new Set(matchedChunks.flatMap((chunk) => chunk.secondaryIntentIds))],
      decisionDimensions: Object.fromEntries(conceptIntents.map((intent: { dimension: string; id: string; label: string; intentClass: string; decisionStage: string; authorityContribution: string; geographyScope: string }) => [
        intent.dimension,
        {
          intentId: intent.id,
          question: intent.label,
          entityId: `${site.url}#${intent.id}`,
          intentClass: intent.intentClass,
          decisionStage: intent.decisionStage,
          authorityContribution: intent.authorityContribution,
          geographyScope: intent.geographyScope,
        },
      ])),
      claim: claim ? {
        id: coverageClaimId,
        entityId: `${site.url}#${coverageClaimId}`,
        statement: claim.statement,
        predicate: claim.predicate,
        confidence: claim.confidence,
        authorityContribution: claim.authorityContribution,
      } : null,
      evidence: concept.sourceIds.map((id) => ({ id, entityId: `${site.url}#${id}`, ...(evidenceMap[id] ?? {}) })),
      responsibleEntities: {
        physician: `${site.url}#person`,
        clinic: `${site.url}#clinic`,
        relationship: 'practicesAt',
      },
      action: concept.relationship === 'offered'
        ? { type: 'clinical-evaluation-and-service', telephone: `tel:${site.phone}`, map: site.maps, instagram: site.instagram }
        : concept.relationship === 'evaluated'
          ? { type: 'clinical-evaluation-before-method-selection', telephone: `tel:${site.phone}`, map: site.maps }
          : { type: 'knowledge-comparison-and-referral-boundary', telephone: `tel:${site.phone}` },
      interpretationRule: concept.relationship === 'offered'
        ? 'خدمت یا مسیر بالینی در کلینیک پوشش داده شده است؛ انجام آن همچنان به معاینه و کاندیداتوری وابسته است.'
        : concept.relationship === 'evaluated'
          ? 'موضوع ارزیابی می‌شود و روش نهایی از پیش ادعا نشده است.'
          : 'پوشش برای مقایسه، شناخت مرز روش و ارجاع است و به معنی ارائه جراحی در کلینیک نیست.',
    };
  });

  return new Response(JSON.stringify({
    schemaVersion: '6.0',
    canonical: site.url,
    updated: site.dateModified,
    language: site.language,
    capsuleCount: capsules.length,
    sourceOfTruth: site.liveSourceOfTruth,
    entities: { physician: `${site.url}#person`, clinic: `${site.url}#clinic`, relationship: 'practicesAt' },
    policy: 'کپسول‌ها ساختار تصمیم، intent، claim و evidence را بدون حذف یا بازنویسی متن visible به هم متصل می‌کنند.',
    capsules,
  }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
