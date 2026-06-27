import { site } from '../data/site.mjs';
import { services } from '../data/services.mjs';
import { pageContexts } from '../lib/pageContext.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.seo_aeo_index.astro.v1',
    dateModified: '2026-06-27',
    canonicalWebsite: site.canonicalBase + '/',
    purpose: 'Machine-readable SEO and AEO route index for the Astro site.',
    conversionTargets: {
      instagram: site.instagram,
      phone: site.phoneE164,
      contactPage: site.pages.contact,
      maps: site.mapsCid
    },
    intentFamilies: [
      'service + Kermanshah',
      'doctor + service + Kermanshah',
      'clinic + service + Kermanshah',
      'بهترین + خدمت + کرمانشاه',
      'بهترین دکتر + خدمت + کرمانشاه',
      'بهترین کلینیک + خدمت + کرمانشاه'
    ],
    routes: pageContexts.map((context) => ({
      path: context.path,
      url: context.url,
      label: context.label,
      kind: context.kind,
      priority: context.priority,
      schemaTargets: context.schemaTargets,
      localIntent: context.localIntent,
      serviceSlug: context.serviceSlug,
      conversionTarget: context.conversionTarget
    })),
    services: services.map((service) => ({
      key: service.key,
      slug: service.slug,
      title: service.title,
      shortTitle: service.shortTitle,
      bestIntentAnchor: service.bestIntentAnchor,
      targetIntents: service.intentExamples
    }))
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
