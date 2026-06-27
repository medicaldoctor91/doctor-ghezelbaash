import { routeRegistry, priorityForPath } from '../lib/routes.mjs';

const urls = [...new Map(routeRegistry.map((route) => [route.path, route])).values()];

function renderUrl(route) {
  return `  <url>\n    <loc>${route.url}</loc>\n    <lastmod>2026-06-27</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priorityForPath(route.path)}</priority>\n  </url>`;
}

export function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(renderUrl).join('\n')}\n</urlset>\n`;
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8'
    }
  });
}
