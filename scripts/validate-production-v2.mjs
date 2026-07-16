import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { datasets } from '../src/data/datasets.ts';
import { googleMapsEvidence } from '../src/data/evidence.ts';
import { faqItems } from '../src/data/faq.ts';
import { images } from '../src/data/images.ts';
import { release as releaseDefinition } from '../src/data/release.ts';
import { requiredVisibleFiles, sections } from '../src/data/sections.ts';
import { topicGroups } from '../src/data/topics.ts';
import { videos } from '../src/data/videos.ts';
import { validateContentPackage } from './validate-content-package.mjs';

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
const topicTerms = topicGroups.flatMap((group) => group.terms);
const topicIds = topicTerms.map((term) => term.id);
assert(topicTerms.length > 0, 'Topic registry is empty.');
assert(new Set(topicIds).size === topicIds.length, 'Topic registry contains duplicate IDs.');
assert(topicTerms.every((term) => term.name.trim() && term.description.trim()), 'Topic registry contains an empty name or description.');
assert(datasets[0]?.url.startsWith('https://doi.org/10.5281/zenodo.'), 'Zenodo dataset URL is missing or invalid.');
assert(datasets[1]?.url.startsWith('https://huggingface.co/datasets/'), 'Hugging Face dataset URL is missing or invalid.');
const font = resolve(root, 'Media/persian.woff2');
assert(existsSync(font), 'Persian font missing.');
if (existsSync(font)) assert(statSync(font).size >= 80000 && statSync(font).size <= 180000, 'Persian font size outside 80–180KB.');
const integrityPath = resolve(root, 'Media/media-integrity.json');
assert(existsSync(integrityPath), 'media-integrity.json missing.');
const integrity = existsSync(integrityPath) ? JSON.parse(read(integrityPath)) : { files: [] };
const records = new Map(integrity.files.map((entry) => [entry.file, entry]));

