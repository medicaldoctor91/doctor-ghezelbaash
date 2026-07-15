import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import { homepageGraphSyncContract } from '../src/domain/homepage-graph-sync.mjs';
import { homepageArticleSubsections } from '../src/domain/homepage-article-registry.mjs';
import { homepageExternalDirectoryContract } from '../src/domain/homepage-external-directory.mjs';
import { videos } from '../src/domain/media.mjs';

const cwd = process.cwd();
const dist = join(cwd, 'dist');
const reportDirectory = join(cwd, 'build-reports');
const site = 'https://www.ghezelbaash.ir/';
const id = (fragment) => `${site}#${fragment}`;
const failures = [];
const criteria = [];
const asArray = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];
const hasType = (node, type) => asArray(node?.['@type']).includes(type);
const decode = (value) => String(value ?? '')
  .replaceAll('&nbsp;', ' ')
  .replaceAll('&zwnj;', '‌')
  .replaceAll('&amp;', '&')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"')
  .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)));
const plain = (value) => decode(value)
  .replace(/<script[\s\S]*?<\/script>/giu, ' ')
  .replace(/<style[\s\S]*?<\/style>/giu, ' ')
  .replace(/<[^>]+>/gu, ' ')
  .replace(/[\u200c\s]+/gu, ' ')
  .trim();
const words = (value) => plain(value).split(/\s+/u).filter(Boolean).length;
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
};
const equal = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const pick = (node, fields) => Object.fromEntries(fields.filter((field) => node?.[field] !== undefined).map((field) => [field, node[field]]));
const collectFiles = (directory, output = []) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    statSync(path).isDirectory() ? collectFiles(path, output) : output.push(path);
  }
  return output;
};
const gitBlobSha = (content) => createHash('sha1')
  .update(`blob ${Buffer.byteLength(content)}\0`)
  .update(content)
  .digest('hex');

function register(idValue, title, checks, evidence = {}) {
  const failed = checks.filter(([condition]) => !condition).map(([, message]) => message);
  const pass = failed.length === 0;
  criteria.push({ id: idValue, title, status: pass ? 'pass' : 'fail', evidence });
  for (const message of failed) failures.push(`${idValue}: ${message}`);
}

if (!existsSync(dist)) {
  console.error(JSON.stringify({ status: 'fail', stage: 9, failures: ['dist directory is absent; run Astro build before Stage 9'] }, null, 2));
  process.exit(1);
}

