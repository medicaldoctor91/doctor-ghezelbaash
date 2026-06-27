import { site, absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';
import { location } from '../data/location.mjs';
import { googleMapsReputation } from '../data/reputation.mjs';
import { publicDataset } from '../data/dataset.mjs';
import { researchProfile } from '../data/research.mjs';
import { authoritySignalPolicy, authoritySignals } from '../data/authoritySignals.mjs';
import { serviceTaxonomy } from '../data/serviceTaxonomy.mjs';
import { regulatoryIdentity } from '../data/regulatory.mjs';
import { getSameAsForEntity, getUrlsByUse } from '../lib/sourceClassifier.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.brand_kb.astro.v6.reputation_integrated',
    dateModified: '2026-06-28',
    canonicalWebsite: site.canonicalBase + '/',
    canonicalPolicy: {
      primaryDomain: 'www.ghezelbaash.ir',
      personPage: absoluteUrl(site.pages.person),
      clinicPage: absoluteUrl(site.pages.clinic),
      kgPage: absoluteUrl(site.pages.kg),
      servicesHub: absoluteUrl(site.pages.services),
      serviceRobots: 'index,follow'
    },
    entityIds: {
      person: absoluteUrl('/#dr-saeed-ghezelbash'),
      clinic: absoluteUrl('/#clinic'),
      website: absoluteUrl('/#website'),
      organization: absoluteUrl('/#organization'),
      dataset: absoluteUrl('/kg/#dataset')
    },
    person: {
      name_fa: site.personFa,
      name_en: site.personEn,
      full_name_en: regulatoryIdentity.irimc.canonicalName,
      canonicalPage: absoluteUrl(site.pages.person),
      sameAs: getSameAsForEntity(authoritySignals, 'person', site.sameAs.person),
      identifiers: {
        wikidata: 'Q140287622',
        orcid: researchProfile.orcid.replace('https://orcid.org/', ''),
        irimc_license_number: regulatoryIdentity.irimc.medicalCouncilNumber,
        irimc_profile: regulatoryIdentity.irimc.url,
        mojavez_track: regulatoryIdentity.mojavez.url
      },
      research: {
        orcid: researchProfile.orcid,
        bibliographyUrl: researchProfile.bibliographyUrl,
        publicationIdentifiers: researchProfile.publications.map((item) => ({
          doi: item.doi,
          pmid: item.pmid,
          pmcid: item.pmcid,
          url: item.url || item.pubmed,
          reviewReport: item.reviewReport || null
        }))
      }
    },
    clinic: {
      name_fa: site.nameFa,
      name_en: site.nameEn,
      canonicalPage: absoluteUrl(site.pages.clinic),
      sameAs: getSameAsForEntity(authoritySignals, 'clinic', site.sameAs.clinic),
      location: {
        address: location.canonicalAddressFa,
        streetAddress: location.streetAddressFa,
        addressLocality: location.addressLocality,
        addressRegion: location.addressRegion,
        postalCode: location.postalCode,
        addressCountry: location.addressCountry,
        telephone: location.telephone,
        priceRange: location.priceRange,
        googleMaps: location.googleMapsCid,
        googleMapsPlace: location.googleMapsPlace,
        openStreetMap: location.openStreetMap,
        mapProfiles: getUrlsByUse(authoritySignals, 'clinic', 'hasMap'),
        latitude: location.geo.latitude,
        longitude: location.geo.longitude
      },
      googleMapsReputation
    },
    knowledgeGraph: {
      sameAs: getSameAsForEntity(authoritySignals, 'knowledgeGraph', site.sameAs.kg)
    },
    regulatory: regulatoryIdentity,
    dataset: publicDataset,
    servicePages: services.map((service) => ({
      key: service.key,
      slug: service.slug,
      title: service.title,
      canonicalUrl: absoluteUrl(`/${service.slug}/`),
      robots: 'index,follow',
      bestIntentAnchor: absoluteUrl(`/${service.slug}/#${service.bestIntentAnchor}`),
      bestIntentTitle: service.bestIntentTitle,
      intentExamples: service.intentExamples,
      taxonomy: serviceTaxonomy[service.key] || null
    })),
    authorityPolicy: authoritySignalPolicy,
    authoritySignals,
    machineAssets: {
      sitemap: absoluteUrl('/sitemap.xml'),
      robots: absoluteUrl('/robots.txt'),
      llms: absoluteUrl('/llms.txt'),
      services: absoluteUrl('/services.json'),
      serviceTaxonomy: absoluteUrl('/service-taxonomy.json'),
      sameAs: absoluteUrl('/sameas.json'),
      location: absoluteUrl('/location.json'),
      research: absoluteUrl('/research.json'),
      dataset: absoluteUrl('/dataset.json'),
      authoritySignals: absoluteUrl('/authority-signals.json'),
      profileLinks: absoluteUrl('/profile-links.json'),
      aiDiscovery: absoluteUrl('/ai-discovery-index.json'),
      graph: absoluteUrl('/graph-ghezelbaash-final.jsonld'),
      pageContext: absoluteUrl('/page-context.json'),
      linkGraph: absoluteUrl('/link-graph.json'),
      entityHardening: absoluteUrl('/entity-hardening-index.json'),
      nap: absoluteUrl('/nap.csv')
    }
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
