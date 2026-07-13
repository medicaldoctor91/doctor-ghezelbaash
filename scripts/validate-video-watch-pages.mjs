import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { videos } from '../src/domain/media.mjs';
import {
  videoClipId,
  videoEntityId,
  videoWatchPath,
  videoWatchUrl,
  videoWebPageId,
} from '../src/domain/url-architecture.mjs';

const root = join(process.cwd(), 'dist');
const site = 'https://www.ghezelbaash.ir/';
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const asArray = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];
const timezoneDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

const homepage = readFileSync(join(root, 'index.html'), 'utf8');
const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
const videoSitemap = readFileSync(join(root, 'video-sitemap.xml'), 'utf8');
const titles = new Set();
let totalBytes = 0;
let eligibleClipPages = 0;

check(!existsSync(join(root, 'videos', 'index.html')), 'standalone /videos/ index page is forbidden');

for (const video of videos) {
  const watchPath = videoWatchPath(video.id);
  const watchUrl = videoWatchUrl(site, video.id);
  const filePath = join(root, watchPath.replace(/^\//u, ''), 'index.html');
  check(existsSync(filePath), `${video.id}: watch page missing at ${watchPath}`);
  if (!existsSync(filePath)) continue;

  const html = readFileSync(filePath, 'utf8');
  totalBytes += statSync(filePath).size;
  check((html.match(/<h1\b/giu) ?? []).length === 1, `${video.id}: watch page must contain one h1`);
  check((html.match(/<video\b/giu) ?? []).length === 1, `${video.id}: watch page must contain one primary video`);
  check((html.match(/<source\b[^>]*type="video\/mp4"/giu) ?? []).length === 1, `${video.id}: MP4 source missing`);
  check(html.includes(`src="/videos/${video.file}"`), `${video.id}: watch page points to wrong MP4`);
  check(html.includes(`poster="${video.thumbnail}"`), `${video.id}: watch page thumbnail missing`);
  check(html.includes(`<link rel="canonical" href="${watchUrl}"`), `${video.id}: canonical watch URL missing`);
  check(homepage.includes(`href="${watchPath}"`), `${video.id}: homepage does not link to watch page`);
  check(sitemap.includes(`<loc>${watchUrl}</loc>`), `${video.id}: main sitemap entry missing`);
  check(videoSitemap.includes(`<loc>${watchUrl}</loc>`), `${video.id}: video sitemap watch-page loc missing`);
  check(videoSitemap.includes(`<video:content_loc>${site}videos/${video.file}</video:content_loc>`), `${video.id}: video sitemap content_loc missing`);

  const jsonLdMatches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gu)];
  check(jsonLdMatches.length === 1, `${video.id}: expected one inline JSON-LD block; found ${jsonLdMatches.length}`);
  if (jsonLdMatches.length !== 1) continue;

  const graph = JSON.parse(jsonLdMatches[0][1]);
  const nodes = graph['@graph'] ?? [];
  const page = nodes.find((node) => node['@id'] === videoWebPageId(site, video.id));
  const videoNode = nodes.find((node) => node['@id'] === videoEntityId(site, video.id));
  const clipNodes = nodes.filter((node) => asArray(node['@type']).includes('Clip'));
  const videoObjects = nodes.filter((node) => asArray(node['@type']).includes('VideoObject'));

  check(videoObjects.length === 1, `${video.id}: watch graph must contain exactly one VideoObject`);
  check(Boolean(page), `${video.id}: watch WebPage node missing`);
  check(Boolean(videoNode), `${video.id}: VideoObject node missing`);
  check(page?.mainEntity?.['@id'] === videoEntityId(site, video.id), `${video.id}: WebPage.mainEntity must be VideoObject`);
  check(videoNode?.mainEntityOfPage?.['@id'] === videoWebPageId(site, video.id), `${video.id}: VideoObject.mainEntityOfPage mismatch`);
  check(videoNode?.name === video.title, `${video.id}: VideoObject name mismatch`);
  check(asArray(videoNode?.thumbnailUrl).includes(`${site}${video.thumbnail.replace(/^\//u, '')}`), `${video.id}: VideoObject thumbnailUrl missing`);
  check(timezoneDateTime.test(videoNode?.uploadDate ?? ''), `${video.id}: uploadDate must be timezone-aware`);
  check(videoNode?.duration === video.duration, `${video.id}: duration mismatch`);
  check(videoNode?.contentUrl === `${site}videos/${video.file}`, `${video.id}: contentUrl mismatch`);
  check(videoNode?.url === watchUrl, `${video.id}: VideoObject URL must be watch page`);
  check(videoNode?.potentialAction?.['@type'] === 'SeekToAction', `${video.id}: SeekToAction missing`);

  if (video.durationSeconds >= 30) {
    eligibleClipPages += 1;
    check(clipNodes.length === 3, `${video.id}: eligible video must expose three Clip nodes`);
    check(asArray(videoNode?.hasPart).length === 3, `${video.id}: eligible VideoObject must reference three clips`);
    clipNodes.forEach((clip, index) => {
      check(clip['@id'] === videoClipId(site, video.id, index + 1), `${video.id}: Clip @id mismatch at ${index + 1}`);
      check(typeof clip.url === 'string' && clip.url.startsWith(`${watchUrl}?t=`), `${video.id}: Clip URL must use watch-page ?t= deep link`);
      check(clip.isPartOf?.['@id'] === videoEntityId(site, video.id), `${video.id}: Clip.isPartOf mismatch`);
    });
  } else {
    check(clipNodes.length === 0, `${video.id}: videos under 30 seconds must not claim Clip eligibility`);
    check(asArray(videoNode?.hasPart).length === 0, `${video.id}: short VideoObject must not reference Clip nodes`);
  }

  const titleMatch = html.match(/<title>([^<]+)<\/title>/iu)?.[1];
  check(Boolean(titleMatch), `${video.id}: document title missing`);
  if (titleMatch) {
    check(!titles.has(titleMatch), `${video.id}: duplicate watch-page title: ${titleMatch}`);
    titles.add(titleMatch);
  }
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  watchPages: videos.length,
  primaryVideos: videos.length,
  eligibleClipPages,
  shortVideosWithoutClips: videos.length - eligibleClipPages,
  uniqueTitles: titles.size,
  totalWatchPageBytes: totalBytes,
  averageWatchPageBytes: Math.round(totalBytes / videos.length),
}, null, 2));