const homepagePath = join(dist, 'index.html');
const homepage = readFileSync(homepagePath, 'utf8');
const headers = readFileSync(join(dist, '_headers'), 'utf8');
const canonical = JSON.parse(readFileSync(join(dist, 'knowledge-graph.jsonld'), 'utf8'));
const llms = readFileSync(join(dist, 'llms.txt'), 'utf8');
const ai = readFileSync(join(dist, '.well-known', 'ai.txt'), 'utf8');
const robots = readFileSync(join(dist, 'robots.txt'), 'utf8');
const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8');
const imageSitemap = readFileSync(join(dist, 'image-sitemap.xml'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
const landingSource = readFileSync(join(cwd, 'src', 'content', 'landing.md'), 'utf8');
const releaseRecordPath = join(cwd, 'docs', 'homepage-stage-9-production-control.md');
const deploymentStatusPath = join(cwd, 'docs', 'deployment-status.md');
const releaseRecord = existsSync(releaseRecordPath) ? readFileSync(releaseRecordPath, 'utf8') : '';
const deploymentStatus = existsSync(deploymentStatusPath) ? readFileSync(deploymentStatusPath, 'utf8') : '';
const workflow = readFileSync(join(cwd, '.github', 'workflows', 'verify-production.yml'), 'utf8');
const allDistFiles = collectFiles(dist);
const htmlFiles = allDistFiles.filter((path) => path.endsWith('.html')).map((path) => relative(dist, path));

const h1Matches = [...homepage.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/giu)];
const h1 = plain(h1Matches[0]?.[1] ?? '');
const allIds = [...homepage.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
const idSet = new Set(allIds);
const fragmentLinks = [...homepage.matchAll(/href="#([^"]+)"/gu)].map((match) => match[1]);
const brokenFragments = [...new Set(fragmentLinks.filter((fragment) => !idSet.has(fragment)))];
const position = (fragment) => homepage.indexOf(`id="${fragment}"`);
const personFragment = homepageGraphSyncContract.entities.person;
const clinicFragment = homepageGraphSyncContract.entities.clinic;
const personStart = position(personFragment);
const personEnd = homepage.indexOf('</header>', personStart);
const personBlock = homepage.slice(personStart, personEnd + 9);
const introHtml = personBlock.match(/<div\b[^>]*data-physician-introduction[^>]*>([\s\S]*?)<\/div>/u)?.[1] ?? '';
const introWords = words(introHtml);
const tocStart = position(homepageGraphSyncContract.toc.id);
const tocEnd = homepage.indexOf('</nav>', tocStart);
const tocHtml = homepage.slice(tocStart, tocEnd + 6);
const tocOrder = [...tocHtml.matchAll(/<a\b[^>]*href="#([^"]+)"/gu)]
  .map((match) => match[1])
  .filter((fragment) => homepageGraphSyncContract.toc.sectionIds.includes(fragment));
const sectionPositions = homepageGraphSyncContract.sections.map((section) => position(section.id));
const mainStart = homepage.indexOf('<main');
const mainEnd = homepage.indexOf('</main>', mainStart);
const mainHtml = homepage.slice(mainStart, mainEnd + 7);
const mainWordCount = words(mainHtml);
const headingLevels = [...homepage.matchAll(/<h([1-4])\b/giu)].map((match) => Number(match[1]));
const headingJumps = [];
for (let index = 1; index < headingLevels.length; index += 1) {
  if (headingLevels[index] > headingLevels[index - 1] + 1) headingJumps.push(`H${headingLevels[index - 1]}→H${headingLevels[index]}`);
}
const repeatedParagraphs = new Map();
for (const match of mainHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)) {
  const text = plain(match[1]);
  if (text.split(/\s+/u).length < 35) continue;
  repeatedParagraphs.set(text, (repeatedParagraphs.get(text) ?? 0) + 1);
}
const duplicateLongParagraphs = [...repeatedParagraphs].filter(([, count]) => count > 1);
const landingBlobSha = gitBlobSha(landingSource);
const baselineLandingBlobSha = '2489ae2d05bf12ad7ad8782d969f2b6d6abc8b72';

const inlineMatches = [...homepage.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gu)];
const inline = inlineMatches.length === 1 ? JSON.parse(inlineMatches[0][1]) : { '@graph': [] };
const graphEntries = [['inline', inline], ['canonical', canonical]];
const graphMaps = new Map(graphEntries.map(([label, graph]) => [label, new Map((graph['@graph'] ?? []).filter((node) => node?.['@id']).map((node) => [node['@id'], node]))]));
const personId = id(personFragment);
const clinicId = id(clinicFragment);
const webpageId = id(homepageGraphSyncContract.entities.webpage);
const websiteId = id(homepageGraphSyncContract.entities.website);
const articleId = id(homepageGraphSyncContract.webpage.articleId);
const tocId = id(homepageGraphSyncContract.toc.id);
const legacyEntityIds = [id('person'), id('clinic'), id('doctor')];
const forbiddenSpellings = ['mohammad-saeed-ghezelbaash', 'dr-ghezelbash-aesthetic-clinic'];
const canonicalById = graphMaps.get('canonical');
const inlineById = graphMaps.get('inline');
const canonicalPerson = canonicalById.get(personId);
const canonicalClinic = canonicalById.get(clinicId);
const canonicalPage = canonicalById.get(webpageId);
const canonicalWebsite = canonicalById.get(websiteId);
const canonicalArticle = canonicalById.get(articleId);
const canonicalToc = canonicalById.get(tocId);
const coverageRelationships = new Set();
for (const node of canonical['@graph'] ?? []) {
  for (const property of asArray(node?.additionalProperty)) {
    if (property?.propertyID === 'coverageRelationship') coverageRelationships.add(property.value);
  }
}

const htmlSectionTitlesMatch = homepageGraphSyncContract.sections.every((section) => {
  const rendered = plain(homepage.match(new RegExp(`<h2\\b[^>]*id="${section.id}-title"[^>]*>([\\s\\S]*?)<\\/h2>`, 'u'))?.[1] ?? '');
  return rendered === section.title;
});
const htmlSubsectionTitlesMatch = homepageArticleSubsections.every((section) => {
  const rendered = plain(homepage.match(new RegExp(`<h3\\b[^>]*id="${section.id}-title"[^>]*>([\\s\\S]*?)<\\/h3>`, 'u'))?.[1] ?? '');
  return rendered === section.title;
});

