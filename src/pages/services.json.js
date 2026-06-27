import { site, absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.service_architecture.astro.v1',
    dateModified: '2026-06-27',
    canonicalWebsite: site.canonicalBase + '/',
    stage: 'astro-migration-indexable-services',
    indexingPolicy: {
      servicePages: 'index,follow',
      includeServicePagesInSitemap: true,
      doNotCreateStandaloneSupportingConceptPagesYet: [
        'central-lip-lift-kermanshah',
        'fat-injection-kermanshah'
      ]
    },
    parentServicePages: services.map((service) => ({
      key: service.key,
      slug: service.slug,
      title: service.title,
      description: service.description,
      url: absoluteUrl(`/${service.slug}/`),
      robots: 'index,follow',
      bestIntentAnchor: absoluteUrl(`/${service.slug}/#${service.bestIntentAnchor}`),
      bestIntentTitle: service.bestIntentTitle,
      intentExamples: service.intentExamples
    }))
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
