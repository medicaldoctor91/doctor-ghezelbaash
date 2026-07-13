import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { procedures } from '../src/domain/concepts.mjs';
import { videos } from '../src/domain/media.mjs';
import {
  serviceUrlRegistry,
  videoClipId,
  videoEntityId,
  videoHubPageId,
  videoWebPageId,
} from '../src/domain/url-architecture.mjs';

const root = process.cwd();
const dist = join(root, 'dist');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const site = 'https://www.ghezelbaash.ir/';

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const path = join(dir, name);
    statSync(path).isDirectory() ? walk(path, files) : files.push(path);
  }
  return files;
}

function parseJsonLd(html, label) {
  const blocks = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  check(blocks.length === 1, `${label}: expected one JSON-LD graph, found ${blocks.length}`);
  if (!blocks[0]) return [];
  try { return JSON.parse(blocks[0][1])['@graph'] ?? []; }
  catch (error) {
    failures.push(`${label}: invalid JSON-LD (${error.message})`);
    return [];
  }
}

// Experimental URLs and evidence identities must be absent, not redirected or aliased.
const forbidden = [
  'dr-saeed-ghezelbash-aesthetic-clinic',
  'botox-kermanshah',
  'filler-kermanshah',
  'thread-lift-kermanshah',
  'aesthetic-concerns-kermanshah',
  'source-live-clinic',
  'source-live-botox',
  'source-live-filler',
  'source-live-thread',
  'source-live-concerns',
  'liveClinicSource',
  'liveServiceSources',
];
for (const base of ['src', 'public']) {
  for (const path of walk(join(root, base))) {
    const text = readFileSync(path, 'utf8');
    for (const value of forbidden) check(!text.includes(value), `${relative(root, path)} still contains forbidden legacy value: ${value}`);
  }
}
check(!existsSync(join(root, 'examples')), 'examples/ must be fully removed');
check(!existsSync(join(root, 'drizzle')), 'drizzle/ must be fully removed');

// Explicit service URL registry must exactly cover procedures and render stable semantic anchors.
const procedureIds = procedures.map((item) => item.id);
const registryIds = serviceUrlRegistry.map((item) => item.id);
check(new Set(procedureIds).size === procedureIds.length, 'procedure IDs are not unique');
check(new Set(registryIds).size === registryIds.length, 'service URL registry IDs are not unique');
check(new Set(serviceUrlRegistry.map((item) => item.anchor)).size === serviceUrlRegistry.length, 'service anchors are not unique');
check(procedureIds.length === registryIds.length && procedureIds.every((id) => registryIds.includes(id)), 'service URL registry does not exactly cover all procedures');
check(serviceUrlRegistry.every((item) => item.anchor === `service-${item.id}`), 'service anchors must follow service-{procedureId}');

const homepage = readFileSync(join(dist, 'index.html'), 'utf8');
for (const item of serviceUrlRegistry) {
  const aliasCount = (homepage.match(new RegExp(`\\sid=\"${item.anchor}\"`, 'g')) ?? []).length;
  const targetCount = (homepage.match(new RegExp(`\\sid=\"${item.targetHeadingId}\"`, 'g')) ?? []).length;
  check(aliasCount === 1, `homepage: expected one canonical service anchor ${item.anchor}, found ${aliasCount}`);
  check(targetCount === 1, `homepage: expected one registry target heading ${item.targetHeadingId}, found ${targetCount}`);
}

const services = JSON.parse(readFileSync(join(dist, 'services.json'), 'utf8'));
const umbrellaById = new Map(services.umbrellaProcedures.map((item) => [item.id, item]));
for (const item of serviceUrlRegistry) {
  const service = umbrellaById.get(item.id);
  check(Boolean(service), `services.json: missing umbrella procedure ${item.id}`);
  if (service) check(service.url === `${site}#${item.anchor}`, `services.json: unstable URL for ${item.id}: ${service.url}`);
}
for (const concept of services.granularConcepts ?? []) {
  const registry = serviceUrlRegistry.find((item) => item.id === concept.parentProcedureId);
  check(Boolean(registry), `services.json: granular concept ${concept.id} has unknown parent ${concept.parentProcedureId}`);
  if (registry) check(concept.url === `${site}#${registry.anchor}`, `services.json: granular concept ${concept.id} does not use parent canonical service URL`);
}

const resolver = JSON.parse(readFileSync(join(dist, 'resolver.json'), 'utf8'));
const resolverText = JSON.stringify(resolver);
for (const item of serviceUrlRegistry) check(resolverText.includes(`${site}#${item.anchor}`), `resolver.json: missing canonical service URL for ${item.id}`);

