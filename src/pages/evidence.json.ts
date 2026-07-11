import { site } from '../data/site';
// @ts-expect-error Shared ESM authority data.
import { allAuthorityClaims, evidenceSources } from '../data/authority.mjs';

export const prerender = true;

export function GET() {
  const sources = evidenceSources.map((source: { id: string }) => ({
    ...source,
    supportsClaimIds: allAuthorityClaims
      .filter((claim: { evidenceIds: string[] }) => claim.evidenceIds.includes(source.id))
      .map((claim: { id: string }) => claim.id),
    ownerEntity: source.ownerEntityId === 'clinic' ? `${site.url}#clinic` : `${site.url}#person`,
  }));
  return new Response(JSON.stringify({
    schemaVersion: '6.0',
    canonical: site.url,
    updated: site.dateModified,
    sourceTruthObservedAt: site.sourceTruthObservedAt,
    evidenceCount: sources.length,
    evidenceTiers: {
      1: 'منبع رسمی، first-party canonical یا رکورد علمی پایدار',
      2: 'منبع خارجی مستقیم برای لوکیشن، بازخورد عمومی یا شناسه جغرافیایی',
      3: 'knowledge graph یا پروفایل ثالث تکمیلی',
    },
    sources,
  }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