const videoFailures = [];
for (const video of homepageGraphSyncContract.videos) {
  const figureStart = position(video.graphId);
  const figureEnd = homepage.indexOf('</figure>', figureStart);
  const figure = homepage.slice(figureStart, figureEnd + 9);
  const destinationPosition = position(video.destinationId);
  if (figureStart < 0 || figureEnd <= figureStart) videoFailures.push(`${video.id}: figure missing`);
  if (destinationPosition < 0 || figureStart <= destinationPosition) videoFailures.push(`${video.id}: destination/order mismatch`);
  if (!figure.includes(video.title) || !figure.includes(video.description)) videoFailures.push(`${video.id}: visible copy mismatch`);
  if (!figure.includes(`poster="${video.thumbnail}"`) || !figure.includes(`src="/videos/${video.file}"`)) videoFailures.push(`${video.id}: media asset mismatch`);
  const node = canonicalById.get(id(video.graphId));
  if (!hasType(node, 'VideoObject') || node?.isPartOf?.['@id'] !== id(video.destinationId)) videoFailures.push(`${video.id}: VideoObject destination mismatch`);
}
const educationVideoIds = ['home-workshop-thread-lift-training', 'home-workshop-thread-lift-advanced'];
const educationStart = position('medical-education');
const researchEnd = position('clinic-information-kermanshah');
const educationPlacementPass = educationVideoIds.every((videoId) => {
  const value = position(`video-${videoId}`);
  return value > educationStart && value < researchEnd;
});
const clinicVideoStart = position('video-clinic-patient-experience-review');
const clinicStart = position('clinic-information-kermanshah');
const graphStart = position('knowledge-graph-and-datasets');
const clinicVideoBlock = homepage.slice(clinicVideoStart, homepage.indexOf('</figure>', clinicVideoStart) + 9);

const footerStart = homepage.indexOf('<footer');
const footerEnd = homepage.indexOf('</footer>', footerStart);
const footer = homepage.slice(footerStart, footerEnd + 9);
const expectedFooterGroupIds = homepageExternalDirectoryContract.map((group) => group.id);
const renderedFooterGroupIds = [...footer.matchAll(/data-footer-group="([^"]+)"/gu)].map((match) => match[1]);
const expectedDirectoryLinks = homepageExternalDirectoryContract.flatMap((group) => group.links);
const renderedDirectoryLinkIds = [...footer.matchAll(/data-footer-link="([^"]+)"/gu)].map((match) => match[1]);

const head = homepage.match(/<head>([\s\S]*?)<\/head>/u)?.[1] ?? '';
const authorLinks = [...head.matchAll(/<link\b[^>]*rel="author"[^>]*href="([^"]+)"[^>]*>/gu)].map((match) => match[1]);
const describedByLinks = [...head.matchAll(/<link\b[^>]*rel="describedby"[^>]*href="([^"]+)"[^>]*>/gu)].map((match) => match[1]);
const homepageHeaderBlock = headers.match(/\n\/\n([\s\S]*?)(?=\n\/404\.html\n)/u)?.[1] ?? '';
const httpLinks = [...homepageHeaderBlock.matchAll(/^\s*Link:\s*(.+)$/gmu)].map((match) => match[1].trim());
const expectedHttpLink = '</knowledge-graph.jsonld>; rel="describedby"; type="application/ld+json"';

const rootSitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
const imageSitemapLocations = [...imageSitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
const forbiddenPublicArtifacts = [
  'video-sitemap.xml', 'context.json', 'llms-full.txt', 'answers.json', 'search.json', 'intents.json', 'services.json',
  'authority-map.json', 'authority-network.json', 'decision-capsules.json', 'editorial-review.json', 'reputation.json',
  'claims.json', 'evidence.json', 'media.json', 'ontology.json', 'resolver.json', 'knowledge-manifest.json',
];
const forbiddenPresent = forbiddenPublicArtifacts.filter((path) => existsSync(join(dist, path)));

const rawBytes = statSync(homepagePath).size;
const gzipBytes = gzipSync(Buffer.from(homepage), { level: 9 }).length;
const brotliBytes = brotliCompressSync(Buffer.from(homepage), { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } }).length;
const domElements = (homepage.match(/<(?!\/|!|\?)[a-z][^>]*>/giu) ?? []).length;
const videoElements = homepage.match(/<video\b/giu) ?? [];
const videoPreloadNone = homepage.match(/<video\b[^>]*preload="none"/giu) ?? [];

