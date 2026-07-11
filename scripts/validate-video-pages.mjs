import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { videos } from '../src/domain/media.mjs';
import { videoPageDetails } from '../src/domain/video-pages.mjs';

const root = join(process.cwd(), 'dist');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

function parseVtt(raw) {
  const cues = [];
  const timing = /(\d\d):(\d\d):(\d\d)\.(\d{3})\s+-->\s+(\d\d):(\d\d):(\d\d)\.(\d{3})/g;
  for (const match of raw.matchAll(timing)) {
    const start = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
    const end = Number(match[5]) * 3600 + Number(match[6]) * 60 + Number(match[7]) + Number(match[8]) / 1000;
    cues.push({ start, end });
  }
  return cues;
}

function jsonLd(html, path) {
  const blocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  check(blocks.length === 1, `${path}: expected exactly one JSON-LD block, found ${blocks.length}`);
  if (!blocks[0]) return { '@graph': [] };
  try { return JSON.parse(blocks[0][1]); }
  catch (error) {
    failures.push(`${path}: invalid JSON-LD (${error.message})`);
    return { '@graph': [] };
  }
}

const hubPath = join(root, 'videos', 'index.html');
check(existsSync(hubPath), '/videos/ hub is missing');
if (existsSync(hubPath)) {
  const hubHtml = readFileSync(hubPath, 'utf8');
  const hubGraph = jsonLd(hubHtml, '/videos/');
  const hubTypes = (hubGraph['@graph'] ?? []).flatMap((node) => Array.isArray(node['@type']) ? node['@type'] : [node['@type']]);
  check(hubTypes.includes('CollectionPage'), '/videos/: CollectionPage schema missing');
  check(hubTypes.includes('ItemList'), '/videos/: ItemList schema missing');
  check(hubTypes.includes('BreadcrumbList'), '/videos/: BreadcrumbList schema missing');
  check((hubHtml.match(/class="video-library-card"/g) ?? []).length === videos.length, `/videos/: expected ${videos.length} cards`);
}

const redirects = readFileSync(join(root, '_redirects'), 'utf8');
check(!/^\/videos\/\s+/m.test(redirects), '/videos/ must not redirect');

const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
check(sitemap.includes('<loc>https://www.ghezelbaash.ir/videos/</loc>'), 'sitemap is missing /videos/ hub');
const videoSitemap = readFileSync(join(root, 'video-sitemap.xml'), 'utf8');
check((videoSitemap.match(/<video:video>/g) ?? []).length === videos.length, `video sitemap must contain ${videos.length} videos`);

