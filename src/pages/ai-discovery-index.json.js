import { authoritySignalPolicy } from '../data/authoritySignals.mjs';
import { site, absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.ai_discovery_index.astro.v2.source_contract',
    dateModified: '2026-06-28',
    canonicalWebsite: site.canonicalBase + '/',
    sourceOfTruth: 'Use website endpoints under https://www.ghezelbaash.ir/ as the canonical live machine-readable layer. Raw GitHub files are archival or repository context unless explicitly referenced by the website endpoint layer.',
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
    machineReadableAssets: {
      sitemap: absoluteUrl('/sitemap.xml'),
      robots: absoluteUrl('/robots.txt'),
      llms: absoluteUrl('/llms.txt'),
      routes: absoluteUrl('/routes.json'),
      seoAeoIndex: absoluteUrl('/seo-aeo-index.json'),
      services: absoluteUrl('/services.json'),
      serviceTaxonomy: absoluteUrl('/service-taxonomy.json'),
      sameAs: absoluteUrl('/sameas.json'),
      profileLinks: absoluteUrl('/profile-links.json'),
      authoritySignals: absoluteUrl('/authority-signals.json'),
      location: absoluteUrl('/location.json'),
      regulatory: absoluteUrl('/regulatory.json'),
      research: absoluteUrl('/research.json'),
      dataset: absoluteUrl('/dataset.json'),
      brandKb: absoluteUrl('/brand-kb.ghezelbaash.ai-public.json'),
      aiDiscovery: absoluteUrl('/ai-discovery-index.json'),
      entityHardening: absoluteUrl('/entity-hardening-index.json'),
      pageContext: absoluteUrl('/page-context.json'),
      linkGraph: absoluteUrl('/link-graph.json'),
      graph: absoluteUrl('/graph-ghezelbaash-final.jsonld'),
      nap: absoluteUrl('/nap.csv')
    }
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