register('AC-01', 'معماری استاتیک و مسیرهای canonical', [
  [htmlFiles.length === 2 && htmlFiles.includes('index.html') && htmlFiles.includes('404.html'), `HTML routes differ from index.html + 404.html: ${htmlFiles.join(', ')}`],
  [!htmlFiles.some((path) => path.startsWith('videos/')), 'standalone video watch HTML returned'],
], { htmlFiles });

register('AC-02', 'رأس Person-first و H1 مصوب', [
  [h1Matches.length === 1, `expected one H1; found ${h1Matches.length}`],
  [h1 === homepageGraphSyncContract.headline, `H1 mismatch: ${h1}`],
  [personStart >= 0 && personBlock.includes('data-main-entity="Person"'), 'canonical Person header is absent'],
  [introWords >= 180 && introWords <= 280, `Person introduction must be 180–280 words; found ${introWords}`],
], { h1, introWords, personFragment });

register('AC-03', 'تصویر اصلی، اعتبار و دو CTA', [
  [personBlock.includes('data-lcp-portrait') && personBlock.includes('loading="eager"') && personBlock.includes('fetchpriority="high"'), 'LCP portrait contract is incomplete'],
  [(personBlock.match(/data-primary-cta=/gu) ?? []).length === 2, 'Hero must expose exactly two primary CTAs'],
  [personBlock.includes('رزرو وقت مشاوره رایگان') && personBlock.includes('گفت‌وگوی آنلاین با دکتر قزلباش'), 'approved CTA labels are missing'],
  [personBlock.includes('https://www.google.com/maps?cid=12350483144643112463') && personBlock.includes('۱۶۳ ارزیابی Google Maps'), 'visible Maps rating provenance is incomplete'],
], { primaryCtas: (personBlock.match(/data-primary-cta=/gu) ?? []).length });

register('AC-04', 'Content Table واقعی و ترتیب ۱۶ مقصد', [
  [tocStart > personEnd, 'Content Table does not follow the complete Person header'],
  [JSON.stringify(tocOrder) === JSON.stringify(homepageGraphSyncContract.toc.sectionIds), 'visible TOC order differs from registry'],
  [(tocHtml.match(/<details\b/gu) ?? []).length === homepageGraphSyncContract.toc.groups.length, 'TOC group count mismatch'],
], { groups: homepageGraphSyncContract.toc.groups.length, items: tocOrder.length });

register('AC-05', 'اسکلت ۱۶ H2 و Fragment integrity', [
  [sectionPositions.every((value) => value >= 0), 'one or more canonical H2 sections are absent'],
  [sectionPositions.every((value, index) => index === 0 || value > sectionPositions[index - 1]), 'canonical H2 order is invalid'],
  [htmlSectionTitlesMatch, 'one or more visible H2 titles differ from registry'],
  [allIds.length === idSet.size, 'duplicate HTML IDs exist'],
  [brokenFragments.length === 0, `broken fragments: ${brokenFragments.join(', ')}`],
], { sections: homepageGraphSyncContract.sections.length, htmlIds: allIds.length });

register('AC-06', 'H3های canonical و سلسله‌مراتب Heading', [
  [htmlSubsectionTitlesMatch, 'one or more H3 IDs/titles differ from registry'],
  [headingJumps.length === 0, `heading-level jumps: ${headingJumps.join(', ')}`],
  [!homepage.includes('clinical-decision-model-'), 'legacy numeric heading IDs leaked into HTML'],
], { subsections: homepageArticleSubsections.length, headingJumps });

