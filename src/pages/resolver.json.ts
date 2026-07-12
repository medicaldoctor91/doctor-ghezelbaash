import { getHeadings } from '../content/landing.md';
import { buildProcedureAnchorMap } from '../lib/content';
import { site } from '../data/site';
import { entityIdentity, physicianClinicRelationship, socialIdentityAssignment } from '../domain/entity-identity';
// @ts-expect-error Shared ESM product data.
import { procedures } from '../data/knowledge.mjs';
// @ts-expect-error Shared ESM authority data.
import { granularConcepts } from '../data/authority.mjs';

export const prerender = true;

export function GET() {
  const anchors = buildProcedureAnchorMap(getHeadings());
  const physicianAliases = [
    site.legalName,
    site.name,
    site.latinName,
    'محمدسعید قزلباش',
    'سعید قزلباش',
    'دکتر قزلباش',
  ];
  return new Response(JSON.stringify({
    schemaVersion: '6.0',
    canonical: site.url,
    updated: site.dateModified,
    entities: {
      physician: {
        id: `${site.url}#person`, aliases: physicianAliases,
        identifiers: { irimc: site.irimc, orcid: site.orcid, ...entityIdentity.physician.identifiers },
        resolvesTo: site.url,
      },
      clinic: {
        id: `${site.url}#clinic`,
        aliases: [site.clinicName, 'کلینیک دکتر قزلباش', 'کلینیک زیبایی قزلباش', site.instagramHandle],
        identifiers: entityIdentity.clinic.identifiers,
        resolvesTo: `${site.url}#entity-authority-panel`,
      },
    },
    relationship: physicianClinicRelationship,
    socialIdentityAssignment,
    procedures: procedures.map((item: { id: string; name: string; alternateNames?: string[] }) => ({
      id: `${site.url}#procedure-${item.id}`,
      name: item.name,
      aliases: item.alternateNames ?? [],
      resolvesTo: `${site.url}${anchors[item.id] ?? '#top'}`,
    })),
    concepts: granularConcepts.map((item: { id: string; name: string; keywords: string[]; parentProcedureId: string }) => ({
      id: `${site.url}#concept-${item.id}`,
      name: item.name,
      aliases: item.keywords,
      parent: `${site.url}#procedure-${item.parentProcedureId}`,
      resolvesTo: `${site.url}${anchors[item.parentProcedureId] ?? '#top'}`,
    })),
  }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
