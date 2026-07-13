import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { videos } from '../src/domain/media.mjs';
import { videoPageDetails } from '../src/domain/video-pages.mjs';
import { videoEntityId } from '../src/domain/url-architecture.mjs';

const root = join(process.cwd(), 'dist');
const site = 'https://www.ghezelbaash.ir/';
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const html = readFileSync(join(root, 'index.html'), 'utf8');
const graph = JSON.parse(readFileSync(join(root, 'knowledge-graph.jsonld'), 'utf8'))['@graph'] ?? [];

function parseVtt(raw) {
  const cues = [];
  const timing = /(\d\d):(\d\d):(\d\d)\.(\d{3})\s+-->\s+(\d\d):(\d\d):(\d\d)\.(\d{3})/g;
  for (const match of raw.matchAll(timing)) {
    cues.push({
      start: Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000,
      end: Number(match[5]) * 3600 + Number(match[6]) * 60 + Number(match[7]) + Number(match[8]) / 1000,
    });
  }
  return cues;
}

check(!existsSync(join(root, 'videos', 'index.html')), '/videos/ HTML route must be absent');
check(!existsSync(join(root, 'knowledge', 'index.html')), '/knowledge/ HTML route must be absent');
check((html.match(/class="video-facade-button"/g) ?? []).length === videos.length, `homepage must render ${videos.length} video facades`);
check((html.match(/class="video-context-details"/g) ?? []).length === videos.length, `homepage must render ${videos.length} video dossiers`);
check((html.match(/class="video-chapter-play"/g) ?? []).length === videos.length * 3, 'homepage must render all 36 chapter controls');

const videoNodes = graph.filter((node) => (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).includes('VideoObject'));
const clipNodes = graph.filter((node) => (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).includes('Clip'));
check(videoNodes.length === videos.length, `canonical graph must contain ${videos.length} VideoObject nodes`);
check(clipNodes.length === videos.length * 3, `canonical graph must contain ${videos.length * 3} Clip nodes`);

for (const video of videos) {
  const id = `video-${video.id}`;
  check((html.match(new RegExp(`\\sid="${id}"`, 'g')) ?? []).length === 1, `${video.id}: homepage must contain one contextual figure`);
  check(html.includes(`href="#${id}"`), `${video.id}: video hub must link to contextual figure`);
  check(Boolean(videoPageDetails[video.id]), `${video.id}: editorial dossier missing`);
  const details = videoPageDetails[video.id];
  check(html.includes(details.summary), `${video.id}: editorial summary not migrated to homepage`);
  check(html.includes(details.boundary), `${video.id}: safety boundary not migrated to homepage`);
  for (const source of details.sources ?? []) check(html.includes(`href="${source.url}"`), `${video.id}: source missing from homepage: ${source.url}`);

  const vttPath = join(root, video.chapterTrack.replace(/^\//, ''));
  check(existsSync(vttPath), `${video.id}: VTT missing`);
  if (existsSync(vttPath)) {
    const cues = parseVtt(readFileSync(vttPath, 'utf8'));
    check(cues.length === 3, `${video.id}: expected 3 chapter cues, found ${cues.length}`);
    check(Math.abs((cues.at(-1)?.end ?? 0) - video.exactDurationSeconds) < 0.01, `${video.id}: VTT does not reach measured duration`);
  }
  const entity = videoNodes.find((node) => node['@id'] === videoEntityId(site, video.id));
  check(Boolean(entity), `${video.id}: canonical VideoObject missing`);
  check(entity?.url === `${site}#${id}`, `${video.id}: canonical VideoObject URL is not the visible anchor`);
  check(entity?.mainEntityOfPage?.['@id'] === `${site}#webpage`, `${video.id}: VideoObject must belong to homepage`);
  check(!String(JSON.stringify(entity)).includes(`${site}videos/${video.id}/`), `${video.id}: removed watch URL remains in graph`);
}

const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
check((sitemap.match(/<url>/g) ?? []).length === 1 && sitemap.includes(`<loc>${site}</loc>`), 'sitemap must contain only the canonical homepage');
const videoSitemap = readFileSync(join(root, 'video-sitemap.xml'), 'utf8');
check((videoSitemap.match(/<url>/g) ?? []).length === 1, 'video sitemap must attach all videos to one homepage URL');
check((videoSitemap.match(/<video:video>/g) ?? []).length === videos.length, `video sitemap must contain ${videos.length} videos`);

if (failures.length) { console.error(JSON.stringify({ status: 'fail', failures }, null, 2)); process.exit(1); }
console.log(JSON.stringify({ status: 'pass', homepageVideos: videos.length, videoObjects: videoNodes.length, clips: clipNodes.length, migratedDossiers: videos.length, removedWatchRoutes: videos.length + 1 }, null, 2));
