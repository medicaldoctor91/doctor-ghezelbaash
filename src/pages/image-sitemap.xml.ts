import { site } from '~/domain/entities';
import { galleryImages, videos } from '~/domain/media.mjs';
import { videoWatchUrl } from '~/domain/url-architecture.mjs';

export const prerender = true;

const esc = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

export function GET() {
  const homepageImages = [
    ...galleryImages.map((image: { base: string; width: number }) =>
      `${site.url}images/responsive/${image.base}-${image.width >= 1200 ? 1200 : image.width}.jpg`),
    ...videos.map((video: { thumbnail: string }) => `${site.url}${video.thumbnail.slice(1)}`),
  ];

  const homepageEntry = `  <url>\n    <loc>${site.url}</loc>\n${homepageImages
    .map((loc) => `    <image:image>\n      <image:loc>${esc(loc)}</image:loc>\n    </image:image>`)
    .join('\n')}\n  </url>`;

  const watchEntries = videos.map((video: any) => `  <url>\n    <loc>${esc(videoWatchUrl(site.url, video.id))}</loc>\n    <image:image>\n      <image:loc>${esc(`${site.url}${video.thumbnail.slice(1)}`)}</image:loc>\n      <image:title>${esc(video.title)}</image:title>\n    </image:image>\n  </url>`).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${homepageEntry}\n${watchEntries}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
