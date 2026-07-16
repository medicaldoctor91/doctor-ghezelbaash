import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { brandSources, images } from '../data/images.ts';
import { videos } from '../data/videos.ts';

export const validateMediaInputs = (root = process.cwd()): string[] => {
  const errors: string[] = [];
  const integrityPath = resolve(root, 'Media/media-integrity.json');
  const integrity = existsSync(integrityPath)
    ? JSON.parse(readFileSync(integrityPath, 'utf8'))
    : { files: [] };
  const integrityByFile = new Map(
    integrity.files.map((entry: { file: string }) => [entry.file, entry]),
  );
  const fontPath = resolve(root, 'Media/persian.woff2');
  if (!existsSync(fontPath)) {
    errors.push('Missing self-hosted Persian font: Media/persian.woff2');
  } else {
    const fontBytes = statSync(fontPath).size;
    if (fontBytes < 80_000 || fontBytes > 180_000) {
      errors.push(`Persian WOFF2 must be 80–180KB; found ${fontBytes} bytes.`);
    }
  }
  for (const image of images) {
    if (!existsSync(resolve(root, 'Media', image.sourceFile))) {
      errors.push(`Missing source image: Media/${image.sourceFile}`);
    }
  }
  for (const source of Object.values(brandSources)) {
    if (!existsSync(resolve(root, 'Media', source))) {
      errors.push(`Missing brand source: Media/${source}`);
    }
  }
  for (const video of videos) {
    const webmFile = `webm/${video.sourceFile.replace(/\.mp4$/u, '.webm')}`;
    const posterFile = `posters/${video.sourceFile.replace(/\.mp4$/u, '.webp')}`;
    for (const path of [
      video.sourceFile,
      webmFile,
      video.thumbnailFile,
      posterFile,
      video.captionFile,
      video.transcriptFile,
    ]) {
      const fullPath = resolve(root, 'Media', path);
      if (!existsSync(fullPath)) {
        errors.push(`Missing video input: Media/${path}`);
        continue;
      }
      if (path.endsWith('.mp4') || path.endsWith('.webm')) {
        const entry = integrityByFile.get(path) as
          | { valid: boolean; sha256: string; error?: string[] }
          | undefined;
        const digest = createHash('sha256').update(readFileSync(fullPath)).digest('hex');
        if (!entry || entry.sha256 !== digest) {
          errors.push(`Missing or stale media-integrity record: Media/${path}`);
        } else if (!entry.valid) {
          errors.push(`Failed media-integrity verification: Media/${path}`);
        }
      }
      if (path.endsWith('.vtt')) {
        const vtt = readFileSync(fullPath, 'utf8');
        if (!vtt.startsWith('WEBVTT') || vtt.includes('NOTE فصل‌بندی')) {
          errors.push(`Invalid caption VTT: Media/${path}`);
        }
      }
      if (path.endsWith('.md')) {
        const transcript = readFileSync(fullPath, 'utf8');
        if (transcript.includes('TODO_VISIBLE_CONTENT') || transcript.trim().length < 20) {
          errors.push(`Invalid transcript: Media/${path}`);
        }
      }
    }
  }
  return errors;
};
