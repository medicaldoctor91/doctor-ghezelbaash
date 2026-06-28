import { site, absoluteUrl } from '../data/site.mjs';
import { location } from '../data/location.mjs';
import { googleMapsReputation } from '../data/reputation.mjs';
import { regulatoryIdentity } from '../data/regulatory.mjs';
import { researchProfile } from '../data/research.mjs';
import { services } from '../data/services.mjs';
import { serviceTaxonomy } from '../data/serviceTaxonomy.mjs';
import { aestheticScopePolicy } from '../data/aestheticScope.mjs';
import {
  aestheticConceptProjection,
  aestheticConceptsForService,
  aestheticScopeByCategory
} from '../lib/aestheticScopeGraph.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.aesthetic_knowledge.astro.v4.aesthetic_scope_builder',
    language: ['fa', 'en'],
    dateModified: '2026-06-28',
    generatedFrom: ['site', 'location', 'regulatoryIdentity', 'researchProfile', 'services', 'serviceTaxonomy', 'aestheticScopeGraph', 'googleMapsReputation'],
    canonicalIdentity: {
      person: {
        nameFa: site.personFa,
        nameEn: site.personEn,
        page: absoluteUrl(site.pages.person),
        node: absoluteUrl('/#dr-saeed-ghezelbash'),
        physicianNode: absoluteUrl('/#physician'),
        wikidata: 'Q140287622',
        irimc: regulatoryIdentity.irimc.medicalCouncilNumber,
        irimcProfile: regulatoryIdentity.irimc.url,
        orcid: researchProfile.orcid,
        ncbiBibliography: researchProfile.bibliographyUrl
      },
      clinic: {
        nameFa: site.nameFa,
        nameEn: site.nameEn,
        page: absoluteUrl(site.pages.clinic),
        website: absoluteUrl('/'),
        node: absoluteUrl('/#clinic'),
        wikidata: 'Q140288589',
        addressFa: location.canonicalAddressFa,
        city: location.addressLocality,
        region: location.addressRegion,
        postalCode: location.postalCode,
        country: location.addressCountry,
        phoneE164: location.telephone,
        instagram: site.instagram,
        googleMapsCid: googleMapsReputation.cidUrl,
        googleMapsPlaceId: googleMapsReputation.placeId,
        openStreetMap: location.openStreetMap,
        latitude: location.geo.latitude,
        longitude: location.geo.longitude
      },
      knowledgeGraph: {
        page: absoluteUrl(site.pages.kg),
        wikidata: 'Q140304972',
        graphEndpoint: absoluteUrl('/graph-ghezelbaash-final.jsonld'),
        brandKbEndpoint: absoluteUrl('/brand-kb.ghezelbaash.ai-public.json'),
        aiDiscoveryEndpoint: absoluteUrl('/ai-discovery-index.json')
      }
    },
    broadScopePolicy: aestheticScopePolicy,
    servicePillars: services.map((service) => ({
      key: service.key,
      slug: service.slug,
      title: service.title,
      shortTitle: service.shortTitle,
      canonicalUrl: absoluteUrl(`/${service.slug}/`),
      bestIntentTitle: service.bestIntentTitle,
      intentExamples: service.intentExamples,
      taxonomy: serviceTaxonomy[service.key] || null,
      scopeConcepts: aestheticConceptsForService(service.key).map(aestheticConceptProjection)
    })),
    broadAestheticConcepts: Object.values(aestheticScopeByCategory()).flat(),
    broadAestheticConceptsByCategory: aestheticScopeByCategory(),
    machineReadableAssets: {
      llms: absoluteUrl('/llms.txt'),
      routes: absoluteUrl('/routes.json'),
      seoAeoIndex: absoluteUrl('/seo-aeo-index.json'),
      pageContext: absoluteUrl('/page-context.json'),
      linkGraph: absoluteUrl('/link-graph.json'),
      services: absoluteUrl('/services.json'),
      serviceTaxonomy: absoluteUrl('/service-taxonomy.json'),
      sameAs: absoluteUrl('/sameas.json'),
      location: absoluteUrl('/location.json'),
      regulatory: absoluteUrl('/regulatory.json'),
      research: absoluteUrl('/research.json'),
      researchGraph: absoluteUrl('/research-graph.jsonld'),
      dataset: absoluteUrl('/dataset.json'),
      authoritySignals: absoluteUrl('/authority-signals.json'),
      profileLinks: absoluteUrl('/profile-links.json'),
      napCsv: absoluteUrl('/nap.csv'),
      graph: absoluteUrl('/graph-ghezelbaash-final.jsonld')
    },
    researchSignals: {
      orcid: researchProfile.orcid,
      bibliographyUrl: researchProfile.bibliographyUrl,
      graph: absoluteUrl('/research-graph.jsonld'),
      publications: researchProfile.publications.map((publication) => ({
        title: publication.title,
        doi: publication.doi,
        pmid: publication.pmid,
        pmcid: publication.pmcid,
        graphNode: absoluteUrl(`/research/#${publication.key}`),
        url: publication.url || publication.pubmed || publication.doiUrl || null
      }))
    }
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
