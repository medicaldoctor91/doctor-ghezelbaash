import { site, absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.ai_discovery_index.astro.v1',
    dateModified: '2026-06-27',
    canonicalWebsite: site.canonicalBase + '/',
    canonicalPages: {
      home: absoluteUrl('/'),
      person: absoluteUrl(site.pages.person),
      clinic: absoluteUrl(site.pages.clinic),
      services: absoluteUrl(site.pages.services),
      contact: absoluteUrl(site.pages.contact),
      evidence: absoluteUrl(site.pages.evidence),
      kg: absoluteUrl(site.pages.kg)
    },
    primaryConversion: {
      instagram: site.instagram,
      phone: site.phoneE164,
      googleMaps: site.mapsCid
    },
    servicePages: services.map((service) => ({
      title: service.title,
      url: absoluteUrl(`/${service.slug}/`),
      robots: 'index,follow',
      bestIntentAnchor: absoluteUrl(`/${service.slug}/#${service.bestIntentAnchor}`),
      intentExamples: service.intentExamples
    })),
    machineReadableAssets: {
      sitemap: absoluteUrl('/sitemap.xml'),
      llms: absoluteUrl('/llms.txt'),
      services: absoluteUrl('/services.json'),
      sameAs: absoluteUrl('/sameas.json'),
      nap: absoluteUrl('/nap.csv'),
      graph: absoluteUrl('/graph-ghezelbaash-final.jsonld')
    }
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
