import { site } from '../data/site.mjs';
import { services } from '../data/services.mjs';
import { routeRegistry } from '../lib/routes.mjs';

function schemaTargetsForRoute(route) {
  if (route.kind === 'person') return ['WebPage', 'BreadcrumbList', 'Person', 'Physician'];
  if (route.kind === 'clinic') return ['WebPage', 'BreadcrumbList', 'MedicalBusiness', 'LocalBusiness', 'Person'];
  if (route.kind === 'services-hub') return ['WebPage', 'BreadcrumbList', 'ItemList'];
  if (route.kind === 'service') return ['WebPage', 'BreadcrumbList', 'Service', 'FAQPage'];
  return ['WebPage', 'BreadcrumbList'];
}

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
    routes: routeRegistry.map((route) => ({
      path: route.path,
      url: route.url,
      label: route.label,
      kind: route.kind,
      priority: route.priority,
      schemaTargets: schemaTargetsForRoute(route),
      localIntent: ['person', 'clinic', 'services-hub', 'service', 'contact'].includes(route.kind),
      serviceSlug: route.service?.slug || null,
      conversionTarget: route.kind === 'service' ? site.instagram : site.pages.contact
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
