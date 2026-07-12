import { site } from '../data/site';
import { physicianClinicRelationship } from '../domain/entity-identity';
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
    relationship: physicianClinicRelationship,
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
      googleLocalKnowledgeGraphId: site.clinicGoogleLocalKnowledgeGraphId,
      googleLocalKnowledgeGraphUrl: site.clinicGoogleLocalKnowledgeGraphUrl,
      phone: site.phone,
      hours: site.hours,
    },
    interpretation: 'این snapshot به انتیتی کلینیک تعلق دارد و از طریق زوج رابطهٔ worksFor/employee به پزشک متصل می‌شود؛ مقدار جاری باید در منبع عمومی بررسی شود.',
  }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
