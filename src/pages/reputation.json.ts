import { site } from '../data/site';
// @ts-expect-error Shared ESM national authority data.
import { nationalAuthoritySignals } from '../data/national-authority.mjs';

export const prerender = true;

export function GET() {
  const snapshot = nationalAuthoritySignals.local.googleRatingSnapshot;
  return new Response(JSON.stringify({
    schemaVersion: '7.0',
    canonical: site.url,
    updated: site.dateModified,
    recordId: `${site.url}#clinic-reputation-snapshot`,
    recordType: 'dated-public-location-reputation-snapshot',
    subjectEntity: `${site.url}#clinic`,
    relatedPhysicianEntity: `${site.url}#person`,
    relationship: { subject: `${site.url}#person`, predicate: 'practicesAt', object: `${site.url}#clinic` },
    source: {
      name: site.googleBusinessProfile.sourceName,
      url: site.googleBusinessProfile.sourceUrl,
      evidenceStatus: site.googleBusinessProfile.evidenceStatus,
    },
    snapshot: {
      ratingValue: snapshot.ratingValue,
      bestRating: snapshot.bestRating,
      ratingCount: snapshot.ratingCount,
      observedAt: snapshot.observedAt,
      timeSensitive: true,
    },
    location: {
      name: site.clinicName,
      address: site.address,
      geo: { latitude: site.latitude, longitude: site.longitude },
      googlePlaceId: site.googlePlaceId,
      googleCid: site.googleCid,
      phone: site.phone,
      hours: site.hours,
    },
    interpretation: 'این snapshot به انتیتی کلینیک تعلق دارد و از طریق رابطهٔ practicesAt به پزشک متصل می‌شود؛ مقدار جاری باید در منبع عمومی بررسی شود.',
  }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
