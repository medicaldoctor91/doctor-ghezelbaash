import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type MediaChapter = {
  index: number;
  name: string;
  startOffset: number;
  endOffset: number;
  startTimestamp: string;
  endTimestamp: string;
};

function seconds(timestamp: string) {
  const parts = timestamp.split(':').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  return Math.round((parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000) / 1000;
}

export function readMediaChapters(chapterTrack?: string): MediaChapter[] {
  if (!chapterTrack) return [];
  const absolute = join(process.cwd(), 'public', chapterTrack.replace(/^\//, ''));
  const raw = readFileSync(absolute, 'utf8');
  const blocks = raw.replace(/^WEBVTT\s*/u, '').trim().split(/\n\s*\n/u);
  return blocks.flatMap((block) => {
    const lines = block.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex < 0) return [];
    const [startTimestamp, endTimestamp] = lines[timingIndex].split('-->').map((value) => value.trim());
    const name = lines.slice(timingIndex + 1).join(' ').trim();
    if (!name) return [];
    return [{
      name,
      startOffset: seconds(startTimestamp),
      endOffset: seconds(endTimestamp),
      startTimestamp,
      endTimestamp,
    }];
  }).map((chapter, index) => ({ ...chapter, index: index + 1 }));
}
