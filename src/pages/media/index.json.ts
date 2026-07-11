import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error Canonical ESM media catalogue.
import { galleryImages, videos } from '~/domain/media.mjs';
import { site } from '~/domain/entities';
import { jsonResponse } from '~/compilers/utils';

export const prerender = true;
const record = (path: string) => {
  const file = join(process.cwd(), 'public', path.replace(/^\//, ''));
  const value = readFileSync(file);
  return { url: new URL(path.replace(/^\//, ''), site.url).href, bytes: statSync(file).size, sha256: createHash('sha256').update(value).digest('hex') };
};
export function GET() {
  return jsonResponse({
    schemaVersion: '8.1',
    canonical: site.url,
    images: galleryImages.map((image: any) => ({ ...image, entityId: `${site.url}#image-${image.id}` })),
    videos: videos.map((video: any) => ({
      ...video,
      watchUrl: `${site.url}videos/${video.id}/`,
      videoFile: record(`/videos/${video.file}`),
      thumbnailFile: record(video.thumbnail),
      chapterFile: record(video.chapterTrack),
      transcriptStatus: 'editorial-summary-only-no-verbatim-transcript',
    })),
  });
}

