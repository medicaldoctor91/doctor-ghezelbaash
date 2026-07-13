import type { MarkdownHeading } from 'astro';
import { site } from '~/domain/entities';
import { clinic } from '~/domain/clinic';
import { entityIdentity, physicianClinicRelationship, socialIdentityAssignment } from '~/domain/entity-identity';
import { stabilizeHeadings } from '~/domain/anchor-utils';
import { offeredProcedures, evaluatedProcedures, referralProcedures } from '~/domain/services';
import { buildGroupedToc } from '~/lib/content';

const project = (item: any) => ({
  id: item.id,
  name: item.name,
  relationship: item.relationship,
  modality: item.modality,
  scopeNote: item.scopeNote,
});

export function buildAgentContext(headings: MarkdownHeading[]) {
  headings = stabilizeHeadings(headings);
  return {
    schemaVersion: '8.0',
    canonical: site.url,
    language: site.language,
    updated: site.dateModified,
    purpose: 'Compact entity, service and navigation context. The canonical visible HTML remains authoritative.',
    entities: {
      physician: {
        id: `${site.url}#person`,
        legalName: site.legalName,
        professionalName: site.name,
        latinName: site.latinName,
        irimc: site.irimc,
        irimcVerification: site.irimcVerification,
        orcid: site.orcidUrl,
        wikidata: site.doctorWikidata,
        identifiers: entityIdentity.physician.identifiers,
      },
      clinic,
      dataset: {
        id: site.huggingFaceDataset,
        name: 'Dr. Saeed Ghezelbaash Entity Data',
        wikidata: site.datasetWikidata,
        wikidataId: site.datasetWikidataId,
        persistentRecord: site.zenodoRecord,
      },
      relationship: physicianClinicRelationship,
      socialIdentityAssignment,
    },
    reputation: {
      entityId: clinic.id,
      source: site.googleBusinessProfile.sourceName,
      sourceUrl: site.googleBusinessProfile.sourceUrl,
      ratingValue: site.googleBusinessProfile.ratingValue,
      ratingCount: site.googleBusinessProfile.ratingCount,
      observedAt: site.googleBusinessProfile.observedAt,
      timeSensitive: true,
    },
    coverage: {
      offered: offeredProcedures.map(project),
      evaluated: evaluatedProcedures.map(project),
      referralContext: referralProcedures.map(project),
    },
    navigation: buildGroupedToc(headings).map((group) => ({
      id: group.id,
      label: group.label,
      sections: group.sections.map((section) => ({ id: section.slug, title: section.text, url: `${site.url}#${section.slug}` })),
    })),
    discovery: {
      aiPolicy: `${site.url}.well-known/ai.txt`,
      aiSummary: `${site.url}ai/summary.json`,
      aiFaq: `${site.url}ai/faq.json`,
      fullText: `${site.url}llms-full.txt`,
      graph: `${site.url}knowledge-graph.jsonld`,
      knowledgeSection: `${site.url}#knowledge-resources`,
      intents: `${site.url}intents/index.json`,
      search: `${site.url}search/index.json`,
      answers: `${site.url}answers/index.json`,
      evidence: `${site.url}evidence/sources.json`,
      media: `${site.url}media/index.json`,
      dataset: site.huggingFaceDataset,
    },
  };
}