register('AC-07', 'حفظ baseline محتوای پزشکی و عمق صفحه', [
  [landingBlobSha === baselineLandingBlobSha, `landing.md baseline blob changed: ${landingBlobSha}`],
  [mainWordCount >= 18_000 && mainWordCount <= 23_000, `Homepage word count outside audited range: ${mainWordCount}`],
  [duplicateLongParagraphs.length === 0, `duplicate long paragraphs: ${duplicateLongParagraphs.length}`],
], { baselineCommit: 'c2608056ffb3ee6f35a1f7f097fdd2cccb17e46a', baselineLandingBlobSha, landingBlobSha, mainWordCount });

register('AC-08', 'تفکیک offered / evaluated / referral-context', [
  [coverageRelationships.has('offered'), 'offered relationship is absent from graph'],
  [coverageRelationships.has('evaluated'), 'evaluated relationship is absent from graph'],
  [coverageRelationships.has('referral-context'), 'referral-context relationship is absent from graph'],
], { coverageRelationships: [...coverageRelationships].sort() });

register('AC-09', 'نگاشت قطعی همه ویدئوها', [
  [homepageGraphSyncContract.videos.length === videos.length && videos.length === 12, `video registry count mismatch: ${videos.length}`],
  [videoFailures.length === 0, videoFailures.join('; ') || 'video placement mismatch'],
], { videos: videos.length });

register('AC-10', 'انحصار ویدئوهای آموزش پزشکی', [
  [educationPlacementPass, 'medical-education videos are not exclusively inside #medical-education'],
], { educationVideos: educationVideoIds });

register('AC-11', 'ویدئوی رضایت زیباجو در سکشن کلینیک', [
  [clinicVideoStart > clinicStart && clinicVideoStart < graphStart, 'testimonial video is outside Clinic section'],
  [clinicVideoBlock.includes('رضایت زیباجو از خدمات زیبایی دکتر سعید قزلباش'), 'approved testimonial title is absent'],
], { video: 'clinic-patient-experience-review', section: 'clinic-information-kermanshah' });

register('AC-12', 'اطلاعات و provenance کلینیک', [
  [position(clinicFragment) > clinicStart && position(clinicFragment) < graphStart, 'canonical Clinic entity anchor is outside Clinic section'],
  [homepage.slice(clinicStart, graphStart).includes('data-stage-seven-clinic'), 'Clinic Stage 7 marker is absent'],
  [homepage.slice(clinicStart, graphStart).includes('datetime="2026-07-14"'), 'rating observedAt provenance is absent'],
  [homepage.slice(clinicStart, graphStart).includes('۱۶۳ ارزیابی'), 'visible Clinic rating count is absent'],
], { clinicId, ratingValue: 5, ratingCount: 163, observedAt: '2026-07-14' });

register('AC-13', 'Footer و دایرکتوری پنج‌گانه', [
  [JSON.stringify(renderedFooterGroupIds) === JSON.stringify(expectedFooterGroupIds), 'Footer group IDs/order mismatch'],
  [renderedDirectoryLinkIds.length === expectedDirectoryLinks.length, `Footer link count mismatch: ${renderedDirectoryLinkIds.length}`],
  [new Set(renderedDirectoryLinkIds).size === renderedDirectoryLinkIds.length, 'duplicate Footer directory link IDs exist'],
  [!footer.includes('https://ig.me/m/doctor.ghezelbaash'), 'Instagram Direct leaked into Footer directory'],
], { groups: renderedFooterGroupIds.length, links: renderedDirectoryLinkIds.length });

register('AC-14', 'جداسازی Person و Clinic و mainEntity یکتا', [
  [hasType(canonicalPerson, 'Person'), 'canonical Person node is absent'],
  [hasType(canonicalClinic, 'MedicalClinic') && hasType(canonicalClinic, 'LocalBusiness'), 'canonical Clinic types are incomplete'],
  [canonicalPage?.mainEntity?.['@id'] === personId && !Array.isArray(canonicalPage?.mainEntity), 'Person is not the sole Homepage mainEntity'],
  [canonicalPerson?.worksFor?.['@id'] === clinicId && canonicalClinic?.employee?.['@id'] === personId, 'Person/Clinic relationship is incomplete'],
  [canonicalClinic?.hasMap === 'https://www.google.com/maps?cid=12350483144643112463', 'Clinic.hasMap mismatch'],
], { personId, clinicId, mainEntity: canonicalPage?.mainEntity?.['@id'] });

