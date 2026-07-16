import type { AssetManifest } from './graph.ts';
import { videos as videoDefinitions } from '../data/videos.ts';

const xmlEscape = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export const buildSitemap = (assets: AssetManifest): string => {
  const images = Object.values(assets.images)
    .map((asset) => asset.webp ?? asset.fallback ?? asset.avif)
    .filter((url): url is string => Boolean(url))
    .map(
      (url) =>
        `    <image:image><image:loc>${xmlEscape(new URL(url, 'https://www.ghezelbaash.ir/').href)}</image:loc></image:image>`,
    );
  const videos = Object.entries(assets.videos).flatMap(([id, asset]) => {
    if (!asset.mp4 || !asset.poster) return [];
    const definition = videoDefinitions.find((video) => video.id === id);
    const title = definition?.title ?? id;
    const description = definition?.description ?? title;
    return [
      `    <video:video><video:thumbnail_loc>${xmlEscape(new URL(asset.poster, 'https://www.ghezelbaash.ir/').href)}</video:thumbnail_loc><video:title>${xmlEscape(title)}</video:title><video:description>${xmlEscape(description)}</video:description><video:content_loc>${xmlEscape(new URL(asset.mp4, 'https://www.ghezelbaash.ir/').href)}</video:content_loc></video:video>`,
    ];
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  <url>
    <loc>https://www.ghezelbaash.ir/</loc>
${[...images, ...videos].join('\n')}
  </url>
</urlset>
`;
};
