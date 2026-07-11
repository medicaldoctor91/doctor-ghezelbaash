import { site } from '~/domain/entities';
import { galleryImages, videos } from '~/domain/media.mjs';

export const prerender = true;

const esc = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

export function GET() {
  const images = [
    ...galleryImages.map((image: { base: string; width: number }) =>
      `${site.url}images/responsive/${image.base}-${image.width >= 1200 ? 1200 : image.width}.jpg`),
    ...videos.map((video: { thumbnail: string }) => `${site.url}${video.thumbnail.slice(1)}`),
  ];
  const entries = images
    .map((loc) => `    <image:image>\n      <image:loc>${esc(loc)}</image:loc>\n    </image:image>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n  <url>\n    <loc>${site.url}</loc>\n${entries}\n  </url>\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
