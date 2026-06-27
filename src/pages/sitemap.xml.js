import { site, absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';

const staticPaths = [
  '/',
  site.pages.person,
  site.pages.clinic,
  site.pages.services,
  ...services.map((service) => `/${service.slug}/`),
  site.pages.contact,
  site.pages.evidence,
  site.pages.kg,
  '/aesthetic-medicine-dataset.html',
  '/google-maps-review-evidence.html'
];

const urls = [...new Set(staticPaths)];
const servicePaths = new Set(services.map((service) => `/${service.slug}/`));

function priorityForPath(path) {
  if (path === '/') return '1.0';
  if (path === site.pages.person) return '0.95';
  if (path === site.pages.clinic || path === site.pages.services) return '0.90';
  if (servicePaths.has(path)) return '0.86';
  if (path === site.pages.contact) return '0.80';
  if (path === site.pages.evidence || path === site.pages.kg) return '0.72';
  return '0.60';
}

function renderUrl(path) {
  return `  <url>\n    <loc>${absoluteUrl(path)}</loc>\n    <lastmod>2026-06-27</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priorityForPath(path)}</priority>\n  </url>`;
}

export function GET() {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(renderUrl).join('\n')}\n</urlset>\n`;
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8'
    }
  });
}
