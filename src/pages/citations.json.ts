import { createHash } from 'node:crypto';
import { getHeadings, rawContent } from '../content/landing.md';
import { extractCitationRecords } from '../lib/content';
import { site } from '../data/site';
// @ts-expect-error Shared ESM authority data.
import { allAuthorityClaims, evidenceSources } from '../data/authority.mjs';

export const prerender = true;

export function GET() {
  const citations = extractCitationRecords(rawContent(), getHeadings()).map((record) => {
    const evidence = evidenceSources.find((source: { url: string }) => source.url === record.url);
    return {
      id: `citation-${createHash('sha256').update(record.url).digest('hex').slice(0, 16)}`,
      ...record,
      ...(evidence ? { evidenceId: evidence.id, evidenceEntityId: `${site.url}#${evidence.id}` } : {}),
      supportsClaimIds: evidence
        ? allAuthorityClaims.filter((claim: { evidenceIds: string[] }) => claim.evidenceIds.includes(evidence.id)).map((claim: { id: string }) => claim.id)
        : [],
    };
  });
  const byTier = Object.fromEntries([1, 2, 3, 4].map((tier) => [tier, citations.filter((item) => item.evidenceTier === tier).length]));
  const bySourceType = Object.fromEntries(
    [...new Set(citations.map((item) => item.sourceType))].sort().map((sourceType) => [sourceType, citations.filter((item) => item.sourceType === sourceType).length]),
  );
  return new Response(JSON.stringify({
    schemaVersion: '6.0',
    canonical: site.url,
    updated: site.dateModified,
    citationCount: citations.length,
    evidenceTierPolicy: {
      1: 'مرجع رسمی، first-party canonical، شناسه پایدار، منبع رگولاتوری یا رکورد مقاله peer-reviewed',
      2: 'مخزن علمی یا نمایه عمومی مستقیم با ارزش اثباتی مشخص',
      3: 'پایگاه داده مشارکتی، پروفایل ثالث یا منبع تکمیلی',
      4: 'شبکه اجتماعی یا منبع هویتی کمکی و زمان‌حساس',
    },
    statistics: { byTier, bySourceType },
    citations,
  }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
