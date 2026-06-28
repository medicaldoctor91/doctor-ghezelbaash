import { site, absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';
import { location } from '../data/location.mjs';
import { researchProfile } from '../data/research.mjs';
import { regulatoryIdentity } from '../data/regulatory.mjs';
import { machineAssetUrlMap } from '../lib/machineAssets.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.brand_kb.astro.v7.primary_graph_research',
    dateModified: '2026-06-28',
    canonicalWebsite: site.canonicalBase + '/',
    primaryGraph: absoluteUrl('/graph-ghezelbaash-final.jsonld'),
    entityIds: {
      person: absoluteUrl('/#dr-saeed-ghezelbash'),
      physician: absoluteUrl('/#physician'),
      clinic: absoluteUrl('/#clinic'),
      dataset: absoluteUrl('/kg/#dataset'),
      researchCollection: absoluteUrl('/research/#collection')
    },
    person: {
      name_fa: site.personFa,
      name_en: site.personEn,
      canonicalPage: absoluteUrl(site.pages.person),
      identifiers: {
        wikidata: 'Q140287622',
        orcid: researchProfile.orcid.replace('https://orcid.org/', ''),
        medicalCouncilNumber: regulatoryIdentity.irimc.medicalCouncilNumber
      },
      research: {
        orcid: researchProfile.orcid,
        bibliographyUrl: researchProfile.bibliographyUrl,
        graph: absoluteUrl('/graph-ghezelbaash-final.jsonld'),
        collectionNode: absoluteUrl('/research/#collection'),
        publications: researchProfile.publications.map((item) => ({
          key: item.key,
          doi: item.doi,
          pmid: item.pmid,
          pmcid: item.pmcid,
          graphNode: absoluteUrl(`/research/#${item.key}`)
        }))
      }
    },
    clinic: {
      name_fa: site.nameFa,
      canonicalPage: absoluteUrl(site.pages.clinic),
      address: location.canonicalAddressFa,
      postalCode: location.postalCode,
      telephone: location.telephone
    },
    servicePages: services.map((service) => ({
      key: service.key,
      slug: service.slug,
      title: service.title,
      canonicalUrl: absoluteUrl(`/${service.slug}/`),
      bestIntentAnchor: absoluteUrl(`/${service.slug}/#${service.bestIntentAnchor}`)
    })),
    machineAssets: machineAssetUrlMap()
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
