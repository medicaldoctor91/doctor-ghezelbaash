import { getHeadings, rawContent } from '../content/landing.md';
import { buildSearchChunks } from '../lib/content';
import { site } from '../data/site';
import { entityIdentity, physicianClinicRelationship } from '../domain/entity-identity';
// @ts-expect-error Shared ESM product data.
import { procedures } from '../data/knowledge.mjs';
// @ts-expect-error Shared ESM authority data.
import { allAuthorityClaims, buildIntentRegistry, evidenceSources, granularConcepts } from '../data/authority.mjs';
// @ts-expect-error Shared ESM media data.
import { videos } from '../data/media.mjs';
// @ts-expect-error Shared canonical URL registry.
import { videoEntityId, videoWatchUrl } from '../domain/url-architecture.mjs';

export const prerender = true;

export function GET() {
  const chunks = buildSearchChunks(rawContent(), getHeadings());
  const intents = buildIntentRegistry(site.url);
  const claimMap = Object.fromEntries(allAuthorityClaims.map((claim: { id: string }) => [claim.id, claim]));
  const evidenceMap = Object.fromEntries(evidenceSources.map((source: { id: string }) => [source.id, source]));
  const procedureMap = Object.fromEntries(procedures.map((procedure: { id: string }) => [procedure.id, procedure]));

  const clinicalMap = granularConcepts.map((concept: {
    id: string; name: string; parentProcedureId: string; relationship: string; modality: string;
    sourceIds: string[]; claimId: string; doctorRole: string; clinicRole: string;
    authorityContribution: string; geographyScope: string[];
  }) => {
    const conceptChunks = chunks.filter((chunk) => chunk.conceptIds.includes(concept.id));
    const conceptIntents = intents.filter((intent: { conceptId: string }) => intent.conceptId === concept.id);
    const claim = claimMap[concept.claimId];
    const relatedVideos = videos.filter((video: { relatedHeadingIncludes: string }) =>
      conceptChunks.some((chunk) => chunk.title.includes(video.relatedHeadingIncludes) || chunk.markdown.includes(video.relatedHeadingIncludes)));
    return {
      conceptId: concept.id,
      conceptEntityId: `${site.url}#concept-${concept.id}`,
      name: concept.name,
      parentProcedureId: concept.parentProcedureId,
      parentProcedureEntityId: `${site.url}#procedure-${concept.parentProcedureId}`,
      parentProcedureName: procedureMap[concept.parentProcedureId]?.name,
      relationship: concept.relationship,
      modality: concept.modality,
      doctorRole: concept.doctorRole,
      clinicRole: concept.clinicRole,
      authorityContribution: concept.authorityContribution,
      geographyScope: concept.geographyScope,
      responsibleEntities: {
        physician: `${site.url}#person`,
        clinic: `${site.url}#clinic`,
        relationship: physicianClinicRelationship,
      },
      claim: claim ? {
        id: claim.id,
        entityId: `${site.url}#${claim.id}`,
        statement: claim.statement,
        predicate: claim.predicate,
        confidence: claim.confidence,
      } : null,
      evidence: concept.sourceIds.map((id) => ({ id, entityId: `${site.url}#${id}`, ...(evidenceMap[id] ?? {}) })),
      searchIntentCoverage: {
        total: conceptIntents.length,
        local: conceptIntents.filter((intent: { geographyScope: string }) => intent.geographyScope === 'local-service').length,
        nationalAuthority: conceptIntents.filter((intent: { geographyScope: string }) => intent.geographyScope === 'national-authority').length,
        nationalKnowledge: conceptIntents.filter((intent: { geographyScope: string }) => intent.geographyScope === 'national-knowledge').length,
        branded: conceptIntents.filter((intent: { brandFocus: boolean }) => intent.brandFocus).length,
        intentIds: conceptIntents.map((intent: { id: string }) => intent.id),
      },
      answerCoverage: {
        sectionIds: conceptChunks.map((chunk) => chunk.id),
        canonicalUrls: conceptChunks.map((chunk) => chunk.url),
        primaryIntentIds: [...new Set(conceptChunks.flatMap((chunk) => chunk.primaryIntentIds))],
        claims: [...new Set(conceptChunks.flatMap((chunk) => chunk.claimIds))],
        evidence: [...new Set(conceptChunks.flatMap((chunk) => chunk.evidenceIds))],
        authoritySignals: [...new Set(conceptChunks.flatMap((chunk) => chunk.doctorAuthoritySignals))],
      },
      media: relatedVideos.map((video: { id: string; title: string; file: string }) => ({
        id: video.id,
        entityId: videoEntityId(site.url, video.id),
        title: video.title,
        url: videoWatchUrl(site.url, video.id),
        contentUrl: `${site.url}videos/${video.file}`,
      })),
    };
  });

  const pillars = [
    { id: 'identity', label: 'هویت رسمی پزشک', claimIds: allAuthorityClaims.filter((claim: { id: string }) => claim.id.includes('physician')).map((claim: { id: string }) => claim.id) },
    { id: 'clinic-local', label: 'اتوریتی لوکال کلینیک و GBP', claimIds: allAuthorityClaims.filter((claim: { id: string }) => claim.id.includes('clinic') || claim.id.includes('google')).map((claim: { id: string }) => claim.id) },
    { id: 'clinical-services', label: 'خدمات ارائه‌شده', conceptIds: granularConcepts.filter((concept: { relationship: string }) => concept.relationship === 'offered').map((concept: { id: string }) => concept.id) },
    { id: 'clinical-evaluation', label: 'ارزیابی و انتخاب بیمار', conceptIds: granularConcepts.filter((concept: { relationship: string }) => concept.relationship === 'evaluated').map((concept: { id: string }) => concept.id) },
    { id: 'surgical-boundary', label: 'پوشش جراحی و مرز ارجاع', conceptIds: granularConcepts.filter((concept: { relationship: string }) => concept.relationship === 'referral-context').map((concept: { id: string }) => concept.id) },
    { id: 'national-intents', label: 'پوشش ملی Search Intent', intentIds: intents.filter((intent: { geographyScope: string }) => intent.geographyScope === 'national-authority').map((intent: { id: string }) => intent.id) },
    { id: 'research', label: 'هویت پژوهشی', claimIds: allAuthorityClaims.filter((claim: { id: string }) => claim.id.startsWith('claim-research-')).map((claim: { id: string }) => claim.id) },
    { id: 'answer-evidence', label: 'پاسخ، Claim و Evidence', sectionIds: chunks.filter((chunk) => chunk.claimIds.length || chunk.evidenceIds.length).map((chunk) => chunk.id) },
  ];

  return new Response(JSON.stringify({
    schemaVersion: '6.0',
    canonical: site.url,
    updated: site.dateModified,
    purpose: 'نقشهٔ پزشک‌محور برای اتصال تمام دارایی‌های صفحه به اتوریتی لوکال و ملی دکتر سعید قزلباش بدون انتقال تمرکز به انتیتی‌های دیگر.',
    primaryEntities: entityIdentity,
    primaryRelationship: physicianClinicRelationship,
    authorityPillars: pillars,
    clinicalCoverage: clinicalMap,
  }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
