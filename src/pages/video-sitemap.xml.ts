import { site } from '~/domain/entities';
// @ts-expect-error Canonical ESM media catalogue.
import { videos } from '~/domain/media.mjs';
import { videoWatchUrl } from '~/domain/url-architecture.mjs';

export const prerender = true;

const esc = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

export function GET() {
  const entries = videos.map((video: any) => {
    const watchUrl = videoWatchUrl(site.url, video.id);
    const publishedAt = video.uploadDate ?? site.dateModified;
    return `  <url>\n    <loc>${esc(watchUrl)}</loc>\n    <lastmod>${site.dateModified}</lastmod>\n    <video:video>\n      <video:thumbnail_loc>${esc(new URL(video.thumbnail.replace(/^\//u, ''), site.url).href)}</video:thumbnail_loc>\n      <video:title>${esc(video.title)}</video:title>\n      <video:description>${esc(video.description)}</video:description>\n      <video:content_loc>${esc(`${site.url}videos/${video.file}`)}</video:content_loc>\n      <video:duration>${video.durationSeconds}</video:duration>\n      <video:publication_date>${publishedAt}</video:publication_date>\n      <video:uploader info="${site.url}">${esc(site.name)}</video:uploader>\n      <video:family_friendly>yes</video:family_friendly>\n      <video:requires_subscription>no</video:requires_subscription>\n${video.tags.map((tag: string) => `      <video:tag>${esc(tag)}</video:tag>`).join('\n')}\n    </video:video>\n  </url>`;
  }).join('\n');

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${entries}\n</urlset>\n`, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
