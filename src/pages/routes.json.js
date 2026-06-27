import { site } from '../data/site.mjs';
import { routeRegistry } from '../lib/routes.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.routes.astro.v1',
    dateModified: '2026-06-27',
    canonicalWebsite: site.canonicalBase + '/',
    purpose: 'Machine-readable canonical route registry for SEO, AEO, crawl planning and entity graph consistency.',
    routes: routeRegistry.map((route) => ({
      path: route.path,
      url: route.url,
      label: route.label,
      kind: route.kind,
      priority: route.priority,
      serviceKey: route.service?.key || null,
      serviceSlug: route.service?.slug || null
    }))
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
