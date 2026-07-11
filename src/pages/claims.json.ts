import { site } from '../data/site';
// @ts-expect-error Shared ESM authority data.
import { allAuthorityClaims, evidenceSources } from '../data/authority.mjs';

export const prerender = true;

export function GET() {
  const sourceMap = Object.fromEntries(evidenceSources.map((source: { id: string }) => [source.id, source]));
  const claims = allAuthorityClaims.map((claim: { evidenceIds: string[] }) => ({
    ...claim,
    entityId: claim.subject === 'clinic' ? `${site.url}#clinic` : `${site.url}#person`,
    statement: claim.statement ?? claim.label,
    claimEntityId: `${site.url}#${claim.id}`,
    conceptEntityId: claim.conceptId ? `${site.url}#concept-${claim.conceptId}` : undefined,
    procedureEntityId: claim.parentProcedureId ? `${site.url}#procedure-${claim.parentProcedureId}` : undefined,
    evidence: claim.evidenceIds.map((id) => sourceMap[id]).filter(Boolean),
  }));
  return new Response(JSON.stringify({
    schemaVersion: '6.0',
    canonical: site.url,
    updated: site.dateModified,
    sourceOfTruth: site.liveSourceOfTruth,
    claimCount: claims.length,
    policy: 'هر claim به منبع و دامنهٔ اثبات خودش محدود است؛ snapshotهای زمان‌حساس با تاریخ ثبت می‌شوند.',
    claims,
  }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
