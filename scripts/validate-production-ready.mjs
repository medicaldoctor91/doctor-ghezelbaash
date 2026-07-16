import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { extname, relative, resolve } from 'node:path';
import { datasets } from '../src/data/datasets.ts';
import { faqItems } from '../src/data/faq.ts';
import { images } from '../src/data/images.ts';
import { requiredVisibleFiles, sections } from '../src/data/sections.ts';
import { topicGroups } from '../src/data/topics.ts';
import { videos } from '../src/data/videos.ts';

const root = process.cwd();
const dist = resolve(root, 'dist');
const mode = process.argv[2] ?? 'all';
const errors = [];
const warnings = [];
const checks = [];
const add = (check, condition, message) => { if (!condition) errors.push(`[${check}] ${message}`); };
const warn = (check, condition, message) => { if (!condition) warnings.push(`[${check}] ${message}`); };
const read = (path) => readFileSync(path, 'utf8');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const count = (text, pattern) => [...text.matchAll(pattern)].length;
const allFiles = (directory) => existsSync(directory) ? readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? allFiles(resolve(directory, entry.name)) : [resolve(directory, entry.name)]) : [];
const closeCheck = (name, e, w) => checks.push({ name, errors: errors.slice(e), warnings: warnings.slice(w) });

const validateInputs = () => {
  const e = errors.length, w = warnings.length;
  for (const file of requiredVisibleFiles) {
    const path = resolve(root, 'src/content/visible', file);
    add('inputs', existsSync(path), `Missing visible content: ${file}`);
    if (existsSync(path)) {
      const text = read(path);
      add('inputs', !text.includes('TODO_VISIBLE_CONTENT'), `Placeholder remains: ${file}`);
      add('inputs', text.trim().length >= 40, `Content too short: ${file}`);
    }
  }
  const font = resolve(root, 'Media/persian.woff2');
  add('inputs', existsSync(font), 'Persian font missing.');
  if (existsSync(font)) add('inputs', statSync(font).size >= 80000 && statSync(font).size <= 180000, 'Persian font size outside 80–180KB.');
  const integrityPath = resolve(root, 'Media/media-integrity.json');
  add('inputs', existsSync(integrityPath), 'media-integrity.json missing.');
  const integrity = existsSync(integrityPath) ? JSON.parse(read(integrityPath)) : { files: [] };
  const records = new Map(integrity.files.map((item) => [item.file, item]));
  for (const video of videos) {
    const poster = resolve(root, 'Media/posters', video.sourceFile.replace(/\.mp4$/u, '.webp'));
    const thumb = resolve(root, 'Media', video.thumbnailFile);
    add('inputs', existsSync(poster), `Poster missing: ${video.id}`);
    add('inputs', existsSync(thumb), `Thumbnail missing: ${video.id}`);
    if (video.available) {
      const mp4 = resolve(root, 'Media', video.sourceFile);
      const record = records.get(video.sourceFile);
      add('inputs', existsSync(mp4), `MP4 missing: ${video.sourceFile}`);
      add('inputs', Boolean(record?.valid), `MP4 full-decode validation failed: ${video.sourceFile}`);
      if (existsSync(mp4) && record?.sha256) add('inputs', sha256(readFileSync(mp4)) === record.sha256, `MP4 digest drift: ${video.sourceFile}`);
    }
  }
  add('inputs', faqItems.length === 80, `Expected 80 FAQs; found ${faqItems.length}.`);
  add('inputs', topicGroups.flatMap((group) => group.terms).length === 31, 'Expected 31 defined topics.');
  closeCheck('inputs', e, w);
};