const graphParityFields = new Map([
  [personId, ['@type', '@id', 'name', 'url', 'mainEntityOfPage', 'worksFor', 'workLocation', 'affiliation']],
  [clinicId, ['@type', '@id', 'name', 'url', 'telephone', 'address', 'geo', 'hasMap', 'employee', 'aggregateRating']],
  [websiteId, ['@type', '@id', 'url', 'name', 'inLanguage', 'creator', 'publisher', 'about']],
  [webpageId, ['@type', '@id', 'url', 'name', 'headline', 'isPartOf', 'mainEntity', 'author', 'reviewedBy', 'publisher']],
  [articleId, ['@type', '@id', 'url', 'headline', 'mainEntity', 'author', 'reviewedBy', 'publisher']],
  [tocId, ['@type', '@id', 'name', 'numberOfItems', 'itemListElement']],
]);
for (const section of homepageGraphSyncContract.sections) graphParityFields.set(id(section.id), ['@type', '@id', 'name', 'url', 'isPartOf', 'about']);
for (const video of homepageGraphSyncContract.videos) graphParityFields.set(id(video.graphId), ['@type', '@id', 'name', 'description', 'contentUrl', 'thumbnailUrl', 'isPartOf', 'about']);
const graphParityFailures = [...graphParityFields].filter(([nodeId, fields]) => !equal(pick(inlineById.get(nodeId), fields), pick(canonicalById.get(nodeId), fields))).map(([nodeId]) => nodeId);
const inlineNodeIds = [...inlineById.keys()];
register('AC-15', 'همگام‌سازی HTML، JSON-LD داخلی و گراف کامل', [
  [inlineMatches.length === 1, `inline JSON-LD count mismatch: ${inlineMatches.length}`],
  [inlineNodeIds.every((nodeId) => canonicalById.has(nodeId)), 'canonical graph is not a superset of inline graph'],
  [graphParityFailures.length === 0, `inline/canonical parity failures: ${graphParityFailures.join(', ')}`],
  [canonicalPage?.name === h1 && canonicalPage?.headline === h1 && canonicalArticle?.headline === h1, 'H1/WebPage/Article headline parity failed'],
  [legacyEntityIds.every((nodeId) => !canonicalById.has(nodeId) && !inlineById.has(nodeId)), 'legacy entity definitions remain'],
  [forbiddenSpellings.every((value) => !homepage.includes(value) && !JSON.stringify(canonical).includes(value)), 'non-canonical spelling/ID leaked into public output'],
], { inlineNodes: inlineById.size, canonicalNodes: canonicalById.size, parityNodes: graphParityFields.size });

register('AC-16', 'قرارداد HTML head و HTTP Link', [
  [authorLinks.length === 1 && authorLinks[0] === personId, `author link mismatch: ${authorLinks.join(', ')}`],
  [describedByLinks.length === 1 && describedByLinks[0] === `${site}knowledge-graph.jsonld`, `describedby mismatch: ${describedByLinks.join(', ')}`],
  [!/<link\b[^>]*\brel="[^"]*\bme\b/iu.test(head), 'rel=me must not be emitted in HTML head'],
  [!/<link\b[^>]*\bhreflang=/iu.test(head), 'hreflang must not be emitted for the single-language Homepage'],
  [httpLinks.length === 1 && httpLinks[0] === expectedHttpLink, `HTTP Link contract mismatch: ${httpLinks.join(' | ')}`],
], { author: authorLinks, describedBy: describedByLinks, httpLinks });

register('AC-17', 'راهنماهای ماشین‌خوان و URIهای canonical', [
  [llms.includes(personId) && llms.includes(clinicId), 'llms.txt omits canonical Person or Clinic URI'],
  [ai.includes(personId) && ai.includes(clinicId), 'ai.txt omits canonical Person or Clinic URI'],
  [!llms.includes(`${site}#person`) && !llms.includes(`${site}#clinic`) && !ai.includes(`${site}#person`) && !ai.includes(`${site}#clinic`), 'legacy entity URIs remain in llms.txt or ai.txt'],
  [llms.includes(`${site}#content-table`) && ai.includes(`${site}#content-table`), 'content-table URI is absent from machine-readable guidance'],
], { llms: '/llms.txt', ai: '/.well-known/ai.txt' });