const stagedContentPath = resolve(root, 'content-package/current');
if (existsSync(stagedContentPath)) {
  const contentReport = validateContentPackage(stagedContentPath);
  for (const error of contentReport.errors) errors.push(`Staged content package: ${error}`);
}
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
  for (const file of ['index.html','404.html','knowledge-graph.jsonld','llms.txt','llms-full.txt','release.json','asset-manifest.json','sitemap.xml','robots.txt','_headers','_redirects']) assert(existsSync(resolve(dist, file)), `Missing dist artifact: ${file}`);
  if (existsSync(resolve(dist, 'index.html'))) {
    const html = read(resolve(dist, 'index.html'));
    const publishable = videos.filter((video) => video.available);
    assert(/^<!doctype html>/iu.test(html), 'HTML5 doctype missing.');
    assert(/<html[^>]+lang="fa-IR"[^>]+dir="rtl"/iu.test(html), 'fa-IR RTL root missing.');
    assert(occurrences(html, /<main(?:\s|>)/giu) === 1, 'Expected exactly one main.');
    assert(occurrences(html, /<h1(?:\s|>)/giu) === 1, 'Expected exactly one H1.');
    assert(!html.includes('TODO_VISIBLE_CONTENT'), 'Placeholder leaked into HTML.');
    assert(!/data-content-(?:file|section)=/iu.test(html), 'Internal authoring metadata leaked into HTML attributes.');
    assert(!/<iframe/iu.test(html) && !/\sautoplay(?:\s|=|>)/iu.test(html), 'Iframe or autoplay found.');
    assert(!/http:\/\//iu.test(html), 'Mixed-content URL found.');
    assert(/rel="canonical" href="https:\/\/www\.ghezelbaash\.ir\/"/iu.test(html), 'Canonical URL mismatch.');
    assert(!html.includes('pages.dev'), 'pages.dev leaked into production HTML.');
    assert(!existsSync(resolve(dist, 'graph.jsonld')), 'Legacy duplicate graph.jsonld must not be emitted.');
    assert(!existsSync(resolve(dist, 'CNAME')), 'GitHub Pages CNAME artifact must not be emitted.');
    assert(!existsSync(resolve(dist, 'visual-fixes.css')), 'Unhashed legacy visual-fixes.css must not be emitted.');
    const visibleText = html
      .replace(/<script[\s\S]*?<\/script>/giu, ' ')
      .replace(/<style[\s\S]*?<\/style>/giu, ' ')
      .replace(/<[^>]+>/gu, ' ')
      .replace(/\s+/gu, ' ');
    const visibleLeakPatterns = [
      /canonical/iu,
      /machine-readable/iu,
      /knowledge graph/iu,
      /google kg/iu,
      /cloud kg/iu,
      /json-ld/iu,
      /\b(?:schema|dataset|llmo|rag|sge)\b/iu,
      /شناسه‌های فنی/iu,
      /نمودار دانش/iu,
      /داده‌های ماشین‌خوان/iu,
      /src\/data/iu,
      /(?:todo|placeholder|نیازمند تکمیل)/iu,
      /(?:این بخش|در متن صفحه) باید/iu,
    ];
    for (const pattern of visibleLeakPatterns) {
      assert(!pattern.test(visibleText), `Technical or authoring text leaked into visible HTML: ${pattern}`);
    }
    const htmlIds = [...html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
    assert(new Set(htmlIds).size === htmlIds.length, 'Rendered HTML contains duplicate id attributes.');
    const renderedIdSet = new Set(htmlIds);
    for (const match of html.matchAll(/href="#([^"]+)"/gu)) assert(renderedIdSet.has(match[1]), `Broken same-page anchor: #${match[1]}`);
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
    const manifestAssetUrls = new Set();
    const collectAssetUrls = (value) => {
      if (typeof value === 'string' && value.startsWith('/assets/')) manifestAssetUrls.add(value);
      else if (Array.isArray(value)) value.forEach(collectAssetUrls);
      else if (value && typeof value === 'object') Object.values(value).forEach(collectAssetUrls);
    };
    collectAssetUrls(manifest);
    for (const directory of ['css', 'fonts', 'images', 'videos']) {
      for (const file of readdirSync(resolve(dist, 'assets', directory))) {
        assert(manifestAssetUrls.has(`/assets/${directory}/${file}`), `Orphaned generated asset: /assets/${directory}/${file}`);
      }
    }
    assert(Object.keys(manifest.images ?? {}).length === images.length, `Expected ${images.length} image definitions.`);
    for (const image of images) {
      const asset = manifest.images?.[image.id];
      assert(Boolean(asset?.avif && asset?.webp && asset?.fallback && asset?.alt), `Image contract failed: ${image.id}`);
      assert(Array.isArray(asset?.avifSrcset) && asset.avifSrcset.length >= 2, `Responsive AVIF set missing: ${image.id}`);
      assert(Array.isArray(asset?.webpSrcset) && asset.webpSrcset.length >= 2, `Responsive WebP set missing: ${image.id}`);
      assert(Array.isArray(asset?.fallbackSrcset) && asset.fallbackSrcset.length >= 1, `Responsive fallback set missing: ${image.id}`);
      for (const variants of [asset?.avifSrcset, asset?.webpSrcset, asset?.fallbackSrcset]) {
        const widths = (variants ?? []).map((variant) => variant.width);
        assert(new Set(widths).size === widths.length && widths.every((width, index) => index === 0 || width > widths[index - 1]), `Image widths are duplicate or unsorted: ${image.id}`);
      }
    }
    for (const video of publishable) {
      const asset = manifest.videos?.[video.id];
      assert(Boolean(asset?.mp4 && asset?.poster), `Video asset contract failed: ${video.id}`);
      if (!asset?.captions) warnings.push(`Persian captions deferred: ${video.id}`);
    }
    for (const video of videos.filter((item) => !item.available)) assert(!manifest.videos?.[video.id]?.mp4, `Invalid MP4 leaked: ${video.id}`);

    const graph = JSON.parse(read(resolve(dist, 'knowledge-graph.jsonld')));
    const inline = html.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/iu);
    assert(Boolean(inline), 'Inline JSON-LD missing.');
    const inlineGraph = inline ? JSON.parse(inline[1]) : { '@graph': [] };
    const nodes = graph['@graph'] ?? [];
    const inlineNodes = inlineGraph['@graph'] ?? [];
    const nodesById = new Map(nodes.map((node) => [node['@id'], node]));
    const inlineIds = new Set(inlineNodes.map((node) => node['@id']));
    assert(new Set(nodes.map((node) => node['@id'])).size === nodes.length, 'Canonical graph contains duplicate @id values.');
    assert(inlineIds.size === inlineNodes.length, 'Inline graph contains duplicate @id values.');
    for (const inlineNode of inlineNodes) {
      const canonicalNode = nodesById.get(inlineNode['@id']);
      assert(Boolean(canonicalNode), `Inline graph node is absent from canonical graph: ${inlineNode['@id']}`);
      if (canonicalNode) {
        assert(JSON.stringify(inlineNode['@type']) === JSON.stringify(canonicalNode['@type']), `Inline/canonical type drift: ${inlineNode['@id']}`);
      }
    }
    const sameSiteReferences = [];
    const collectIds = (value) => {
      if (Array.isArray(value)) return value.forEach(collectIds);
      if (!value || typeof value !== 'object') return;
      if (typeof value['@id'] === 'string' && value['@id'].startsWith('https://www.ghezelbaash.ir/#')) sameSiteReferences.push(value['@id']);
      Object.values(value).forEach(collectIds);
    };
    collectIds(graph);
    for (const id of sameSiteReferences) assert(nodesById.has(id), `Dangling same-site graph reference: ${id}`);
    const types = nodes.flatMap((node) => Array.isArray(node['@type']) ? node['@type'] : [node['@type']]);
    for (const type of ['WebSite','ProfilePage','MedicalWebPage','Person','MedicalClinic','PostalAddress','GeoCoordinates','WebPageElement','ItemList','ContactPoint','City','Country','Dataset','ImageObject','FAQPage','Question','Answer','DefinedTermSet','DefinedTerm','MedicalProcedure','MedicalCondition','VideoObject']) assert(types.includes(type), `Schema type missing: ${type}`);
    assert(types.filter((type) => type === 'Question').length === faqItems.length, 'Question node count mismatch.');
    assert(types.filter((type) => type === 'Answer').length === faqItems.length, 'Answer node count mismatch.');
    assert(types.filter((type) => type === 'DefinedTerm').length === topicTerms.length, 'DefinedTerm count mismatch.');
    assert(types.filter((type) => type === 'MedicalProcedure').length === topicTerms.filter((term) => term.schemaType === 'MedicalProcedure').length, 'MedicalProcedure type mapping mismatch.');
    assert(types.filter((type) => type === 'MedicalCondition').length === topicTerms.filter((term) => term.schemaType === 'MedicalCondition').length, 'MedicalCondition type mapping mismatch.');
    assert(types.filter((type) => type === 'VideoObject').length === publishable.length, 'VideoObject count mismatch.');
    const page = nodes.find((node) => node['@id'] === 'https://www.ghezelbaash.ir/#webpage');
    assert(page?.mainEntity?.['@id'] === 'https://www.ghezelbaash.ir/#doctor', 'Doctor is not sole mainEntity.');
    for (const node of nodes) {
      if (node?.mainEntityOfPage?.['@id'] === 'https://www.ghezelbaash.ir/#webpage') {
        assert(node['@id'] === 'https://www.ghezelbaash.ir/#doctor', `Non-doctor entity claims page ownership: ${node['@id']}`);
      }
    }
    const inlinePage = inlineNodes.find((node) => node['@id'] === 'https://www.ghezelbaash.ir/#webpage');
    assert(inlinePage?.mainEntity?.['@id'] === 'https://www.ghezelbaash.ir/#doctor', 'Inline projection changed the sole mainEntity.');
    const anchorTypes = new Set(['WebPageElement','ImageObject','VideoObject','FAQPage','Question','Answer','DefinedTerm','MedicalProcedure','MedicalCondition']);
    const renderedIds = new Set(htmlIds);
    for (const node of nodes) {
      const nodeTypes = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      const fragment = typeof node['@id'] === 'string' && node['@id'].startsWith('https://www.ghezelbaash.ir/#') ? node['@id'].split('#')[1] : null;
      if (fragment && nodeTypes.some((type) => anchorTypes.has(type))) assert(renderedIds.has(fragment), `Graph fragment has no visible HTML anchor: ${node['@id']}`);
      if (nodeTypes.includes('MedicalProcedure')) assert(!node.mainEntityOfPage, `Procedure incorrectly claims page ownership: ${node['@id']}`);
    }
    const doctorNode = nodesById.get('https://www.ghezelbaash.ir/#doctor');
    const clinicNode = nodesById.get('https://www.ghezelbaash.ir/#clinic');
    assert(clinicNode?.aggregateRating?.ratingValue === googleMapsEvidence.ratingValue && clinicNode?.aggregateRating?.ratingCount === googleMapsEvidence.reviewCount, 'Visible Google rating and clinic graph rating drifted.');
    const doctorIdentifiers = new Set((doctorNode?.identifier ?? []).map((item) => `${item.propertyID}:${item.value}`));
    const clinicIdentifiers = new Set((clinicNode?.identifier ?? []).map((item) => `${item.propertyID}:${item.value}`));
    assert([...doctorIdentifiers].every((value) => !clinicIdentifiers.has(value)), 'Doctor and clinic identifier ownership overlap.');

    const chunks = JSON.parse(read(resolve(dist, 'assets/data/chunks.json')));
    assert(chunks.length >= 100 && chunks.length <= 500, `Chunk count outside 100–500: ${chunks.length}`);
    const llms = read(resolve(dist, 'llms-full.txt'));
    assert(!llms.includes('TODO_VISIBLE_CONTENT'), 'Placeholder in LLMS corpus.');
    for (const chunk of chunks) assert(llms.includes(chunk.text), `Chunk absent from LLMS: ${chunk.id}`);
    const sitemap = read(resolve(dist, 'sitemap.xml'));
    assert(occurrences(sitemap, /<url>/gu) === 1, 'Sitemap must contain one URL.');
    assert(occurrences(sitemap, /<video:video>/gu) === publishable.length, 'Sitemap video count mismatch.');
    assert(sitemap.includes(`<lastmod>${releaseDefinition.dateModified}</lastmod>`), 'Sitemap lastmod drifted from release metadata.');

    for (const url of [...html.matchAll(/(?:href|src)="([^"]+)"/gu)].map((match) => match[1])) {
      if (!url.startsWith('/') || url === '/') continue;
      assert(existsSync(resolve(dist, url.split(/[?#]/u)[0].replace(/^\//u, ''))), `Broken local link: ${url}`);
    }
    for (const value of [...html.matchAll(/(?:srcset|imagesrcset)="([^"]+)"/gu)].map((match) => match[1])) {
      for (const candidate of value.split(',').map((item) => item.trim().split(/\s+/u)[0])) {
        if (!candidate.startsWith('/')) continue;
        assert(existsSync(resolve(dist, candidate.split(/[?#]/u)[0].replace(/^\//u, ''))), `Broken responsive image candidate: ${candidate}`);
      }
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
    const redirects = read(resolve(dist, '_redirects')).trim().split(/\r?\n/u);
    assert(JSON.stringify(redirects) === JSON.stringify(['/index.html / 301', '/index / 301', '/graph.jsonld /knowledge-graph.jsonld 301']), '_redirects contract failed.');
    const notFound = read(resolve(dist, '404.html'));
    assert(notFound.includes('noindex') && !/rel="canonical"/iu.test(notFound), '404 contract failed.');
    const release = JSON.parse(read(resolve(dist, 'release.json')));
    assert(release.contentFrozen === releaseDefinition.contentFrozen && release.releaseStatus === releaseDefinition.releaseStatus, 'Release status drifted from the source definition.');
    for (const [field, file] of [['htmlSha256','index.html'],['graphSha256','knowledge-graph.jsonld'],['llmsSha256','llms-full.txt']]) assert(release[field] === sha(readFileSync(resolve(dist, file))), `Digest mismatch: ${field}`);
    assert(release.mediaPolicy?.publishableVideos === publishable.length, 'Release media policy mismatch.');
    for (const dataset of datasets) assert(JSON.stringify(graph).includes(dataset.url), `Dataset absent from canonical graph: ${dataset.url}`);
    assert(!html.includes('id="datasets"'), 'Machine dataset section must not be user-visible.');
  }
}

const reportDir = resolve(root, 'audit/generated');
mkdirSync(reportDir, { recursive: true });
writeFileSync(resolve(reportDir, `production-validation-${mode}.json`), `${JSON.stringify({ mode, passed: errors.length === 0, errors, warnings, generatedAt: new Date().toISOString() }, null, 2)}\n`);
if (warnings.length) process.stdout.write(`${warnings.join('\n')}\n`);
if (errors.length) { process.stderr.write(`${errors.join('\n')}\n`); process.exitCode = 1; }
else process.stdout.write(`Production validation passed: ${mode}.\n`);
