import { site } from '~/domain/entities';
// @ts-expect-error Canonical ESM media catalogue.
import { videos } from '~/domain/media.mjs';
import { videoWatchUrl } from '~/domain/url-architecture.mjs';

export const prerender = true;

export function GET() {
  const urls = [
    { loc: site.url, priority: '1.0' },
    ...videos.map((video: any) => ({ loc: videoWatchUrl(site.url, video.id), priority: '0.7' })),
  ];
  const body = urls
    .map((item) => `  <url><loc>${item.loc}</loc><lastmod>${site.dateModified}</lastmod><changefreq>weekly</changefreq><priority>${item.priority}</priority></url>`)
    .join('\n');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