register('AC-18', 'Sitemap، robots و حذف artifactهای قدیمی', [
  [JSON.stringify(rootSitemapLocations) === JSON.stringify([site]), `sitemap locations mismatch: ${rootSitemapLocations.join(', ')}`],
  [imageSitemapLocations.includes(site), 'image sitemap does not bind images to canonical Homepage'],
  [robots.includes(`Sitemap: ${site}sitemap.xml`) && robots.includes(`Sitemap: ${site}image-sitemap.xml`), 'robots.txt sitemap declarations are incomplete'],
  [!robots.includes('video-sitemap.xml'), 'obsolete video sitemap remains in robots.txt'],
  [forbiddenPresent.length === 0, `obsolete public artifacts remain: ${forbiddenPresent.join(', ')}`],
], { sitemapUrls: rootSitemapLocations.length, forbiddenArtifacts: forbiddenPresent });

register('AC-19', 'بودجه عملکرد و الزامات رسانه/DOM', [
  [rawBytes < 700_000, `raw Homepage exceeds 700KB: ${rawBytes}`],
  [gzipBytes < 180_000, `gzip Homepage exceeds 180KB: ${gzipBytes}`],
  [brotliBytes < 145_000, `Brotli Homepage exceeds 145KB: ${brotliBytes}`],
  [domElements < 4_200, `DOM elements exceed 4200: ${domElements}`],
  [videoElements.length === 12 && videoPreloadNone.length === 12, 'all 12 videos must use preload=none'],
], { rawBytes, gzipBytes, brotliBytes, domElements, videos: videoElements.length });

const expectedStageScripts = Array.from({ length: 8 }, (_, index) => `validate:stage${index + 2}`);
register('AC-20', 'کنترل انتشار، traceability و rollback', [
  [expectedStageScripts.every((name) => typeof packageJson.scripts?.[name] === 'string'), 'one or more Stage 2–9 scripts are absent from package.json'],
  [packageJson.scripts?.build?.includes('validate:stage9'), 'Stage 9 is absent from production build chain'],
  [workflow.includes('scripts/run-production-audit.py') && workflow.includes('production-audit-report'), 'production verification workflow is incomplete'],
  [releaseRecord.includes('c2608056ffb3ee6f35a1f7f097fdd2cccb17e46a') && releaseRecord.includes('aeeade6650ee4947ec9287c8d15c8887a0ae89a3'), 'Stage 9 record omits baseline or pre-Stage-9 rollback commit'],
  [releaseRecord.includes('۲۰ معیار') && releaseRecord.includes('rollback') && releaseRecord.includes(baselineLandingBlobSha), 'Stage 9 traceability/rollback record is incomplete'],
  [deploymentStatus.includes(personId) && deploymentStatus.includes(clinicId), 'deployment-status.md still documents legacy entity IDs'],
], { baselineCommit: 'c2608056ffb3ee6f35a1f7f097fdd2cccb17e46a', rollbackCommit: 'aeeade6650ee4947ec9287c8d15c8887a0ae89a3', sourceBlob: landingBlobSha });

mkdirSync(reportDirectory, { recursive: true });
const report = {
  status: failures.length ? 'fail' : 'pass',
  stage: 9,
  acceptanceCriteria: criteria.length,
  passed: criteria.filter((criterion) => criterion.status === 'pass').length,
  failed: criteria.filter((criterion) => criterion.status === 'fail').length,
  criteria,
  metrics: {
    h1,
    introWords,
    mainWordCount,
    htmlIds: allIds.length,
    h2Sections: homepageGraphSyncContract.sections.length,
    h3Subsections: homepageArticleSubsections.length,
    videos: videos.length,
    footerGroups: renderedFooterGroupIds.length,
    footerLinks: renderedDirectoryLinkIds.length,
    inlineGraphNodes: inlineById.size,
    canonicalGraphNodes: canonicalById.size,
    rawBytes,
    gzipBytes,
    brotliBytes,
    domElements,
  },
  baseline: {
    architectureCommit: 'c2608056ffb3ee6f35a1f7f097fdd2cccb17e46a',
    preStage9RollbackCommit: 'aeeade6650ee4947ec9287c8d15c8887a0ae89a3',
    landingBlobSha,
    baselineLandingBlobSha,
    sourcePreserved: landingBlobSha === baselineLandingBlobSha,
  },
  failures,
};
writeFileSync(join(reportDirectory, 'stage-9-validation.json'), JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
