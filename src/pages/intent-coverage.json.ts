import { getHeadings, rawContent } from '../content/landing.md';
import { buildSearchChunks } from '../lib/content';
import { site } from '../data/site';
// @ts-expect-error Shared ESM authority data.
import { buildIntentRegistry, granularConcepts } from '../data/authority.mjs';

export const prerender = true;

export function GET() {
  const raw = rawContent();
  const chunks = buildSearchChunks(raw, getHeadings());
  const intents = buildIntentRegistry(site.url);
  const conceptMap = Object.fromEntries(granularConcepts.map((concept: { id: string }) => [concept.id, concept]));

  const coverage = intents.map((intent: {
    id: string; conceptId: string; parentProcedureId: string; queryText: string; dimension: string;
    relationship: string; modality: string; geographyScope: string; intentClass: string;
    decisionStage: string; authorityContribution: string; claimId: string; evidenceIds: string[];
  }) => {
    const primary = chunks.filter((chunk) => chunk.primaryIntentIds.includes(intent.id));
    const secondary = chunks.filter((chunk) => chunk.secondaryIntentIds.includes(intent.id));
    const conceptChunks = chunks.filter((chunk) => chunk.conceptIds.includes(intent.conceptId));
    const best = primary[0] ?? secondary[0] ?? conceptChunks[0];
    const status = primary.length
      ? 'directly-covered'
      : secondary.length
        ? 'supporting-covered'
        : conceptChunks.length
          ? 'concept-covered'
          : 'coverage-target';
    const strength = Math.min(100,
      (primary.length ? 55 : secondary.length ? 35 : conceptChunks.length ? 20 : 0)
      + Math.min(20, (primary.length + secondary.length) * 3)
      + Math.min(15, new Set(conceptChunks.flatMap((chunk) => chunk.evidenceIds)).size * 3)
      + (intent.geographyScope === 'national-authority' ? 5 : 0)
      + (intent.relationship === 'offered' ? 5 : 0));
    return {
      ...intent,
      conceptName: conceptMap[intent.conceptId]?.name,
      conceptEntityId: `${site.url}#concept-${intent.conceptId}`,
      procedureEntityId: `${site.url}#procedure-${intent.parentProcedureId}`,
      claimEntityId: `${site.url}#${intent.claimId}`,
      coverageStatus: status,
      coverageStrength: strength,
      canonicalAnswerUrl: best?.url ?? site.url,
      primaryAnswerSectionIds: primary.map((chunk) => chunk.id),
      supportingAnswerSectionIds: secondary.map((chunk) => chunk.id),
      conceptSectionIds: conceptChunks.map((chunk) => chunk.id),
      answerAuthoritySignals: [...new Set((best?.doctorAuthoritySignals ?? []).concat(intent.authorityContribution))],
      medicalSafetyClasses: [...new Set(conceptChunks.map((chunk) => chunk.medicalSafetyClass))],
    };
  });

  const byStatus = Object.fromEntries([...new Set(coverage.map((item) => item.coverageStatus))]
    .map((status) => [status, coverage.filter((item) => item.coverageStatus === status).length]));
  const byGeography = Object.fromEntries([...new Set(coverage.map((item) => item.geographyScope))]
    .map((scope) => [scope, coverage.filter((item) => item.geographyScope === scope).length]));
  const byRelationship = Object.fromEntries(['offered', 'evaluated', 'referral-context']
    .map((relationship) => [relationship, coverage.filter((item) => item.relationship === relationship).length]));

  return new Response(JSON.stringify({
    schemaVersion: '6.0',
    canonical: site.url,
    updated: site.dateModified,
    language: site.language,
    physicianEntity: `${site.url}#person`,
    clinicEntity: `${site.url}#clinic`,
    purpose: 'تبدیل رجیستری Search Intent به نقشهٔ پوشش پاسخ، اتوریتی پزشک، Claim، Evidence و URL canonical بدون حذف هیچ Intent.',
    intentCount: coverage.length,
    coverageSummary: { byStatus, byGeography, byRelationship },
    intents: coverage,
  }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
