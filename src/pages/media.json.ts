import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { site } from '../data/site';
import { readMediaChapters } from '../lib/media';
// @ts-expect-error Shared canonical URL registry.
import { videoEntityId, videoWebPageId } from '../domain/url-architecture.mjs';
// @ts-expect-error Shared ESM media data.
import { galleryImages, videos } from '../data/media.mjs';

export const prerender = true;

const fileRecord = (relativePath: string) => {
  const absolutePath = join(process.cwd(), 'public', relativePath.replace(/^\//, ''));
  const buffer = readFileSync(absolutePath);
  return {
    url: `${site.url}${relativePath.replace(/^\//, '')}`,
    bytes: statSync(absolutePath).size,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
};

export function GET() {
  const images = galleryImages.map((image: { id: string; base: string; widths: number[]; width: number; height: number; alt: string; caption: string }) => ({
    ...image,
    entityId: `${site.url}#image-${image.id}`,
    creator: `${site.url}#person`,
    copyrightHolder: `${site.url}#person`,
    variants: image.widths.flatMap((width) => [
      fileRecord(`/images/responsive/${image.base}-${width}.avif`),
      fileRecord(`/images/responsive/${image.base}-${width}.webp`),
      ...(width >= 1200 || image.width < 1200 ? [`/images/responsive/${image.base}-${width}.jpg`] : [])
        .filter((path) => {
          try { statSync(join(process.cwd(), 'public', path.replace(/^\//, ''))); return true; } catch { return false; }
        })
        .map(fileRecord),
    ]),
  }));
  const videoRecords = videos.map((video: { id: string; file: string; thumbnail: string; chapterTrack?: string }) => ({
    ...video,
    entityId: videoEntityId(site.url, video.id),
    mainEntityOfPage: videoWebPageId(site.url, video.id),
    creator: `${site.url}#person`,
    publisher: `${site.url}#clinic`,
    videoFile: fileRecord(`/videos/${video.file}`),
    thumbnailFile: fileRecord(video.thumbnail),
    ...(video.chapterTrack ? { chapterFile: fileRecord(video.chapterTrack), chapters: readMediaChapters(video.chapterTrack) } : { chapters: [] }),
    ownershipStatus: 'first-party-site-asset',
    uploadDateStatus: 'not-published-without-verified-date',
    transcriptStatus: video.chapterTrack ? 'chapter-track-and-visible-contextual-summary' : 'visible-contextual-summary-only',
  }));
  return new Response(JSON.stringify({
    schemaVersion: '6.0',
    canonical: site.url,
    updated: site.dateModified,
    imageCount: images.length,
    videoCount: videoRecords.length,
    images,
    videos: videoRecords,
  }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
