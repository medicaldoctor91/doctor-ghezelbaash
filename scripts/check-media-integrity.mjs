import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const media = resolve(root, 'Media');
const files = [
  ...readdirSync(media)
    .filter((file) => file.endsWith('.mp4'))
    .map((file) => resolve(media, file)),
  ...readdirSync(resolve(media, 'webm'))
    .filter((file) => file.endsWith('.webm'))
    .map((file) => resolve(media, 'webm', file)),
].sort();

const results = files.map((file) => {
  const verification = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-xerror', '-i', file, '-map', '0:v:0', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const probe = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height:format=duration',
      '-of',
      'json',
      file,
    ],
    { encoding: 'utf8' },
  );
  const metadata = probe.status === 0 ? JSON.parse(probe.stdout) : {};
  const stream = metadata.streams?.[0] ?? {};
  const buffer = readFileSync(file);
  return {
    file: file.replace(`${media}/`, '').replaceAll('\\', '/'),
    bytes: statSync(file).size,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    durationSeconds: Number(metadata.format?.duration ?? 0),
    width: Number(stream.width ?? 0),
    height: Number(stream.height ?? 0),
    valid: verification.status === 0,
    error:
      verification.status === 0
        ? null
        : verification.stderr
            .trim()
            .split('\n')
            .slice(0, 6)
            .map((line) => line.replace(/0x[0-9a-f]+/giu, '0xADDR')),
  };
});

for (const master of results.filter((result) => result.file.endsWith('.mp4'))) {
  const alternative = results.find(
    (result) => result.file === `webm/${master.file.replace(/\.mp4$/u, '.webm')}`,
  );
  if (!alternative) continue;
  const durationDelta = Math.abs(master.durationSeconds - alternative.durationSeconds);
  const dimensionsMatch =
    master.width === alternative.width && master.height === alternative.height;
  if (durationDelta > 0.5 || !dimensionsMatch) {
    alternative.valid = false;
    alternative.error = [
      ...(alternative.error ?? []),
      ...(durationDelta > 0.5
        ? [
            `Duration mismatch against MP4 master: ${alternative.durationSeconds.toFixed(3)}s vs ${master.durationSeconds.toFixed(3)}s.`,
          ]
        : []),
      ...(!dimensionsMatch
        ? [
            `Dimension mismatch against MP4 master: ${alternative.width}x${alternative.height} vs ${master.width}x${master.height}.`,
          ]
        : []),
    ];
  }
}

writeFileSync(
  resolve(media, 'media-integrity.json'),
  `${JSON.stringify(
    {
      verifier: 'ffmpeg -xerror full video decode',
      files: results,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

const failed = results.filter((result) => !result.valid);
process.stdout.write(`Media integrity: ${results.length - failed.length}/${results.length} passed.\n`);
if (failed.length > 0) {
  process.stderr.write(`${failed.map((result) => `FAIL Media/${result.file}`).join('\n')}\n`);
  process.exitCode = 1;
}