// Homepage lists canonical watch pages; full VideoObject/Clip graphs live only on watch pages and graph/media.
const homepageGraph = parseJsonLd(homepage, '/');
const homepageVideoNodes = homepageGraph.filter((node) => (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).includes('VideoObject'));
const homepageClipNodes = homepageGraph.filter((node) => (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).includes('Clip'));
check(homepageVideoNodes.length === 0, `homepage: full VideoObject nodes must be absent, found ${homepageVideoNodes.length}`);
check(homepageClipNodes.length === 0, `homepage: full Clip nodes must be absent, found ${homepageClipNodes.length}`);
const videoWatchLists = homepageGraph.filter((node) => node['@id'] === `${site}#video-watch-pages` && node['@type'] === 'ItemList');
check(videoWatchLists.length === 1, `homepage: expected one canonical video watch-page ItemList, found ${videoWatchLists.length}`);
const videoWatchList = videoWatchLists[0];
check(videoWatchList?.numberOfItems === videos.length, `homepage: video watch-page list must contain ${videos.length} items`);
const listedWatchPages = videoWatchList?.itemListElement ?? [];
check(listedWatchPages.length === videos.length, `homepage: expected ${videos.length} listed watch pages, found ${listedWatchPages.length}`);

const mediaJson = JSON.parse(readFileSync(join(dist, 'media.json'), 'utf8'));
const mediaGraph = JSON.parse(readFileSync(join(dist, 'graph', 'media.jsonld'), 'utf8'))['@graph'] ?? [];
const mediaVideoNodes = mediaGraph.filter((node) => (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).includes('VideoObject'));
const mediaClipNodes = mediaGraph.filter((node) => (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).includes('Clip'));
const authorityMapText = readFileSync(join(dist, 'authority-map.json'), 'utf8');
for (const video of videos) {
  const entityId = videoEntityId(site, video.id);
  const pageId = videoWebPageId(site, video.id);
  const listedPage = listedWatchPages.find((item) => item?.item?.['@id'] === pageId);
  check(Boolean(listedPage), `homepage: watch-page list is missing ${pageId}`);
  if (listedPage) {
    check(listedPage.url === `${site}videos/${video.id}/`, `${video.id}: homepage list URL mismatch`);
    check(listedPage.item?.['@type'] === 'WebPage', `${video.id}: homepage list item must describe the watch WebPage, not inline a VideoObject`);
  }

  const pagePath = join(dist, 'videos', video.id, 'index.html');
  const watchGraph = parseJsonLd(readFileSync(pagePath, 'utf8'), `/videos/${video.id}/`);
  const watchVideos = watchGraph.filter((node) => (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).includes('VideoObject'));
  check(watchVideos.length === 1, `${video.id}: expected one watch-page VideoObject`);
  const watchVideo = watchVideos[0];
  const watchClips = watchVideo?.hasPart ?? [];
  if (watchVideo) {
    check(watchVideo['@id'] === entityId, `${video.id}: watch-page VideoObject IRI mismatch`);
    check(watchVideo.mainEntityOfPage?.['@id'] === pageId, `${video.id}: watch-page mainEntityOfPage mismatch`);
    check(!('embedUrl' in watchVideo), `${video.id}: watch-page VideoObject must not misuse embedUrl for a non-embed page`);
  }

  const graphMediaVideos = mediaVideoNodes.filter((node) => node['@id'] === entityId);
  check(graphMediaVideos.length === 1, `${video.id}: graph/media must contain one canonical VideoObject`);
  if (graphMediaVideos[0]) {
    check(graphMediaVideos[0].mainEntityOfPage?.['@id'] === pageId, `${video.id}: graph/media mainEntityOfPage mismatch`);
    check(!('embedUrl' in graphMediaVideos[0]), `${video.id}: graph/media must not misuse embedUrl for a non-embed page`);
  }

  const graphMediaClips = mediaClipNodes.filter((node) => String(node['@id'] ?? '').startsWith(`${site}videos/${video.id}/#clip-`));
  check(watchClips.length === 3, `${video.id}: watch page must expose 3 canonical Clip nodes`);
  check(graphMediaClips.length === watchClips.length, `${video.id}: graph/media Clip count differs from watch page`);
  watchClips.forEach((clip, index) => {
    const expected = videoClipId(site, video.id, index + 1);
    const mediaClip = graphMediaClips.find((item) => item['@id'] === expected);
    check(clip['@id'] === expected, `${video.id}: watch-page Clip IRI mismatch`);
    check(Boolean(mediaClip), `${video.id}: graph/media missing canonical Clip ${expected}`);
    for (const property of ['name', 'startOffset', 'endOffset', 'url']) {
      if (mediaClip) check(mediaClip[property] === clip[property], `${video.id}: graph/media Clip ${index + 1} ${property} differs from watch page`);
    }
  });

  const mediaRecord = mediaJson.videos.find((item) => item.id === video.id);
  check(mediaRecord?.entityId === entityId, `${video.id}: media.json entityId mismatch`);
  check(mediaRecord?.mainEntityOfPage === pageId, `${video.id}: media.json mainEntityOfPage mismatch`);
  check(!homepage.includes(`${site}#video-${video.id}`), `${video.id}: old homepage-scoped VideoObject IRI remains`);
  check(!homepage.includes(`${site}#clip-${video.id}-`), `${video.id}: old homepage-scoped Clip IRI remains`);
}
const authorityMapVideoIds = [...authorityMapText.matchAll(/"entityId":\s*"(https:\/\/www\.ghezelbaash\.ir\/videos\/[^"]+\/#video)"/g)].map((match) => match[1]);
check(authorityMapVideoIds.length > 0, 'authority-map.json contains no video entity references');
check(authorityMapVideoIds.every((id) => /\/videos\/[^/]+\/#video$/.test(id)), 'authority-map.json contains a non-canonical video entity IRI');
check(!authorityMapText.includes(`${site}#video-`), 'authority-map.json contains old homepage-scoped video IRIs');

// Cloudflare Pages header inheritance simulation: at most one Content-Type per resource.
function parseHeaders(raw) {
  const rules = [];
  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: [] };
      rules.push(current);
      continue;
    }
    if (!current) continue;
    const match = line.trim().match(/^([^:]+):\s*(.*)$/);
    if (match) current.headers.push({ name: match[1].toLowerCase(), value: match[2] });
  }
  return rules;
}
function patternRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`);
}
function urlForFile(path) {
  const rel = relative(dist, path).replaceAll('\\', '/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel}`;
}
const headerRules = parseHeaders(readFileSync(join(dist, '_headers'), 'utf8')).map((rule) => ({ ...rule, regex: patternRegex(rule.pattern) }));
const distFiles = walk(dist, []);
const expectedMime = (url) => {
  if (url.endsWith('.json')) return 'application/json';
  if (url.endsWith('.jsonld')) return 'application/ld+json';
  if (url.endsWith('.jsonl')) return 'application/x-ndjson';
  if (url.endsWith('.xml')) return 'application/xml';
  if (url.endsWith('.webmanifest')) return 'application/manifest+json';
  if (url.endsWith('.vtt')) return 'text/vtt';
  if (url.endsWith('.mp4')) return 'video/mp4';
  return null;
};
for (const path of distFiles) {
  const url = urlForFile(path);
  const applied = headerRules.filter((rule) => rule.regex.test(url)).flatMap((rule) => rule.headers.map((header) => ({ ...header, pattern: rule.pattern })));
  const contentTypes = applied.filter((header) => header.name === 'content-type');
  check(contentTypes.length <= 1, `${url}: multiple Content-Type rules apply (${contentTypes.map((item) => item.pattern).join(', ')})`);
  const expected = expectedMime(url);
  if (expected) {
    check(contentTypes.length === 1, `${url}: missing explicit Content-Type`);
    if (contentTypes[0]) check(contentTypes[0].value.toLowerCase().startsWith(expected), `${url}: expected ${expected}, got ${contentTypes[0].value}`);
  }
  const cacheValues = applied.filter((header) => header.name === 'cache-control').map((header) => header.value.toLowerCase());
  const isHtml = url === '/' || url.endsWith('/') || url.endsWith('.html');
  if (isHtml) check(!cacheValues.some((value) => value.includes('immutable')), `${url}: HTML must not be immutable`);
  if (url === '/videos/' || /^\/videos\/[^/]+\/$/.test(url)) {
    check(cacheValues.some((value) => value.includes('must-revalidate') && value.includes('max-age=0')), `${url}: video HTML must revalidate`);
  }
  const ranges = applied.filter((header) => header.name === 'accept-ranges');
  if (url.endsWith('.mp4')) check(ranges.length === 1 && ranges[0].value.toLowerCase() === 'bytes', `${url}: MP4 must declare Accept-Ranges: bytes`);
  else check(ranges.length === 0, `${url}: Accept-Ranges must only apply to MP4 resources`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  status: 'pass',
  services: serviceUrlRegistry.length,
  legacyUrlsRemoved: 5,
  videos: videos.length,
  canonicalClipSets: videos.length,
  homepageVideoPolicy: 'watch-page ItemList only; full VideoObject and Clip graphs isolated to watch pages',
  headerRules: headerRules.length,
  resourcesChecked: distFiles.length,
}, null, 2));
