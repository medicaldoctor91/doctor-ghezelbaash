import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
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
const assert = (condition, message) => { if (!condition) errors.push(message); };
const read = (path) => readFileSync(path, 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const occurrences = (text, pattern) => [...text.matchAll(pattern)].length;

for (const file of requiredVisibleFiles) {
  const path = resolve(root, 'src/content/visible', file);
  assert(existsSync(path), `Missing visible content: ${file}`);
  if (existsSync(path)) {
    const text = read(path);
    assert(text.trim().length >= 40, `Visible content too short: ${file}`);
    assert(!text.includes('TODO_VISIBLE_CONTENT'), `Placeholder remains: ${file}`);
  }
}
assert(faqItems.length === 80, `Expected 80 FAQs; found ${faqItems.length}`);
assert(topicGroups.flatMap((group) => group.terms).length === 31, 'Expected 31 defined topics.');
const font = resolve(root, 'Media/persian.woff2');
assert(existsSync(font), 'Persian font missing.');
if (existsSync(font)) assert(statSync(font).size >= 80000 && statSync(font).size <= 180000, 'Persian font size outside 80–180KB.');
const integrityPath = resolve(root, 'Media/media-integrity.json');
assert(existsSync(integrityPath), 'media-integrity.json missing.');
const integrity = existsSync(integrityPath) ? JSON.parse(read(integrityPath)) : { files: [] };
const records = new Map(integrity.files.map((entry) => [entry.file, entry]));
for (const video of videos) {
  assert(existsSync(resolve(root, 'Media/posters', video.sourceFile.replace(/\.mp4$/u, '.webp'))), `Poster missing: ${video.id}`);
  assert(existsSync(resolve(root, 'Media', video.thumbnailFile)), `Thumbnail missing: ${video.id}`);
  if (video.available) {
    const path = resolve(root, 'Media', video.sourceFile);
    const record = records.get(video.sourceFile);
    assert(existsSync(path), `MP4 missing: ${video.sourceFile}`);
    assert(Boolean(record?.valid), `MP4 full-decode validation failed: ${video.sourceFile}`);
    if (existsSync(path) && record?.sha256) assert(sha(readFileSync(path)) === record.sha256, `MP4 digest drift: ${video.sourceFile}`);
  }
}

if (mode !== 'inputs') {
  for (const file of ['index.html','404.html','graph.jsonld','llms.txt','llms-full.txt','release.json','asset-manifest.json','sitemap.xml','robots.txt','_headers','_redirects']) assert(existsSync(resolve(dist, file)), `Missing dist artifact: ${file}`);
  if (existsSync(resolve(dist, 'index.html'))) {
    const html = read(resolve(dist, 'index.html'));
    const publishable = videos.filter((video) => video.available);
    assert(/^<!doctype html>/iu.test(html), 'HTML5 doctype missing.');
    assert(/<html[^>]+lang="fa-IR"[^>]+dir="rtl"/iu.test(html), 'fa-IR RTL root missing.');
    assert(occurrences(html, /<main(?:\s|>)/giu) === 1, 'Expected exactly one main.');
    assert(occurrences(html, /<h1(?:\s|>)/giu) === 1, 'Expected exactly one H1.');
    assert(!html.includes('TODO_VISIBLE_CONTENT'), 'Placeholder leaked into HTML.');
    assert(!/<iframe/iu.test(html) && !/\sautoplay(?:\s|=|>)/iu.test(html), 'Iframe or autoplay found.');
    assert(!/http:\/\//iu.test(html), 'Mixed-content URL found.');
    assert(/rel="canonical" href="https:\/\/www\.ghezelbaash\.ir\/"/iu.test(html), 'Canonical URL mismatch.');
    assert(!html.includes('pages.dev'), 'pages.dev leaked into production HTML.');
    for (const section of sections) assert(html.includes(`id="${section.id}"`), `Section missing: ${section.id}`);
    assert(occurrences(html, /<video(?:\s|>)/giu) === publishable.length, `Expected ${publishable.length} playable videos.`);
    for (const video of videos) {
      const block = html.match(new RegExp(`<section[^>]+id="${video.id}"[\\s\\S]*?<\\/section>`, 'u'))?.[0];
      assert(Boolean(block), `Video card missing: ${video.id}`);
      if (video.available && block) assert(block.includes('controls') && block.includes('preload="none"'), `Video contract failed: ${video.id}`);
      if (!video.available && block) assert(!block.includes('<video'), `Corrupt video emitted: ${video.id}`);
    }
    const manifest = JSON.parse(read(resolve(dist, 'asset-manifest.json')));
    assert(Boolean(manifest.css && manifest.font), 'CSS/font manifest entries missing.');
    assert(Object.keys(manifest.images ?? {}).length === images.length, `Expected ${images.length} image definitions.`);
    for (const image of images) {
      const asset = manifest.images?.[image.id];
      assert(Boolean(asset?.avif && asset?.webp && asset?.fallback && asset?.alt), `Image contract failed: ${image.id}`);
    }
    for (const video of publishable) {
      const asset = manifest.videos?.[video.id];
      assert(Boolean(asset?.mp4 && asset?.poster), `Video asset contract failed: ${video.id}`);
      if (!asset?.captions) warnings.push(`Persian captions deferred: ${video.id}`);
    }
    for (const video of videos.filter((item) => !item.available)) assert(!manifest.videos?.[video.id]?.mp4, `Invalid MP4 leaked: ${video.id}`);

    const graph = JSON.parse(read(resolve(dist, 'graph.jsonld')));
    const inline = html.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/iu);
    assert(Boolean(inline), 'Inline JSON-LD missing.');
    if (inline) assert(JSON.stringify(JSON.parse(inline[1])) === JSON.stringify(graph), 'Inline/external graph mismatch.');
    const nodes = graph['@graph'] ?? [];
    const types = nodes.flatMap((node) => Array.isArray(node['@type']) ? node['@type'] : [node['@type']]);
    for (const type of ['WebSite','ProfilePage','MedicalWebPage','Person','MedicalClinic','PostalAddress','GeoCoordinates','WebPageElement','ItemList','ContactPoint','City','Country','CreativeWork','Dataset','ImageObject','FAQPage','Question','Answer','DefinedTermSet','DefinedTerm','MedicalProcedure','VideoObject']) assert(types.includes(type), `Schema type missing: ${type}`);
    assert(types.filter((type) => type === 'Question').length === 80, 'Question node count mismatch.');
    assert(types.filter((type) => type === 'Answer').length === 80, 'Answer node count mismatch.');
    assert(types.filter((type) => type === 'DefinedTerm').length === 31, 'DefinedTerm count mismatch.');
    assert(types.filter((type) => type === 'MedicalProcedure').length === 31, 'MedicalProcedure count mismatch.');
    assert(types.filter((type) => type === 'VideoObject').length === publishable.length, 'VideoObject count mismatch.');
    const page = nodes.find((node) => node['@id'] === 'https://www.ghezelbaash.ir/#webpage');
    assert(page?.mainEntity?.['@id'] === 'https://www.ghezelbaash.ir/#doctor', 'Doctor is not sole mainEntity.');

    const chunks = JSON.parse(read(resolve(dist, 'assets/data/chunks.json')));
    assert(chunks.length >= 100 && chunks.length <= 500, `Chunk count outside 100–500: ${chunks.length}`);
    const llms = read(resolve(dist, 'llms-full.txt'));
    assert(!llms.includes('TODO_VISIBLE_CONTENT'), 'Placeholder in LLMS corpus.');
    for (const chunk of chunks) assert(llms.includes(chunk.text), `Chunk absent from LLMS: ${chunk.id}`);
    const sitemap = read(resolve(dist, 'sitemap.xml'));
    assert(occurrences(sitemap, /<url>/gu) === 1, 'Sitemap must contain one URL.');
    assert(occurrences(sitemap, /<video:video>/gu) === publishable.length, 'Sitemap video count mismatch.');

    for (const url of [...html.matchAll(/(?:href|src)="([^"]+)"/gu)].map((match) => match[1])) {
      if (!url.startsWith('/') || url === '/') continue;
      assert(existsSync(resolve(dist, url.split(/[?#]/u)[0].replace(/^\//u, ''))), `Broken local link: ${url}`);
    }
    const buffer = readFileSync(resolve(dist, 'index.html'));
    const raw = buffer.byteLength;
    const gzipped = gzipSync(buffer).byteLength;
    const dom = occurrences(html, /<[a-z][^>]*>/giu);
    assert(raw <= 1700000, `HTML raw ceiling exceeded: ${raw}`);
    assert(gzipped <= 300000, `HTML gzip ceiling exceeded: ${gzipped}`);
    assert(dom <= 4500, `DOM ceiling exceeded: ${dom}`);
    warnings.push(`htmlRaw=${raw} htmlGzip=${gzipped} domNodes=${dom} chunks=${chunks.length}`);

    const headers = read(resolve(dist, '_headers'));
    for (const token of ['X-Content-Type-Options: nosniff','Referrer-Policy:','Permissions-Policy:','X-Frame-Options: DENY','Content-Security-Policy:']) assert(headers.includes(token), `Header missing: ${token}`);
    assert(!headers.includes('__JSON_LD_HASH__'), 'CSP hash placeholder remains.');
    assert(read(resolve(dist, '_redirects')).trim() === '/index.html / 301', '_redirects contract failed.');
    const notFound = read(resolve(dist, '404.html'));
    assert(notFound.includes('noindex') && !/rel="canonical"/iu.test(notFound), '404 contract failed.');
    const release = JSON.parse(read(resolve(dist, 'release.json')));
    assert(release.contentFrozen === true && release.releaseStatus === 'production-final', 'Release status failed.');
    for (const [field, file] of [['htmlSha256','index.html'],['graphSha256','graph.jsonld'],['llmsSha256','llms-full.txt']]) assert(release[field] === sha(readFileSync(resolve(dist, file))), `Digest mismatch: ${field}`);
    assert(release.mediaPolicy?.publishableVideos === publishable.length, 'Release media policy mismatch.');
    for (const dataset of datasets) {
      assert(html.includes(dataset.url), `Dataset absent from HTML: ${dataset.url}`);
      assert(JSON.stringify(graph).includes(dataset.url), `Dataset absent from graph: ${dataset.url}`);
    }
  }
}

const reportDir = resolve(root, 'audit/generated');
mkdirSync(reportDir, { recursive: true });
writeFileSync(resolve(reportDir, `production-validation-${mode}.json`), `${JSON.stringify({ mode, passed: errors.length === 0, errors, warnings, generatedAt: new Date().toISOString() }, null, 2)}\n`);
if (warnings.length) process.stdout.write(`${warnings.join('\n')}\n`);
if (errors.length) { process.stderr.write(`${errors.join('\n')}\n`); process.exitCode = 1; }
else process.stdout.write(`Production validation passed: ${mode}.\n`);