for (const video of videos) {
  const pagePath = join(root, 'videos', video.id, 'index.html');
  const label = `/videos/${video.id}/`;
  check(existsSync(pagePath), `${label}: watch page missing`);
  check(Boolean(videoPageDetails[video.id]), `${label}: editorial detail record missing`);

  const vttPath = join(root, video.chapterTrack.replace(/^\//, ''));
  check(existsSync(vttPath), `${label}: VTT missing`);
  if (existsSync(vttPath)) {
    const cues = parseVtt(readFileSync(vttPath, 'utf8'));
    check(cues.length === 3, `${label}: expected 3 chapter cues, found ${cues.length}`);
    let previous = -1;
    cues.forEach((cue, index) => {
      check(cue.start >= 0, `${label}: cue ${index + 1} starts before zero`);
      check(cue.end > cue.start, `${label}: cue ${index + 1} has non-positive duration`);
      check(cue.start >= previous, `${label}: cue ${index + 1} is not monotonic`);
      check(cue.end <= video.exactDurationSeconds + 0.002, `${label}: cue ${index + 1} exceeds MP4 duration`);
      previous = cue.end;
    });
    if (cues.length) {
      check(Math.abs(cues[0].start) < 0.001, `${label}: first cue must start at zero`);
      check(Math.abs(cues.at(-1).end - video.exactDurationSeconds) < 0.01, `${label}: final cue must reach the measured MP4 duration`);
    }
  }

  if (!existsSync(pagePath)) continue;
  const html = readFileSync(pagePath, 'utf8');
  const graph = jsonLd(html, label);
  const nodes = graph['@graph'] ?? [];
  const byType = (type) => nodes.filter((node) => (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).includes(type));
  const videoObjects = byType('VideoObject');
  const breadcrumbs = byType('BreadcrumbList');
  const medicalPages = byType('MedicalWebPage');

  check(videoObjects.length === 1, `${label}: expected one VideoObject`);
  check(breadcrumbs.length === 1, `${label}: expected one BreadcrumbList`);
  check(medicalPages.length === 1, `${label}: expected one MedicalWebPage`);
  if (videoObjects[0]) {
    check(videoObjects[0].duration === video.duration, `${label}: schema duration mismatch`);
    check((videoObjects[0].hasPart ?? []).length === 3, `${label}: VideoObject must have 3 Clip nodes`);
    check(videoObjects[0].transcript === undefined, `${label}: unverifiable transcript must not be declared`);
    for (const clip of videoObjects[0].hasPart ?? []) {
      check(clip.endOffset > clip.startOffset, `${label}: invalid Clip offsets`);
      check(clip.endOffset <= video.exactDurationSeconds + 0.002, `${label}: Clip exceeds measured duration`);
      check(String(clip.url ?? '').startsWith(`https://www.ghezelbaash.ir/videos/${video.id}/#t=`), `${label}: Clip URL must target canonical watch page`);
    }
  }
  if (breadcrumbs[0]) {
    const items = breadcrumbs[0].itemListElement ?? [];
    check(items.length === 3, `${label}: breadcrumb must have 3 items`);
    check(items[1]?.item === 'https://www.ghezelbaash.ir/videos/', `${label}: breadcrumb level 2 must target /videos/`);
    check(items[2]?.item === `https://www.ghezelbaash.ir/videos/${video.id}/`, `${label}: breadcrumb current item mismatch`);
  }

  for (const section of ['این ویدئو چه می‌گوید؟', 'فصل‌بندی دقیق ویدئو', 'نکات کلیدی', 'مرز تصمیم و ایمنی', 'پرسش‌های مرتبط', 'منابع و مطالعه بیشتر', 'نویسنده و بازبین پزشکی', 'ویدئوهای مرتبط']) {
    check(html.includes(section), `${label}: missing strengthened section "${section}"`);
  }
  check(html.includes('خلاصه تحریریه‌ای محتوای ویدئو است، نه پیاده‌سازی کلمه‌به‌کلمه صوت'), `${label}: transcript disclosure missing`);
  check((html.match(/class="chapter-jump"/g) ?? []).length === 3, `${label}: expected 3 playable chapter links`);
  check(html.includes('rel="me external noopener"'), `${label}: official Instagram identity link missing`);
  check((html.match(/class="watch-sources"/g) ?? []).length === 1, `${label}: source list missing`);
  check((videoPageDetails[video.id].sources ?? []).length >= 2, `${label}: at least two supporting sources are required`);
  if (medicalPages[0]) {
    check((medicalPages[0].citation ?? []).length === videoPageDetails[video.id].sources.length, `${label}: schema citations do not match visible sources`);
  }
  check(sitemap.includes(`<loc>https://www.ghezelbaash.ir/videos/${video.id}/</loc>`), `${label}: sitemap entry missing`);
  check(!new RegExp(`^/videos/${video.id}/\\s+`, 'm').test(redirects), `${label}: canonical watch page must not redirect`);
}

const sourceIds = new Set(videos.map((video) => video.id));
const detailIds = new Set(Object.keys(videoPageDetails));
check(sourceIds.size === detailIds.size && [...sourceIds].every((id) => detailIds.has(id)), 'video detail records do not match media catalogue');

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  videos: videos.length,
  hub: true,
  breadcrumbLists: videos.length + 1,
  validVttTracks: videos.length,
  validClipSets: videos.length,
  transcriptPolicy: 'editorial summaries are disclosed; no unverifiable transcript schema',
}, null, 2));
