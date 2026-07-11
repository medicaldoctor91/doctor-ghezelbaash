import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error Canonical ESM media catalogue.
import { videos } from '~/domain/media.mjs';
import { site } from '~/domain/entities';
import { jsonlResponse } from '~/compilers/utils';

export const prerender = true;
const parse = (value: string) => value.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !/^WEBVTT|^NOTE|^\d+$|^\d\d:\d\d/.test(line)).join(' · ').trim();
export function GET() {
  return jsonlResponse(videos.map((video: any) => ({
    id: `transcript-${video.id}`,
    videoId: video.id,
    watchUrl: `${site.url}videos/${video.id}/`,
    language: 'fa-IR',
    recordType: 'chapter-summary',
    transcriptStatus: 'not-verbatim',
    reviewStatus: 'doctor-reviewed-editorial-summary',
    text: parse(readFileSync(join(process.cwd(), 'public', video.chapterTrack.replace(/^\//, '')), 'utf8')),
  })));
}

