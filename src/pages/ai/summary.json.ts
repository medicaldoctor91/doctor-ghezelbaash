import { site } from '~/domain/entities';
import { clinic } from '~/domain/clinic';
import { offeredProcedures, evaluatedProcedures, referralProcedures } from '~/domain/services';
import { jsonResponse } from '~/compilers/utils';

export const prerender = true;

const compactProcedure = (item: any) => ({
  id: item.id,
  name: item.name,
  relationship: item.relationship,
  modality: item.modality,
  ...(item.scopeNote ? { scopeNote: item.scopeNote } : {}),
});

export function GET() {
  return jsonResponse({
    schemaVersion: '1.0',
    canonical: site.url,
    updated: site.dateModified,
    language: site.language,
    direction: site.direction,
    title: site.name,
    summary:
      `${site.legalName} is a physician associated with ${site.clinicName} in ${site.city}, Iran. ` +
      'The canonical visible HTML is authoritative for identity, service boundaries, medical guidance, and referral context.',
    entities: {
      physician: {
        id: `${site.url}#person`,
        legalName: site.legalName,
        professionalName: site.name,
        latinName: site.latinName,
        medicalCouncilId: site.irimc,
        medicalCouncilVerification: site.irimcVerification,
        orcid: site.orcidUrl,
        wikidata: site.doctorWikidata,
      },
      clinic: {
        id: clinic.id,
        name: clinic.name,
        telephone: clinic.telephone,
        address: clinic.address,
        city: clinic.city,
        countryCode: clinic.countryCode,
        maps: clinic.googleMaps,
        wikidata: site.placeWikidata,
      },
      dataset: {
        name: 'Dr. Saeed Ghezelbaash Entity Data',
        url: site.huggingFaceDataset,
        wikidata: site.datasetWikidata,
        persistentRecord: site.zenodoRecord,
      },
    },
    serviceCoverage: {
      offered: offeredProcedures.map(compactProcedure),
      evaluated: evaluatedProcedures.map(compactProcedure),
      referralContext: referralProcedures.map(compactProcedure),
    },
    interpretationRules: {
      canonicalVisibleHtml: 'authoritative',
      offered: 'Explicitly available at the clinic.',
      evaluated: 'Suitability is assessed before a treatment path is determined.',
      referralContext: 'Educational, comparative, or referral information; not represented as an offered clinic service.',
      medicalUse: 'General information only; diagnosis and treatment require an in-person medical assessment.',
    },
    discovery: {
      canonical: site.url,
      llms: `${site.url}llms.txt`,
      fullText: `${site.url}llms-full.txt`,
      faq: `${site.url}ai/faq.json`,
      compactContext: `${site.url}context.json`,
      knowledgeManifest: `${site.url}knowledge-manifest.json`,
      graphSummary: `${site.url}graph-summary.json`,
      researchIdentity: `${site.url}research.jsonld`,
      knowledgeDirectory: `${site.url}knowledge/`,
      sitemap: `${site.url}sitemap.xml`,
    },
  });
}
