import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { extname, relative, resolve } from 'node:path';
import { datasets } from '../src/data/datasets.ts';
import { requiredVisibleFiles, sections } from '../src/data/sections.ts';
import { videos } from '../src/data/videos.ts';
import { validateHtmlAnchors } from '../src/utils/validateAnchors.ts';
import { validateContentInputs } from '../src/utils/validateContent.ts';
import { validateDatasets } from '../src/utils/validateDatasets.ts';
import { validateMediaInputs } from '../src/utils/validateMedia.ts';
import { validateGraphObject } from '../src/utils/validateSchema.ts';

const root = process.cwd();
const dist = resolve(root, 'dist');
const mode = process.argv[2] ?? 'all';
const strict = mode !== 'structure';
const errors = [];
const warnings = [];
const checks = [];

const record = (name, foundErrors = [], foundWarnings = []) => {
  errors.push(...foundErrors.map((message) => `[${name}] ${message}`));
  warnings.push(...foundWarnings.map((message) => `[${name}] ${message}`));
  checks.push({ name, errors: foundErrors, warnings: foundWarnings });
};
const read = (path) => readFileSync(path, 'utf8');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const count = (text, pattern) => [...text.matchAll(pattern)].length;
const filesRecursive = (directory) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesRecursive(path) : [path];
  });
};
const parseInlineGraph = (html) => {
  const matches = [...html.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/giu)];
  if (matches.length !== 1) throw new Error(`Expected exactly one inline JSON-LD block, found ${matches.length}.`);
  return JSON.parse(matches[0][1]);
};

const validateSourceStructure = () => {
  const expected = [
    'src/pages/index.astro',
    'src/layouts/BaseLayout.astro',
    'src/components/Header.astro',
    'src/components/Hero.astro',
    'src/components/DoctorProfile.astro',
    'src/components/ClinicProfile.astro',
    'src/components/EntityRelationship.astro',
    'src/components/EvidenceSummary.astro',
    'src/components/TopicSection.astro',
    'src/components/ComparisonTable.astro',
    'src/components/FAQ.astro',
    'src/components/References.astro',
    'src/components/DatasetSection.astro',
    'src/components/VideoSection.astro',
    'src/components/Footer.astro',
    'src/data/doctor.ts',
    'src/data/clinic.ts',
    'src/data/sections.ts',
    'src/data/topics.ts',
    'src/data/comparisons.ts',
    'src/data/faq.ts',
    'src/data/references.ts',
    'src/data/images.ts',
    'src/data/videos.ts',
    'src/data/datasets.ts',
    'src/data/release.ts',
    'src/utils/schema.ts',
    'src/utils/graph.ts',
    'src/utils/chunks.ts',
    'src/utils/llms.ts',
    'src/utils/sitemap.ts',
    'src/utils/normalizePersian.ts',
    'src/utils/validateContent.ts',
    'src/utils/validateSchema.ts',
    'src/utils/validateAnchors.ts',
    'src/utils/validateMedia.ts',
    'src/utils/validateDatasets.ts',
    'src/utils/seo.ts',
    'src/styles/main.css',
  ];
  const localErrors = expected
    .filter((path) => !existsSync(resolve(root, path)))
    .map((path) => `Missing required source file: ${path}`);
  const pageFiles = filesRecursive(resolve(root, 'src/pages')).map((path) =>
    relative(resolve(root, 'src/pages'), path),
  );
  const unexpectedPages = pageFiles.filter((path) => path !== 'index.astro');
  localErrors.push(...unexpectedPages.map((path) => `Unexpected page route: src/pages/${path}`));
  for (const file of requiredVisibleFiles) {
    if (!existsSync(resolve(root, 'src/content/visible', file))) {
      localErrors.push(`Missing content slot: ${file}`);
    }
  }
  record('structure', localErrors);
};

const validateInputs = () => {
  const content = validateContentInputs(root);
  record('content-inputs', content.errors, content.warnings);
  record('media-inputs', validateMediaInputs(root));
  record('dataset-inputs', validateDatasets());
};

