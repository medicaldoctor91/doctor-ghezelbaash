import { getHeadings } from '../content/landing.md';
import { buildProcedureAnchorMap } from '../lib/content';
import { site } from '../data/site';
import { physicianClinicRelationship } from '../domain/entity-identity';
// @ts-expect-error Shared ESM product data.
import { procedures } from '../data/knowledge.mjs';
// @ts-expect-error Shared ESM authority data.
import { granularConcepts } from '../data/authority.mjs';

export const prerender = true;

export function GET() {
  const links = buildProcedureAnchorMap(getHeadings());
  const umbrella = procedures.map((procedure: {
    id: string; name: string; modality: string; relationship: string; keywords: string[];
    serviceCategory?: string; bodyLocation?: string; scopeNote?: string;
  }) => ({
    id: procedure.id,
    level: 'umbrella-procedure',
    conceptEntityId: `${site.url}#procedure-${procedure.id}`,
    conceptSchemaType: procedure.modality === 'surgical' ? 'SurgicalProcedure' : 'MedicalProcedure',
    ...(procedure.relationship === 'offered' ? { serviceEntityId: `${site.url}#service-${procedure.id}` } : {}),
    name: procedure.name,
    modality: procedure.modality,
    relationship: procedure.relationship,
    url: `${site.url}${links[procedure.id] ?? '#top'}`,
    keywords: procedure.keywords,
    serviceCategory: procedure.serviceCategory,
    bodyLocation: procedure.bodyLocation,
    scopeNote: procedure.scopeNote,
    ...(procedure.relationship === 'offered' ? {
      availableService: true,
      provider: `${site.url}#clinic`,
      responsiblePhysician: `${site.url}#person`,
    } : { availableService: false }),
    ...(procedure.relationship === 'evaluated' ? { evaluationProvider: `${site.url}#clinic`, evaluatedBy: `${site.url}#person` } : {}),
    ...(procedure.relationship === 'referral-context' ? { knowledgeContextOf: `${site.url}#person`, referralBoundaryAt: `${site.url}#clinic` } : {}),
  }));

  const granular = granularConcepts.map((concept: {
    id: string; name: string; parentProcedureId: string; relationship: string; modality: string;
    keywords: string[]; sourceIds: string[]; doctorRole: string; clinicRole: string;
    authorityContribution: string; geographyScope: string[]; claimId: string;
  }) => ({
    id: concept.id,
    level: 'granular-clinical-concept',
    conceptEntityId: `${site.url}#concept-${concept.id}`,
    parentProcedureId: concept.parentProcedureId,
    parentProcedureEntityId: `${site.url}#procedure-${concept.parentProcedureId}`,
    conceptSchemaType: concept.modality === 'surgical' ? 'SurgicalProcedure' : 'MedicalProcedure',
    ...(concept.relationship === 'offered' ? { serviceEntityId: `${site.url}#concept-service-${concept.id}` } : {}),
    name: concept.name,
    modality: concept.modality,
    relationship: concept.relationship,
    url: `${site.url}${links[concept.parentProcedureId] ?? '#top'}`,
    keywords: concept.keywords,
    evidenceIds: concept.sourceIds,
    claimId: concept.claimId,
    claimEntityId: `${site.url}#${concept.claimId}`,
    doctorRole: concept.doctorRole,
    clinicRole: concept.clinicRole,
    authorityContribution: concept.authorityContribution,
    geographyScope: concept.geographyScope,
    ...(concept.relationship === 'offered' ? {
      availableService: true,
      provider: `${site.url}#clinic`,
      responsiblePhysician: `${site.url}#person`,
    } : { availableService: false }),
    ...(concept.relationship === 'evaluated' ? { evaluationProvider: `${site.url}#clinic`, evaluatedBy: `${site.url}#person` } : {}),
    ...(concept.relationship === 'referral-context' ? { knowledgeContextOf: `${site.url}#person`, referralBoundaryAt: `${site.url}#clinic` } : {}),
  }));

  const payload = {
    schemaVersion: '6.0',
    canonical: site.url,
    updated: site.dateModified,
    sourceOfTruth: site.liveSourceOfTruth,
    relationshipVocabulary: {
      offered: 'خدمت یا مسیر درمانی به‌صورت صریح در سایت زنده کلینیک پوشش داده شده و provider به کلینیک متصل است.',
      evaluated: 'موضوع در کلینیک ارزیابی می‌شود؛ روش نهایی به معاینه و نتیجه ارزیابی وابسته است.',
      'referral-context': 'روش جراحی یا تخصصی برای مقایسه، تعیین مرز درمان و ارجاع صحیح پوشش داده می‌شود و به‌عنوان خدمت کلینیک ادعا نشده است.',
    },
    providers: { physician: `${site.url}#person`, clinic: `${site.url}#clinic`, relationship: physicianClinicRelationship },
    statistics: {
      umbrellaCount: umbrella.length,
      granularCount: granular.length,
      offeredCount: [...umbrella, ...granular].filter((item) => item.relationship === 'offered').length,
      evaluatedCount: [...umbrella, ...granular].filter((item) => item.relationship === 'evaluated').length,
      referralContextCount: [...umbrella, ...granular].filter((item) => item.relationship === 'referral-context').length,
    },
    umbrellaProcedures: umbrella,
    granularConcepts: granular,
    services: [...umbrella, ...granular],
  };
  return new Response(JSON.stringify(payload, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
