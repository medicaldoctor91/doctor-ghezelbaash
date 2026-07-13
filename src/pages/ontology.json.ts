import { site } from '../data/site';
import { entityIdentity, physicianClinicRelationship } from '../domain/entity-identity';
// @ts-expect-error Shared ESM product data.
import { procedures, topicGroups } from '../data/knowledge.mjs';
// @ts-expect-error Shared ESM authority data.
import { granularConcepts } from '../data/authority.mjs';

export const prerender = true;

export function GET() {
  const concepts = granularConcepts.map((concept: { id: string; parentProcedureId: string }) => ({
    ...concept,
    entityId: `${site.url}#concept-${concept.id}`,
    parentEntityId: `${site.url}#procedure-${concept.parentProcedureId}`,
    doctorEntityId: `${site.url}#person`,
    clinicEntityId: `${site.url}#clinic`,
    claimEntityId: `${site.url}#${concept.claimId}`,
    doctorRole: concept.doctorRole,
    clinicRole: concept.clinicRole,
    authorityContribution: concept.authorityContribution,
    geographyScope: concept.geographyScope,
  }));
  return new Response(JSON.stringify({
    schemaVersion: '6.0',
    canonical: site.url,
    updated: site.dateModified,
    relationshipVocabulary: ['offered', 'evaluated', 'referral-context'],
    entityIdentity,
    physicianClinicRelationship,
    topicGroups,
    umbrellaProcedures: procedures,
    granularConcepts: concepts,
  }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
