import { authoritySignalPolicy } from '../data/authoritySignals.mjs';
import { site, absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';
import { machineAssetUrlMap } from '../lib/machineAssets.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.ai_discovery_index.astro.v3.machine_asset_projection',
    dateModified: '2026-06-28',
    canonicalWebsite: site.canonicalBase + '/',
    primaryGraph: absoluteUrl('/graph-ghezelbaash-final.jsonld'),
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
    authorityPolicy: authoritySignalPolicy,
    servicePages: services.map((service) => ({
      title: service.title,
      url: absoluteUrl(`/${service.slug}/`),
      robots: 'index,follow',
      bestIntentAnchor: absoluteUrl(`/${service.slug}/#${service.bestIntentAnchor}`),
      intentExamples: service.intentExamples
    })),
    machineReadableAssets: machineAssetUrlMap()
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