const validateOutput = () => {
  const e = errors.length, w = warnings.length;
  for (const file of ['index.html','404.html','graph.jsonld','llms.txt','llms-full.txt','release.json','asset-manifest.json','sitemap.xml','robots.txt','_headers','_redirects']) add('output', existsSync(resolve(dist, file)), `Missing dist artifact: ${file}`);
  if (!existsSync(resolve(dist, 'index.html'))) return closeCheck('output', e, w);
  const html = read(resolve(dist, 'index.html'));
  add('html', /^<!doctype html>/iu.test(html), 'HTML5 doctype missing.');
  add('html', /<html[^>]+lang="fa-IR"[^>]+dir="rtl"/iu.test(html), 'fa-IR RTL root missing.');
  add('html', count(html, /<main(?:\s|>)/giu) === 1, 'Expected one main.');
  add('html', count(html, /<h1(?:\s|>)/giu) === 1, 'Expected one H1.');
  add('html', !html.includes('TODO_VISIBLE_CONTENT'), 'Placeholder leaked into HTML.');
  add('html', !/<iframe/iu.test(html) && !/\sautoplay(?:\s|=|>)/iu.test(html), 'Iframe/autoplay prohibited.');
  add('html', !/preload="(?:metadata|auto)"/iu.test(html), 'Video preload must be none.');
  add('html', !/http:\/\//iu.test(html), 'Mixed-content URL found.');
  add('html', /rel="canonical" href="https:\/\/www\.ghezelbaash\.ir\/"/iu.test(html), 'Canonical URL mismatch.');
  add('html', !html.includes('pages.dev'), 'pages.dev leaked into HTML.');
  for (const section of sections) add('html', html.includes(`id="${section.id}"`), `Section missing: ${section.id}`);

  const publishable = videos.filter((video) => video.available);
  add('video', count(html, /<video(?:\s|>)/giu) === publishable.length, `Expected ${publishable.length} videos.`);
  for (const video of videos) {
    const block = html.match(new RegExp(`<section[^>]+id="${video.id}"[\\s\\S]*?<\\/section>`, 'u'))?.[0];
    add('video', Boolean(block), `Video card missing: ${video.id}`);
    if (video.available && block) add('video', block.includes('controls') && block.includes('preload="none"'), `Playback contract failed: ${video.id}`);
    if (!video.available && block) add('video', !block.includes('<video'), `Corrupt video emitted: ${video.id}`);
    if (block) add('video', block.includes('video-transcript'), `Text alternative missing: ${video.id}`);
  }

  const manifest = existsSync(resolve(dist, 'asset-manifest.json')) ? JSON.parse(read(resolve(dist, 'asset-manifest.json'))) : { images: {}, videos: {} };
  add('media', Boolean(manifest.css && manifest.font), 'CSS or font manifest entry missing.');
  add('media', Object.keys(manifest.images ?? {}).length === images.length, `Expected ${images.length} images.`);
  for (const image of images) {
    const asset = manifest.images?.[image.id];
    add('media', Boolean(asset?.avif && asset?.webp && asset?.fallback && asset?.alt), `Image contract failed: ${image.id}`);
  }
  for (const video of publishable) {
    const asset = manifest.videos?.[video.id];
    add('media', Boolean(asset?.mp4 && asset?.poster), `Video assets incomplete: ${video.id}`);
    warn('media', Boolean(asset?.captions), `Persian captions deferred: ${video.id}`);
  }
  for (const video of videos.filter((item) => !item.available)) add('media', !manifest.videos?.[video.id]?.mp4, `Invalid MP4 leaked: ${video.id}`);

  const external = existsSync(resolve(dist, 'graph.jsonld')) ? JSON.parse(read(resolve(dist, 'graph.jsonld'))) : { '@graph': [] };
  const inlineMatch = html.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/iu);
  add('schema', Boolean(inlineMatch), 'Inline JSON-LD missing.');
  if (inlineMatch) add('schema', JSON.stringify(JSON.parse(inlineMatch[1])) === JSON.stringify(external), 'Inline and external graph differ.');
  const nodes = external['@graph'] ?? [];
  const types = nodes.flatMap((node) => Array.isArray(node['@type']) ? node['@type'] : [node['@type']]);
  for (const type of ['WebSite','ProfilePage','MedicalWebPage','Person','MedicalClinic','PostalAddress','GeoCoordinates','WebPageElement','ItemList','ContactPoint','City','Country','CreativeWork','Dataset','ImageObject','FAQPage','Question','Answer','DefinedTermSet','DefinedTerm','MedicalProcedure','VideoObject']) add('schema', types.includes(type), `Schema type missing: ${type}`);
  add('schema', types.filter((type) => type === 'Question').length === 80, 'Question count mismatch.');
  add('schema', types.filter((type) => type === 'Answer').length === 80, 'Answer count mismatch.');
  add('schema', types.filter((type) => type === 'DefinedTerm').length === 31, 'DefinedTerm count mismatch.');
  add('schema', types.filter((type) => type === 'MedicalProcedure').length === 31, 'MedicalProcedure count mismatch.');
  add('schema', types.filter((type) => type === 'VideoObject').length === publishable.length, 'VideoObject count mismatch.');
  const page = nodes.find((node) => node['@id'] === 'https://www.ghezelbaash.ir/#webpage');
  add('schema', page?.mainEntity?.['@id'] === 'https://www.ghezelbaash.ir/#doctor', 'Doctor is not sole mainEntity.');
  add('schema', !JSON.stringify(external).includes('https://ghezelbaash.ir/'), 'Non-www canonical found in graph.');

  const sitemap = read(resolve(dist, 'sitemap.xml'));
  add('sitemap', count(sitemap, /<url>/gu) === 1, 'Sitemap must contain one URL.');
  add('sitemap', count(sitemap, /<video:video>/gu) === publishable.length, 'Sitemap video count mismatch.');
  const chunksPath = resolve(dist, 'assets/data/chunks.json');
  add('retrieval', existsSync(chunksPath), 'chunks.json missing.');
  if (existsSync(chunksPath)) {
    const chunks = JSON.parse(read(chunksPath));
    add('retrieval', chunks.length >= 100 && chunks.length <= 500, `Chunk count outside 100–500: ${chunks.length}`);
    const llms = read(resolve(dist, 'llms-full.txt'));
    add('retrieval', !llms.includes('TODO_VISIBLE_CONTENT'), 'LLMS placeholder found.');
    for (const chunk of chunks) add('retrieval', llms.includes(chunk.text), `Chunk absent from LLMS: ${chunk.id}`);
  }

  for (const url of [...html.matchAll(/(?:href|src)="([^"]+)"/gu)].map((match) => match[1])) {
    if (!url.startsWith('/') || url === '/') continue;
    const path = url.split(/[?#]/u)[0].replace(/^\//u, '');
    add('links', existsSync(resolve(dist, path)), `Broken local link: ${url}`);
  }
  const buffer = readFileSync(resolve(dist, 'index.html'));
  const raw = buffer.byteLength, gzip = gzipSync(buffer).byteLength, dom = count(html, /<[a-z][^>]*>/giu);
  add('budgets', raw <= 1700000, `HTML raw ceiling exceeded: ${raw}`);
  add('budgets', gzip <= 300000, `HTML gzip ceiling exceeded: ${gzip}`);
  add('budgets', dom <= 4500, `DOM ceiling exceeded: ${dom}`);
  for (const file of allFiles(dist)) {
    add('budgets', extname(file) !== '.map', `Source map found: ${relative(dist, file)}`);
    if (extname(file) === '.js') add('budgets', gzipSync(readFileSync(file)).byteLength <= 30000, `JS budget exceeded: ${relative(dist, file)}`);
    if (extname(file) === '.css') add('budgets', gzipSync(readFileSync(file)).byteLength <= 25000, `CSS budget exceeded: ${relative(dist, file)}`);
  }
  const headers = read(resolve(dist, '_headers'));
  for (const token of ['X-Content-Type-Options: nosniff','Referrer-Policy:','Permissions-Policy:','X-Frame-Options: DENY','Content-Security-Policy:']) add('headers', headers.includes(token), `Header missing: ${token}`);
  add('headers', !headers.includes('__JSON_LD_HASH__'), 'CSP hash placeholder remains.');
  add('canonical', read(resolve(dist, '_redirects')).trim() === '/index.html / 301', '_redirects contract failed.');
  const notFound = read(resolve(dist, '404.html'));
  add('canonical', notFound.includes('noindex') && !/rel="canonical"/iu.test(notFound), '404 contract failed.');
  const release = JSON.parse(read(resolve(dist, 'release.json'));
  add('release', release.contentFrozen === true && release.releaseStatus === 'production-final', 'Release status failed.');
  for (const [field,file] of [['htmlSha256','index.html'],['graphSha256','graph.jsonld'],['llmsSha256','llms-full.txt']]) add('release', release[field] === sha256(readFileSync(resolve(dist, file))), `Digest mismatch: ${field}`);
  add('release', release.mediaPolicy?.publishableVideos === publishable.length, 'Media policy mismatch.');
  for (const dataset of datasets) {
    add('datasets', html.includes(dataset.url), `Dataset URL absent from HTML: ${dataset.url}`);
    add('datasets', JSON.stringify(external).includes(dataset.url), `Dataset URL absent from graph: ${dataset.url}`);
  }
  warnings.push(`[budgets] htmlRaw=${raw} htmlGzip=${gzip} domNodes=${dom}`);
  closeCheck('output', e, w);
};

validateInputs();
if (mode !== 'inputs') validateOutput();
const reportDirectory = resolve(root, 'audit/generated');
mkdirSync(reportDirectory, { recursive: true });
const report = { mode, strict: true, passed: errors.length === 0, errors, warnings, checks, generatedAt: new Date().toISOString() };
writeFileSync(resolve(reportDirectory, `production-validation-${mode}.json`), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (warnings.length) process.stdout.write(`${warnings.join('\n')}\n`);
if (errors.length) { process.stderr.write(`${errors.join('\n')}\n`); process.exitCode = 1; }
else process.stdout.write(`Production validation passed: ${mode}.\n`);