const validateHtml = (productionStrict) => {
  const path = resolve(dist, 'index.html');
  if (!existsSync(path)) return record('html', ['dist/index.html is missing.']);
  const html = read(path);
  const localErrors = [];
  if (!/^<!doctype html>/iu.test(html)) localErrors.push('HTML5 doctype is missing.');
  if (!/<html[^>]+lang="fa-IR"[^>]+dir="rtl"/iu.test(html)) {
    localErrors.push('Root html language/direction contract is missing.');
  }
  if (count(html, /<main(?:\s|>)/giu) !== 1) localErrors.push('Expected exactly one main element.');
  if (count(html, /<h1(?:\s|>)/giu) !== 1) localErrors.push('Expected exactly one H1.');
  if (!html.includes('id="main-content"')) localErrors.push('main-content anchor is missing.');
  if (/<canvas(?:\s|>)/iu.test(html)) localErrors.push('Canvas is prohibited.');
  if (/shadowrootmode=/iu.test(html)) localErrors.push('Declarative Shadow DOM is prohibited.');
  if (/<iframe/iu.test(html)) localErrors.push('Iframe is prohibited.');
  if (/\sautoplay(?:\s|=|>)/iu.test(html)) localErrors.push('Video autoplay is prohibited.');
  if (/preload="(?:metadata|auto)"/iu.test(html)) localErrors.push('Video preload must be none.');
  if (/http:\/\//iu.test(html)) localErrors.push('Mixed-content HTTP URL found in HTML.');
  if (productionStrict && html.includes('TODO_VISIBLE_CONTENT')) {
    localErrors.push('Unresolved visible-content placeholder found in HTML.');
  }
  for (const section of sections) {
    if (!html.includes(`id="${section.id}"`)) localErrors.push(`Missing main section: ${section.id}`);
  }
  record('html', localErrors);
};

const validateSchema = (productionStrict) => {
  const htmlPath = resolve(dist, 'index.html');
  const graphPath = resolve(dist, 'graph.jsonld');
  if (!existsSync(htmlPath) || !existsSync(graphPath)) {
    return record('schema', ['HTML or external graph is missing.']);
  }
  const localErrors = [];
  let inline;
  let external;
  try {
    inline = parseInlineGraph(read(htmlPath));
    external = JSON.parse(read(graphPath));
  } catch (error) {
    return record('schema', [error instanceof Error ? error.message : String(error)]);
  }
  if (JSON.stringify(inline) !== JSON.stringify(external)) {
    localErrors.push('Inline graph and graph.jsonld are not identical projections.');
  }
  localErrors.push(...validateGraphObject(external));
  const nodes = external['@graph'];
  const page = nodes.find((node) => node['@id'] === 'https://www.ghezelbaash.ir/#webpage');
  if (page?.mainEntity?.['@id'] !== 'https://www.ghezelbaash.ir/#doctor') {
    localErrors.push('Doctor is not the sole page mainEntity.');
  }
  const requiredTypes = [
    'WebSite',
    'ProfilePage',
    'MedicalWebPage',
    'Person',
    'MedicalClinic',
    'PostalAddress',
    'GeoCoordinates',
    'WebPageElement',
    'ItemList',
    'ContactPoint',
    'City',
    'Country',
    'CreativeWork',
    'Dataset',
  ];
  const presentTypes = new Set(
    nodes.flatMap((node) => (Array.isArray(node['@type']) ? node['@type'] : [node['@type']])),
  );
  for (const type of requiredTypes) {
    if (!presentTypes.has(type)) localErrors.push(`Missing required schema type: ${type}`);
  }
  if (productionStrict) {
    for (const type of ['ImageObject', 'FAQPage', 'Question', 'Answer', 'DefinedTermSet', 'DefinedTerm', 'MedicalProcedure', 'VideoObject']) {
      if (!presentTypes.has(type)) localErrors.push(`Missing production schema type: ${type}`);
    }
  }
  const ids = new Set(nodes.map((node) => node['@id']));
  const serialized = JSON.stringify(external);
  for (const match of serialized.matchAll(/"@id":"(https:\/\/www\.ghezelbaash\.ir\/#.*?)"/gu)) {
    if (!ids.has(match[1])) localErrors.push(`Dangling same-site graph reference: ${match[1]}`);
  }
  if (serialized.includes('https://ghezelbaash.ir/')) {
    localErrors.push('Non-www canonical-domain URL found in graph.');
  }
  record('schema', localErrors);
};

const validateLinks = () => {
  const htmlPath = resolve(dist, 'index.html');
  if (!existsSync(htmlPath)) return record('links', ['dist/index.html is missing.']);
  const html = read(htmlPath);
  const localErrors = [];
  const urls = [...html.matchAll(/(?:href|src)="([^"]+)"/gu)].map((match) => match[1]);
  for (const url of urls) {
    if (url.startsWith('#') || url.startsWith('tel:') || url.startsWith('mailto:')) continue;
    if (/^https?:\/\//u.test(url)) continue;
    if (!url.startsWith('/')) continue;
    const pathname = url.split(/[?#]/u)[0];
    if (pathname === '/') continue;
    const target = resolve(dist, pathname.replace(/^\//u, ''));
    if (!existsSync(target)) localErrors.push(`Broken internal asset link: ${url}`);
  }
  record('links', localErrors);
};

const validateAnchors = () => {
  const htmlPath = resolve(dist, 'index.html');
  record('anchors', existsSync(htmlPath) ? validateHtmlAnchors(read(htmlPath)) : ['dist/index.html is missing.']);
};

const validateCanonical = () => {
  const htmlPath = resolve(dist, 'index.html');
  const sitemapPath = resolve(dist, 'sitemap.xml');
  const localErrors = [];
  if (!existsSync(htmlPath) || !existsSync(sitemapPath)) {
    return record('canonical', ['HTML or sitemap is missing.']);
  }
  const html = read(htmlPath);
  const sitemap = read(sitemapPath);
  if (count(html, /<link\s+rel="canonical"/giu) !== 1) {
    localErrors.push('Expected exactly one canonical link.');
  }
  if (!html.includes('rel="canonical" href="https://www.ghezelbaash.ir/"')) {
    localErrors.push('Canonical URL is not the exact www root URL.');
  }
  if (!sitemap.includes('<loc>https://www.ghezelbaash.ir/</loc>')) {
    localErrors.push('Sitemap canonical URL differs from HTML.');
  }
  const redirect = existsSync(resolve(dist, '_redirects')) ? read(resolve(dist, '_redirects')).trim() : '';
  if (redirect !== '/index.html / 301') localErrors.push('_redirects must contain only /index.html / 301.');
  const notFound = existsSync(resolve(dist, '404.html')) ? read(resolve(dist, '404.html')) : '';
  if (!notFound.includes('noindex') || /rel="canonical"/iu.test(notFound) || /<script/iu.test(notFound)) {
    localErrors.push('404.html noindex/canonical/script contract failed.');
  }
  record('canonical', localErrors);
};

const validateBudgets = (productionStrict) => {
  const htmlPath = resolve(dist, 'index.html');
  if (!existsSync(htmlPath)) return record('budgets', ['dist/index.html is missing.']);
  const html = readFileSync(htmlPath);
  const localErrors = [];
  const htmlRaw = html.byteLength;
  const htmlGzip = gzipSync(html).byteLength;
  const htmlText = html.toString('utf8');
  const domNodes = count(htmlText, /<[a-z][^>]*>/giu);
  if (htmlRaw > 1_700_000) localErrors.push(`HTML raw budget exceeded: ${htmlRaw} bytes.`);
  if (productionStrict && htmlRaw < 600_000) localErrors.push(`HTML raw production floor not met: ${htmlRaw} bytes.`);
  if (productionStrict && (htmlGzip < 100_000 || htmlGzip > 300_000)) {
    localErrors.push(`HTML gzip range failed: ${htmlGzip} bytes.`);
  }
  if (domNodes > 4500) localErrors.push(`DOM node ceiling exceeded: ${domNodes}.`);
  for (const file of filesRecursive(resolve(dist, 'assets/css'))) {
    if (extname(file) === '.css' && gzipSync(readFileSync(file)).byteLength > 25_000) {
      localErrors.push(`CSS gzip budget exceeded: ${relative(dist, file)}`);
    }
  }
  for (const file of filesRecursive(dist)) {
    if (extname(file) === '.js' && gzipSync(readFileSync(file)).byteLength > 30_000) {
      localErrors.push(`JS gzip budget exceeded: ${relative(dist, file)}`);
    }
    if (extname(file) === '.map') localErrors.push(`Public source map found: ${relative(dist, file)}`);
  }
  const fonts = filesRecursive(resolve(dist, 'assets/fonts')).filter(
    (file) => extname(file) === '.woff2',
  );
  if (productionStrict && fonts.length !== 1) {
    localErrors.push(`Expected exactly one Persian WOFF2 font; found ${fonts.length}.`);
  }
  for (const file of fonts) {
    const bytes = statSync(file).size;
    if (bytes < 80_000 || bytes > 180_000) {
      localErrors.push(`WOFF2 size range failed: ${relative(dist, file)} (${bytes} bytes).`);
    }
  }
  const manifestPath = resolve(dist, 'asset-manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(read(manifestPath));
    const lcpPath = manifest.images?.['doctor-portrait']?.webp;
    if (productionStrict && lcpPath) {
      const lcpFile = resolve(dist, lcpPath.replace(/^\//u, ''));
      if (existsSync(lcpFile) && statSync(lcpFile).size > 180_000) {
        localErrors.push(`LCP image budget exceeded: ${statSync(lcpFile).size} bytes.`);
      }
    }
  }
  record('budgets', localErrors, [
    `htmlRaw=${htmlRaw}`,
    `htmlGzip=${htmlGzip}`,
    `domNodes=${domNodes}`,
  ]);
};

const validatePersian = () => {
  const htmlPath = resolve(dist, 'index.html');
  if (!existsSync(htmlPath)) return record('persian', ['dist/index.html is missing.']);
  const visibleText = read(htmlPath)
    .replace(/<script[\s\S]*?<\/script>/giu, '')
    .replace(/<style[\s\S]*?<\/style>/giu, '')
    .replace(/<[^>]+>/gu, ' ');
  record('persian', /[يك]/u.test(visibleText) ? ['Arabic ي or ك remains in visible HTML.'] : []);
};

const validateLlms = (productionStrict) => {
  const localErrors = [];
  const llmsPath = resolve(dist, 'llms-full.txt');
  const chunksPath = resolve(dist, 'assets/data/chunks.json');
  if (!existsSync(llmsPath) || !existsSync(chunksPath)) {
    return record('llms', ['LLMS or chunks artifact is missing.']);
  }
  const llms = read(llmsPath);
  const chunks = JSON.parse(read(chunksPath));
  if (productionStrict && (chunks.length < 150 || chunks.length > 280)) {
    localErrors.push(`Chunk count must be 150–280; found ${chunks.length}.`);
  }
  if (productionStrict && llms.includes('TODO_VISIBLE_CONTENT')) {
    localErrors.push('llms-full.txt contains a placeholder.');
  }
  for (const chunk of chunks) {
    if (!llms.includes(chunk.text)) localErrors.push(`Chunk missing from llms-full.txt: ${chunk.id}`);
  }
  record('llms', localErrors);
};

const validateNoPagesDev = () => {
  const localErrors = [];
  for (const file of filesRecursive(dist)) {
    if (statSync(file).size > 2_000_000) continue;
    const text = readFileSync(file).toString('utf8');
    if (text.includes('pages.dev')) localErrors.push(`pages.dev found in ${relative(dist, file)}`);
  }
  record('no-pages-dev', localErrors);
};

const validateNoServiceFlags = () => {
  const localErrors = [];
  const forbiddenFieldNames = [
    ['provided', 'As', 'Service'].join(''),
    ['not', 'Provided'].join(''),
    ['allow', 'Service', 'Schema'].join(''),
    ['allow', 'Offer'].join(''),
    ['allow', 'CTA'].join(''),
    ['service', 'Status'].join(''),
    ['available', 'Service'].join(''),
  ];
  const forbiddenFields = new RegExp(`\\b(${forbiddenFieldNames.join('|')})\\b`, 'gu');
  for (const directory of ['src/data', 'src/components', 'src/pages', 'dist/assets/data']) {
    for (const file of filesRecursive(resolve(root, directory))) {
      if (statSync(file).size > 2_000_000) continue;
      if (forbiddenFields.test(readFileSync(file).toString('utf8'))) {
        localErrors.push(`Forbidden service-layer field found: ${relative(root, file)}`);
      }
      forbiddenFields.lastIndex = 0;
    }
  }
  record('no-service-flags', localErrors);
};

const validateHeaders = () => {
  const path = resolve(dist, '_headers');
  if (!existsSync(path)) return record('headers', ['dist/_headers is missing.']);
  const headers = read(path);
  const localErrors = [];
  for (const required of [
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy: strict-origin-when-cross-origin',
    'Permissions-Policy:',
    'X-Frame-Options: DENY',
    'Content-Security-Policy:',
    "script-src 'self' 'sha256-",
  ]) {
    if (!headers.includes(required)) localErrors.push(`Missing required header: ${required}`);
  }
  if (headers.includes('__JSON_LD_HASH__')) localErrors.push('CSP hash placeholder remains.');
  record('headers', localErrors);
};

const validateSitemap = (productionStrict) => {
  const path = resolve(dist, 'sitemap.xml');
  if (!existsSync(path)) return record('sitemap', ['dist/sitemap.xml is missing.']);
  const sitemap = read(path);
  const localErrors = [];
  if (count(sitemap, /<url>/gu) !== 1) localErrors.push('Sitemap must contain exactly one primary URL.');
  if (count(sitemap, /<loc>https:\/\/www\.ghezelbaash\.ir\/<\/loc>/gu) !== 1) {
    localErrors.push('Sitemap root loc must occur exactly once.');
  }
  if (productionStrict && count(sitemap, /<video:video>/gu) !== videos.length) {
    localErrors.push('Sitemap video entry count does not match video definitions.');
  }
  record('sitemap', localErrors);
};

const validateRobots = () => {
  const path = resolve(dist, 'robots.txt');
  if (!existsSync(path)) return record('robots', ['dist/robots.txt is missing.']);
  const robots = read(path);
  const localErrors = [];
  if (!robots.includes('User-agent: *') || !robots.includes('Allow: /')) {
    localErrors.push('robots.txt allow contract failed.');
  }
  if (/Disallow:\s*\/(?:assets|graph\.jsonld|llms)/iu.test(robots)) {
    localErrors.push('robots.txt blocks a required machine-readable asset.');
  }
  if (!robots.includes('Sitemap: https://www.ghezelbaash.ir/sitemap.xml')) {
    localErrors.push('robots.txt sitemap line is missing.');
  }
  record('robots', localErrors);
};

const validateMedia = (productionStrict) => {
  const manifestPath = resolve(dist, 'asset-manifest.json');
  if (!existsSync(manifestPath)) return record('media', ['dist/asset-manifest.json is missing.']);
  const manifest = JSON.parse(read(manifestPath));
  const localErrors = [];
  if (!manifest.css) localErrors.push('Hashed CSS asset is missing.');
  if (productionStrict && !manifest.font) localErrors.push('Self-hosted Persian WOFF2 asset is missing.');
  if (productionStrict && Object.keys(manifest.images).length !== 9) {
    localErrors.push(`Expected 9 image definitions, found ${Object.keys(manifest.images).length}.`);
  }
  for (const [id, asset] of Object.entries(manifest.images)) {
    if (productionStrict && (!asset.avif || !asset.webp || !asset.fallback)) {
      localErrors.push(`Image formats incomplete: ${id}`);
    }
  }
  if (productionStrict) {
    for (const [id, asset] of Object.entries(manifest.videos)) {
      if (!asset.mp4 || !asset.webm || !asset.poster || !asset.captions) {
        localErrors.push(`Video asset formats incomplete: ${id}`);
      }
    }
  }
  record('media', localErrors);
};

const validateVideo = (productionStrict) => {
  const htmlPath = resolve(dist, 'index.html');
  if (!existsSync(htmlPath)) return record('video', ['dist/index.html is missing.']);
  const html = read(htmlPath);
  const localErrors = [];
  const videoTagCount = count(html, /<video(?:\s|>)/giu);
  if (productionStrict && videoTagCount !== videos.length) {
    localErrors.push(`Expected ${videos.length} video elements, found ${videoTagCount}.`);
  }
  if (/\sautoplay(?:\s|=|>)/iu.test(html)) localErrors.push('Autoplay found.');
  if (/preload="(?:metadata|auto)"/iu.test(html)) localErrors.push('Invalid video preload found.');
  if (productionStrict) {
    for (const video of videos) {
      const block = html.match(
        new RegExp(`<section[^>]+id="${video.id}"[\\s\\S]*?<\\/section>`, 'u'),
      )?.[0];
      if (!block) {
        localErrors.push(`Missing video section: ${video.id}`);
        continue;
      }
      for (const token of ['controls', 'preload="none"', '<track', 'kind="captions"', 'video-transcript']) {
        if (!block.includes(token)) localErrors.push(`Video contract missing ${token}: ${video.id}`);
      }
    }
  }
  record('video', localErrors);
};

const validateVideoSchema = (productionStrict) => {
  const htmlPath = resolve(dist, 'index.html');
  if (!existsSync(htmlPath)) return record('video-schema', ['dist/index.html is missing.']);
  let graph;
  try {
    graph = parseInlineGraph(read(htmlPath));
  } catch (error) {
    return record('video-schema', [error instanceof Error ? error.message : String(error)]);
  }
  const videoNodes = graph['@graph'].filter((node) => {
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    return types.includes('VideoObject');
  });
  const localErrors = [];
  if (productionStrict && videoNodes.length !== videos.length) {
    localErrors.push(`Expected ${videos.length} VideoObject nodes, found ${videoNodes.length}.`);
  }
  if (JSON.stringify(graph).includes('"@type":"Review"')) localErrors.push('Review schema is prohibited.');
  record('video-schema', localErrors);
};

const validateDatasetOutput = () => {
  const htmlPath = resolve(dist, 'index.html');
  const graphPath = resolve(dist, 'graph.jsonld');
  if (!existsSync(htmlPath) || !existsSync(graphPath)) {
    return record('datasets', ['HTML or graph is missing.']);
  }
  const html = read(htmlPath);
  const graph = read(graphPath);
  const localErrors = validateDatasets();
  if (!html.includes('id="datasets"') || !html.includes('lang="en"') || !html.includes('dir="ltr"')) {
    localErrors.push('Visible dataset section language/direction contract failed.');
  }
  for (const dataset of datasets) {
    if (!html.includes(dataset.url)) localErrors.push(`Dataset URL missing from HTML: ${dataset.url}`);
    if (!graph.includes(dataset.url)) localErrors.push(`Dataset URL missing from graph: ${dataset.url}`);
  }
  record('datasets', localErrors);
};

const validateRelease = (productionStrict) => {
  const path = resolve(dist, 'release.json');
  if (!existsSync(path)) return record('release', ['dist/release.json is missing.']);
  const release = JSON.parse(read(path));
  const localErrors = [];
  for (const [field, file] of [
    ['htmlSha256', 'index.html'],
    ['graphSha256', 'graph.jsonld'],
    ['llmsSha256', 'llms-full.txt'],
  ]) {
    const expected = sha256(readFileSync(resolve(dist, file)));
    if (release[field] !== expected) localErrors.push(`Release digest mismatch: ${field}`);
  }
  if (productionStrict && release.contentFrozen !== true) {
    localErrors.push('Production release must declare contentFrozen=true.');
  }
  record('release', localErrors);
};

const runForMode = () => {
  validateSourceStructure();
  if (mode === 'inputs') return validateInputs();
  if (mode === 'html') return validateHtml(true);
  if (mode === 'schema' || mode === 'graph') return validateSchema(true);
  if (mode === 'links') return validateLinks();
  if (mode === 'anchors') return validateAnchors();
  if (mode === 'canonical') return validateCanonical();
  if (mode === 'budgets') return validateBudgets(true);
  if (mode === 'persian') return validatePersian();
  if (mode === 'llms') return validateLlms(true);
  if (mode === 'no-pages-dev') return validateNoPagesDev();
  if (mode === 'no-service-flags') return validateNoServiceFlags();
  if (mode === 'headers') return validateHeaders();
  if (mode === 'sitemap') return validateSitemap(true);
  if (mode === 'robots') return validateRobots();
  if (mode === 'media') return validateMedia(true);
  if (mode === 'video') return validateVideo(true);
  if (mode === 'video-schema') return validateVideoSchema(true);
  if (mode === 'datasets') return validateDatasetOutput();
  if (mode === 'release') return validateRelease(true);
  if (mode === 'structure') {
    validateHtml(false);
    validateSchema(false);
    validateLinks();
    validateAnchors();
    validateCanonical();
    validateBudgets(false);
    validatePersian();
    validateNoPagesDev();
    validateNoServiceFlags();
    validateHeaders();
    validateSitemap(false);
    validateRobots();
    validateMedia(false);
    validateVideo(false);
    validateVideoSchema(false);
    validateDatasetOutput();
    validateRelease(false);
    return;
  }
  if (mode !== 'all') {
    record('mode', [`Unknown validation mode: ${mode}`]);
    return;
  }
  validateInputs();
  validateHtml(true);
  validateSchema(true);
  validateLinks();
  validateAnchors();
  validateCanonical();
  validateBudgets(true);
  validatePersian();
  validateLlms(true);
  validateNoPagesDev();
  validateNoServiceFlags();
  validateHeaders();
  validateSitemap(true);
  validateRobots();
  validateMedia(true);
  validateVideo(true);
  validateVideoSchema(true);
  validateDatasetOutput();
  validateRelease(true);
};

runForMode();

const reportDirectory = resolve(root, 'audit/generated');
mkdirSync(reportDirectory, { recursive: true });
writeFileSync(
  resolve(reportDirectory, `validation-${mode}.json`),
  `${JSON.stringify(
    {
      mode,
      strict,
      passed: errors.length === 0,
      errors,
      warnings,
      checks,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
  'utf8',
);

if (warnings.length > 0) process.stdout.write(`${warnings.join('\n')}\n`);
if (errors.length > 0) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Validation passed: ${mode} (${checks.length} checks).\n`);
}
