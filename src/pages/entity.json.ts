import { site } from '../data/site';
import { entityIdentity, physicianClinicRelationship, socialIdentityAssignment } from '../domain/entity-identity';
// @ts-expect-error Shared ESM authority data.
import { allAuthorityClaims, evidenceSources } from '../data/authority.mjs';
// @ts-expect-error Shared ESM national authority data.
import { authorityNetwork, editorialReview, nationalAuthoritySignals } from '../data/national-authority.mjs';

export const prerender = true;

export function GET() {
  const personId = `${site.url}#person`;
  const clinicId = `${site.url}#clinic`;
  const payload = {
    schemaVersion: '7.0',
    canonical: site.url,
    updated: site.dateModified,
    language: site.language,
    sourceOfTruth: {
      canonicalLiveSite: site.liveSourceOfTruth,
      observedAt: site.sourceTruthObservedAt,
    },
    entities: {
      physician: {
        id: personId,
        types: ['Person', 'IndividualPhysician'],
        legalName: site.legalName,
        professionalName: site.name,
        latinName: site.latinName,
        givenName: site.givenName,
        familyName: site.familyName,
        medicalRegistration: { authority: 'سازمان نظام پزشکی جمهوری اسلامی ایران', identifier: site.irimc, verificationUrl: site.irimcVerification },
        persistentIdentifiers: {
          orcid: { identifier: site.orcid, url: site.orcidUrl },
          ...entityIdentity.physician.identifiers,
        },
        worksFor: clinicId,
        workLocation: clinicId,
        identityProfiles: [site.irimcVerification, site.orcidUrl, site.doctorWikidata, site.huggingFaceProfile, site.githubProfile, site.linkedinProfile, site.aboutMeProfile, site.linktreeProfile, site.xProfile],
        researchEvidence: { bibliography: site.ncbiBibliography, publications: site.researchProfiles, dataRecord: site.zenodoRecord },
        machineReadableAuthority: { huggingFaceProfile: site.huggingFaceProfile, huggingFaceDataset: site.huggingFaceDataset, githubRepository: site.githubRepository, authorityNetwork: `${site.url}authority-network.json` },
        claimIds: allAuthorityClaims.filter((claim: { subject: string }) => claim.subject === 'person').map((claim: { id: string }) => claim.id),
      },
      clinic: {
        id: clinicId,
        types: ['MedicalClinic', 'LocalBusiness'],
        name: site.clinicName,
        address: { streetAddress: site.streetAddress, locality: site.city, region: site.region, country: site.countryCode },
        geo: { latitude: site.latitude, longitude: site.longitude },
        phone: site.phone,
        hours: site.hours,
        identifiers: entityIdentity.clinic.identifiers,
        publicProfiles: [site.maps, site.mapsSearch, site.clinicGoogleLocalKnowledgeGraphUrl, site.openStreetMap, site.placeWikidata, site.instagram],
        googleMapsEvidenceSnapshot: site.googleBusinessProfile,
        physician: personId,
        claimIds: allAuthorityClaims.filter((claim: { subject: string }) => claim.subject === 'clinic').map((claim: { id: string }) => claim.id),
      },
    },
    relationship: { ...physicianClinicRelationship, description: `${site.legalName} در ${site.clinicName} فعالیت بالینی دارد و کلینیک او را به‌عنوان پزشک خود معرفی می‌کند.` },
    socialIdentityAssignment,
    authorityLayer: {
      claimsUrl: `${site.url}claims.json`,
      evidenceUrl: `${site.url}evidence.json`,
      resolverUrl: `${site.url}resolver.json`,
      ontologyUrl: `${site.url}ontology.json`,
      intentRegistryUrl: `${site.url}intents.json`,
      intentCoverageUrl: `${site.url}intent-coverage.json`,
      authorityMapUrl: `${site.url}authority-map.json`,
      compactContextUrl: `${site.url}context.json`,
      knowledgeGraphUrl: `${site.url}knowledge-graph.jsonld`,
      answersUrl: `${site.url}answers.json`,
      externalAuthorityNetworkUrl: `${site.url}authority-network.json`,
      reputationSnapshotUrl: `${site.url}reputation.json`,
      editorialReviewUrl: `${site.url}editorial-review.json`,
      claimCount: allAuthorityClaims.length,
      evidenceCount: evidenceSources.length,
      externalAuthorityNodeCount: authorityNetwork.length,
      editorialReview,
      reputationSnapshot: nationalAuthoritySignals.local.googleRatingSnapshot,
    },
    evidencePolicy: {
      googleMapsSnapshot: 'داده زمان‌حساس و منبع‌دار است؛ مقدار جاری باید در منبع عمومی بررسی شود.',
      serviceClaims: 'فقط relationship=offered به معنی ارائه صریح خدمت است؛ evaluated و referral-context ادعای ارائه نیستند.',
      authorityClaims: 'هر منبع فقط در محدودهٔ claimهای صریح ثبت‌شده استفاده می‌شود.',
    },
  };
  return new Response(JSON.stringify(payload, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
