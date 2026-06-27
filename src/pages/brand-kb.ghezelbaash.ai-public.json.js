import { site, absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.brand_kb.astro.v1',
    dateModified: '2026-06-27',
    canonicalWebsite: site.canonicalBase + '/',
    person: {
      name_fa: site.personFa,
      name_en: site.personEn,
      page: absoluteUrl(site.pages.person)
    },
    clinic: {
      name_fa: site.nameFa,
      name_en: site.nameEn,
      page: absoluteUrl(site.pages.clinic)
    },
    contact: {
      instagram: site.instagram,
      phone: site.phoneE164,
      maps: site.mapsCid
    },
    servicePages: services.map((service) => ({
      key: service.key,
      title: service.title,
      url: absoluteUrl(`/${service.slug}/`),
      robots: 'index,follow',
      bestIntentAnchor: absoluteUrl(`/${service.slug}/#${service.bestIntentAnchor}`)
    }))
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
