import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { SITE } from '~/site.config';
import { normalizeAeoDataDocument } from '~/utils/aeoDataEndpoint';

type VideoManifestEntry = {
  pageUrl?: string;
  watchPageUrl?: string;
  thumbnailUrl?: string;
  title?: string;
  description?: string;
  contentUrl?: string;
  duration?: string;
  durationSeconds?: number;
  dateAdded?: string;
  dateModified?: string;
  transcript?: string;
};

const escapeXml = (value: unknown): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const videoTag = (video: VideoManifestEntry): string => {
  const loc = video.watchPageUrl || video.pageUrl || `${SITE.site}/videos/`;
  const publicationDate = video.dateAdded || video.dateModified;
  const playerUrl = video.watchPageUrl ? `${video.watchPageUrl}#watch-video-player` : loc;

  return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <video:video>
      <video:thumbnail_loc>${escapeXml(video.thumbnailUrl)}</video:thumbnail_loc>
      <video:title>${escapeXml(video.title)}</video:title>
      <video:description>${escapeXml(video.description || video.transcript)}</video:description>
      <video:content_loc>${escapeXml(video.contentUrl)}</video:content_loc>
      <video:player_loc allow_embed="yes">${escapeXml(playerUrl)}</video:player_loc>
      ${Number.isFinite(video.durationSeconds) ? `<video:duration>${Math.round(video.durationSeconds ?? 0)}</video:duration>` : ''}
      ${publicationDate ? `<video:publication_date>${escapeXml(publicationDate)}</video:publication_date>` : ''}
      <video:family_friendly>yes</video:family_friendly>
      <video:live>no</video:live>
    </video:video>
  </url>`;
};

export const prerender = true;

export const GET: APIRoute = async () => {
  const manifest = await getEntry('aeoData', 'video-manifest');
  const manifestData = manifest
    ? normalizeAeoDataDocument('video-manifest', manifest.data as Record<string, any>)
    : undefined;
  const videos = Array.isArray(manifestData?.videos) ? (manifestData.videos as VideoManifestEntry[]) : [];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${videos.map(videoTag).join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
    },
  });
};
