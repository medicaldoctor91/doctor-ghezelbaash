import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { videos } from '../src/domain/media.mjs';

const root = process.cwd();
const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
const layout = readFileSync(join(root, 'src/layouts/SiteLayout.astro'), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const attr = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'iu'))?.[1] ?? null;

const videoTags = [...html.matchAll(/<video\b[^>]*data-deferred-poster[^>]*>/giu)].map((match) => match[0]);
check(videoTags.length === videos.length, `deferred video tag count ${videoTags.length}/${videos.length}`);
check(!/<video\b[^>]*poster="\/videos\/thumbnails\//iu.test(html), 'a real video thumbnail remains in an initial poster attribute');
check(layout.includes("querySelectorAll('video[data-deferred-poster][data-poster]')"), 'global deferred poster selector is missing');
check(layout.includes("rootMargin: '1000px 0px'"), 'poster activation distance is missing');
check(layout.includes('video.poster = poster'), 'poster activation assignment is missing');
check(layout.includes("'IntersectionObserver' in window"), 'poster activation fallback is missing');

for (const video of videos) {
  const figureStart = html.indexOf(`id="video-${video.id}"`);
  const figureEnd = html.indexOf('</figure>', figureStart);
  const figure = figureStart >= 0 && figureEnd > figureStart ? html.slice(figureStart, figureEnd + 9) : '';
  const videoTag = figure.match(/<video\b[^>]*>/iu)?.[0] ?? '';
  const poster = attr(videoTag, 'poster');
  const deferredPoster = attr(videoTag, 'data-poster');
  check(Boolean(figure), `${video.id}: figure is missing`);
  check(poster?.startsWith('data:image/svg+xml,'), `${video.id}: placeholder poster is not inline SVG data`);
  check(deferredPoster === video.thumbnail, `${video.id}: data-poster differs from the canonical thumbnail`);
  check(/\bdata-deferred-poster(?:\s|>)/iu.test(videoTag), `${video.id}: data-deferred-poster marker is missing`);
  check(attr(videoTag, 'preload') === 'none', `${video.id}: preload must remain none`);
  const noscript = figure.match(/<noscript>([\s\S]*?)<\/noscript>/iu)?.[1] ?? '';
  check(noscript.includes(`src="${video.thumbnail}"`), `${video.id}: no-JavaScript thumbnail fallback is missing`);
  check(noscript.includes('loading="lazy"'), `${video.id}: no-JavaScript thumbnail fallback is not lazy`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', stage: 11, contract: 'deferred-video-posters', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  stage: 11,
  contract: 'deferred-video-posters',
  videos: videos.length,
  initialRealPosterRequests: 0,
  inlinePlaceholderPosters: videos.length,
  noScriptFallbacks: videos.length,
  activationRootMargin: '1000px',
}, null, 2));
