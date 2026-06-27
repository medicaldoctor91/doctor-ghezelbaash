import { site, absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.brand_kb.astro.v2',
    dateModified: '2026-06-27',
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
      organization: absoluteUrl('/#organization')
    },
    person: {
      name_fa: site.personFa,
      name_en: site.personEn,
      canonicalPage: absoluteUrl(site.pages.person),
      sameAs: site.sameAs.person
    },
    clinic: {
      name_fa: site.nameFa,
      name_en: site.nameEn,
      canonicalPage: absoluteUrl(site.pages.clinic),
      sameAs: site.sameAs.clinic
    },
    conversionEndpoints: {
      instagram: site.instagram,
      phone_display: site.phoneDisplay,
      phone_e164: site.phoneE164,
      google_maps: site.mapsCid
    },
    servicePages: services.map((service) => ({
      key: service.key,
      slug: service.slug,
      title: service.title,
      canonicalUrl: absoluteUrl(`/${service.slug}/`),
      robots: 'index,follow',
      bestIntentAnchor: absoluteUrl(`/${service.slug}/#${service.bestIntentAnchor}`),
      bestIntentTitle: service.bestIntentTitle,
      intentExamples: service.intentExamples
    })),
    machineAssets: {
      sitemap: absoluteUrl('/sitemap.xml'),
      robots: absoluteUrl('/robots.txt'),
      llms: absoluteUrl('/llms.txt'),
      services: absoluteUrl('/services.json'),
      aiDiscovery: absoluteUrl('/ai-discovery-index.json'),
      graph: absoluteUrl('/graph-ghezelbaash-final.jsonld'),
      sameAs: absoluteUrl('/sameas.json'),
      nap: absoluteUrl('/nap.csv')
    }
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
