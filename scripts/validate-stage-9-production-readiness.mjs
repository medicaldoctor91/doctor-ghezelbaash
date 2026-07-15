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
const normalize = (value) => String(value ?? '')
  .replaceAll('&nbsp;', ' ')
  .replaceAll('&zwnj;', '‌')
  .replaceAll('&amp;', '&')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"')
  .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/<script[\s\S]*?<\/script>/giu, ' ')
  .replace(/<style[\s\S]*?<\/style>/giu, ' ')
  .replace(/<[^>]+>/gu, ' ')
  .replace(/[\u200c\s]+/gu, ' ')
  .trim();
const words = (value) => normalize(value).split(/\s+/u).filter(Boolean).length;
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
};
const equal = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const pick = (node, fields) => Object.fromEntries(fields.filter((field) => node?.[field] !== undefined).map((field) => [field, node[field]]));
const gitBlobSha = (content) => createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest('hex');
const hasLegacyEntityUri = (text) => /https:\/\/www\.ghezelbaash\.ir\/#(?:person|clinic)(?=$|[\s)\],.;:'"<>])/u.test(text);
const collectFiles = (directory, output = []) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    statSync(path).isDirectory() ? collectFiles(path, output) : output.push(path);
  }
  return output;
};
const register = (criterionId, title, checks, evidence = {}) => {
  const failed = checks.filter(([condition]) => !condition).map(([, message]) => message);
  criteria.push({ id: criterionId, title, status: failed.length ? 'fail' : 'pass', evidence });
  for (const message of failed) failures.push(`${criterionId}: ${message}`);
};

if (!existsSync(dist)) {
  console.error(JSON.stringify({ status: 'fail', stage: 9, failures: ['dist directory is absent'] }, null, 2));
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
const releaseRecord = readFileSync(join(cwd, 'docs', 'homepage-stage-9-production-control.md'), 'utf8');
const deploymentStatus = readFileSync(join(cwd, 'docs', 'deployment-status.md'), 'utf8');
const productionWorkflow = readFileSync(join(cwd, '.github', 'workflows', 'verify-production.yml'), 'utf8');
const allDistFiles = collectFiles(dist);
const htmlFiles = allDistFiles.filter((path) => path.endsWith('.html')).map((path) => relative(dist, path));

const allIds = [...homepage.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
const idSet = new Set(allIds);
const fragmentLinks = [...homepage.matchAll(/href="#([^"]+)"/gu)].map((match) => match[1]);
const brokenFragments = [...new Set(fragmentLinks.filter((fragment) => !idSet.has(fragment)))];
const position = (fragment) => homepage.indexOf(`id="${fragment}"`);
const h1Matches = [...homepage.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/giu)];
const h1 = normalize(h1Matches[0]?.[1] ?? '');
const personFragment = homepageGraphSyncContract.entities.person;
const clinicFragment = homepageGraphSyncContract.entities.clinic;
const personStart = position(personFragment);
const personEnd = homepage.indexOf('</header>', personStart);
const personBlock = homepage.slice(personStart, personEnd + 9);
const introWords = words(personBlock.match(/<div\b[^>]*data-physician-introduction[^>]*>([\s\S]*?)<\/div>/u)?.[1] ?? '');
const tocStart = position(homepageGraphSyncContract.toc.id);
const tocEnd = homepage.indexOf('</nav>', tocStart);
const tocHtml = homepage.slice(tocStart, tocEnd + 6);
const tocOrder = [...tocHtml.matchAll(/<a\b[^>]*href="#([^"]+)"/gu)].map((match) => match[1]).filter((fragment) => homepageGraphSyncContract.toc.sectionIds.includes(fragment));
const sectionPositions = homepageGraphSyncContract.sections.map((section) => position(section.id));
const mainStart = homepage.indexOf('<main');
const mainEnd = homepage.indexOf('</main>', mainStart);
const mainHtml = homepage.slice(mainStart, mainEnd + 7);
const mainWordCount = words(mainHtml);
const headingLevels = [...homepage.matchAll(/<h([1-4])\b/giu)].map((match) => Number(match[1]));
const headingJumps = headingLevels.slice(1).filter((level, index) => level > headingLevels[index] + 1);
const repeatedParagraphs = new Map();
for (const match of mainHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)) {
  const text = normalize(match[1]);
  if (text.split(/\s+/u).length >= 35) repeatedParagraphs.set(text, (repeatedParagraphs.get(text) ?? 0) + 1);
}
const duplicateLongParagraphs = [...repeatedParagraphs].filter(([, count]) => count > 1);
const landingBlobSha = gitBlobSha(landingSource);
const baselineLandingBlobSha = '2489ae2d05bf12ad7ad8782d969f2b6d6abc8b72';

const inlineMatches = [...homepage.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gu)];
const inline = inlineMatches.length === 1 ? JSON.parse(inlineMatches[0][1]) : { '@graph': [] };
const mapGraph = (graph) => new Map((graph['@graph'] ?? []).filter((node) => node?.['@id']).map((node) => [node['@id'], node]));
const inlineById = mapGraph(inline);
const canonicalById = mapGraph(canonical);
const personId = id(personFragment);
const clinicId = id(clinicFragment);
const websiteId = id(homepageGraphSyncContract.entities.website);
const webpageId = id(homepageGraphSyncContract.entities.webpage);
const articleId = id(homepageGraphSyncContract.webpage.articleId);
const tocId = id(homepageGraphSyncContract.toc.id);
const person = canonicalById.get(personId);
const clinic = canonicalById.get(clinicId);
const page = canonicalById.get(webpageId);
const article = canonicalById.get(articleId);
const coverageRelationships = new Set();
for (const node of canonical['@graph'] ?? []) {
  for (const property of asArray(node?.additionalProperty)) {
    if (property?.propertyID === 'coverageRelationship') coverageRelationships.add(property.value);
  }
}

const h2Mismatch = homepageGraphSyncContract.sections.filter((section) => {
  const rendered = normalize(homepage.match(new RegExp(`<h2\\b[^>]*id="${section.id}-title"[^>]*>([\\s\\S]*?)<\\/h2>`, 'u'))?.[1] ?? '');
  return rendered !== normalize(section.title);
});
const h3Mismatch = homepageArticleSubsections.filter((section) => {
  const rendered = normalize(homepage.match(new RegExp(`<h3\\b[^>]*id="${section.id}-title"[^>]*>([\\s\\S]*?)<\\/h3>`, 'u'))?.[1] ?? '');
  return rendered !== normalize(section.title);
});

const videoFailures = [];
for (const video of homepageGraphSyncContract.videos) {
  const figureStart = position(video.graphId);
  const figureEnd = homepage.indexOf('</figure>', figureStart);
  const figure = homepage.slice(figureStart, figureEnd + 9);
  if (figureStart < 0 || figureEnd <= figureStart) videoFailures.push(`${video.id}: figure missing`);
  if (figureStart <= position(video.destinationId)) videoFailures.push(`${video.id}: destination/order mismatch`);
  if (!figure.includes(video.title) || !figure.includes(video.description)) videoFailures.push(`${video.id}: visible copy mismatch`);
  if (!figure.includes(`poster="${video.thumbnail}"`) || !figure.includes(`src="/videos/${video.file}"`)) videoFailures.push(`${video.id}: media asset mismatch`);
  const node = canonicalById.get(id(video.graphId));
  if (!hasType(node, 'VideoObject') || node?.isPartOf?.['@id'] !== id(video.destinationId)) videoFailures.push(`${video.id}: VideoObject mismatch`);
}
const educationStart = position('medical-education');
const clinicSectionStart = position('clinic-information-kermanshah');
const graphSectionStart = position('knowledge-graph-and-datasets');
const educationPlacementPass = ['home-workshop-thread-lift-training', 'home-workshop-thread-lift-advanced'].every((slug) => position(`video-${slug}`) > educationStart && position(`video-${slug}`) < clinicSectionStart);
const testimonialStart = position('video-clinic-patient-experience-review');
const testimonialBlock = homepage.slice(testimonialStart, homepage.indexOf('</figure>', testimonialStart) + 9);
const clinicBlock = homepage.slice(clinicSectionStart, graphSectionStart);

const footerStart = homepage.indexOf('<footer');
const footerEnd = homepage.indexOf('</footer>', footerStart);
const footer = homepage.slice(footerStart, footerEnd + 9);
const expectedFooterGroups = homepageExternalDirectoryContract.map((group) => group.id);
const renderedFooterGroups = [...footer.matchAll(/data-footer-group="([^"]+)"/gu)].map((match) => match[1]);
const expectedFooterLinks = homepageExternalDirectoryContract.flatMap((group) => group.links);
const renderedFooterLinks = [...footer.matchAll(/data-footer-link="([^"]+)"/gu)].map((match) => match[1]);

const head = homepage.match(/<head>([\s\S]*?)<\/head>/u)?.[1] ?? '';
const authorLinks = [...head.matchAll(/<link\b[^>]*rel="author"[^>]*href="([^"]+)"[^>]*>/gu)].map((match) => match[1]);
const describedByLinks = [...head.matchAll(/<link\b[^>]*rel="describedby"[^>]*href="([^"]+)"[^>]*>/gu)].map((match) => match[1]);
const homepageHeaderBlock = headers.match(/\n\/\n([\s\S]*?)(?=\n\/404\.html\n)/u)?.[1] ?? '';
const httpLinks = [...homepageHeaderBlock.matchAll(/^\s*Link:\s*(.+)$/gmu)].map((match) => match[1].trim());
const expectedHttpLink = '</knowledge-graph.jsonld>; rel="describedby"; type="application/ld+json"';
const sitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
const imageSitemapLocations = [...imageSitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
const forbiddenArtifacts = ['video-sitemap.xml', 'context.json', 'llms-full.txt', 'answers.json', 'search.json', 'intents.json', 'services.json', 'authority-map.json', 'authority-network.json', 'decision-capsules.json', 'editorial-review.json', 'reputation.json', 'claims.json', 'evidence.json', 'media.json', 'ontology.json', 'resolver.json', 'knowledge-manifest.json'];
const forbiddenPresent = forbiddenArtifacts.filter((path) => existsSync(join(dist, path)));
const rawBytes = statSync(homepagePath).size;
const gzipBytes = gzipSync(Buffer.from(homepage), { level: 9 }).length;
const brotliBytes = brotliCompressSync(Buffer.from(homepage), { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } }).length;
const domElements = (homepage.match(/<(?!\/|!|\?)[a-z][^>]*>/giu) ?? []).length;
const responsiveLcp = personBlock.includes('data-lcp-portrait')
  && personBlock.includes('loading="lazy"')
  && personBlock.includes('fetchpriority="auto"')
  && head.includes('media="(min-width: 58rem)"')
  && head.includes('fetchpriority="high"');

register('AC-01', 'معماری استاتیک و مسیرهای canonical', [[htmlFiles.length === 2 && htmlFiles.includes('index.html') && htmlFiles.includes('404.html'), `HTML routes: ${htmlFiles.join(', ')}`], [!htmlFiles.some((path) => path.startsWith('videos/')), 'video watch HTML returned']], { htmlFiles });
register('AC-02', 'رأس Person-first و H1 مصوب', [[h1Matches.length === 1, `H1 count ${h1Matches.length}`], [h1 === normalize(homepageGraphSyncContract.headline), `H1 mismatch: ${h1}`], [personBlock.includes('data-main-entity="Person"'), 'Person header marker absent'], [introWords >= 180 && introWords <= 280, `intro words ${introWords}`]], { h1, introWords, personFragment });
register('AC-03', 'تصویر اصلی، اعتبار و دو CTA', [[responsiveLcp, 'responsive LCP contract incomplete'], [(personBlock.match(/data-primary-cta=/gu) ?? []).length === 2, 'primary CTA count mismatch'], [personBlock.includes('رزرو وقت مشاوره رایگان') && personBlock.includes('گفت‌وگوی آنلاین با دکتر قزلباش'), 'CTA labels missing'], [personBlock.includes('۱۶۳ ارزیابی Google Maps'), 'rating provenance missing']], { primaryCtas: (personBlock.match(/data-primary-cta=/gu) ?? []).length, mobilePortrait: 'lazy', desktopPreload: 'high' });
register('AC-04', 'Content Table واقعی و ترتیب ۱۶ مقصد', [[tocStart > personEnd, 'TOC does not follow Person header'], [JSON.stringify(tocOrder) === JSON.stringify(homepageGraphSyncContract.toc.sectionIds), 'TOC order mismatch'], [(tocHtml.match(/<details\b/gu) ?? []).length === homepageGraphSyncContract.toc.groups.length, 'TOC groups mismatch']], { groups: homepageGraphSyncContract.toc.groups.length, items: tocOrder.length });
register('AC-05', 'اسکلت ۱۶ H2 و Fragment integrity', [[sectionPositions.every((value) => value >= 0), 'section missing'], [sectionPositions.every((value, index) => index === 0 || value > sectionPositions[index - 1]), 'section order mismatch'], [h2Mismatch.length === 0, `H2 mismatches: ${h2Mismatch.map((item) => item.id).join(', ')}`], [allIds.length === idSet.size, 'duplicate IDs'], [brokenFragments.length === 0, `broken fragments: ${brokenFragments.join(', ')}`]], { sections: homepageGraphSyncContract.sections.length, htmlIds: allIds.length });
register('AC-06', 'H3های canonical و سلسله‌مراتب Heading', [[h3Mismatch.length === 0, `H3 mismatches: ${h3Mismatch.map((item) => item.id).join(', ')}`], [headingJumps.length === 0, 'heading hierarchy jump'], [!homepage.includes('clinical-decision-model-'), 'legacy numeric ID leaked']], { subsections: homepageArticleSubsections.length, headingJumps: headingJumps.length });
register('AC-07', 'حفظ baseline محتوای پزشکی و عمق صفحه', [[landingBlobSha === baselineLandingBlobSha, `landing blob ${landingBlobSha}`], [mainWordCount >= 18_000 && mainWordCount <= 23_000, `word count ${mainWordCount}`], [duplicateLongParagraphs.length === 0, `duplicate paragraphs ${duplicateLongParagraphs.length}`]], { baselineCommit: 'c2608056ffb3ee6f35a1f7f097fdd2cccb17e46a', baselineLandingBlobSha, landingBlobSha, mainWordCount });
register('AC-08', 'روابط معنایی offered / evaluated / referral-context', [[['offered', 'evaluated', 'referral-context'].every((value) => coverageRelationships.has(value)), `relationships: ${[...coverageRelationships].join(', ')}`]], { coverageRelationships: [...coverageRelationships].sort() });
register('AC-09', 'نگاشت قطعی همه ویدئوها', [[videos.length === 12 && homepageGraphSyncContract.videos.length === 12, `video count ${videos.length}`], [videoFailures.length === 0, videoFailures.join('; ')]], { videos: videos.length });
register('AC-10', 'انحصار ویدئوهای آموزش پزشکی', [[educationPlacementPass, 'education video placement mismatch']], { educationVideos: 2 });
register('AC-11', 'ویدئوی رضایت زیباجو در سکشن کلینیک', [[testimonialStart > clinicSectionStart && testimonialStart < graphSectionStart, 'testimonial outside Clinic section'], [testimonialBlock.includes('رضایت زیباجو از خدمات زیبایی دکتر سعید قزلباش'), 'testimonial title missing']], { video: 'clinic-patient-experience-review', section: 'clinic-information-kermanshah' });
register('AC-12', 'اطلاعات و provenance کلینیک', [[position(clinicFragment) > clinicSectionStart && position(clinicFragment) < graphSectionStart, 'Clinic anchor misplaced'], [clinicBlock.includes('data-stage-seven-clinic'), 'Clinic marker absent'], [clinicBlock.includes('datetime="2026-07-14"'), 'observedAt absent'], [clinicBlock.includes('۱۶۳ ارزیابی'), 'rating count absent']], { clinicId, ratingValue: 5, ratingCount: 163, observedAt: '2026-07-14' });
register('AC-13', 'Footer و دایرکتوری پنج‌گانه', [[JSON.stringify(renderedFooterGroups) === JSON.stringify(expectedFooterGroups), 'Footer group order mismatch'], [renderedFooterLinks.length === expectedFooterLinks.length, `Footer links ${renderedFooterLinks.length}`], [new Set(renderedFooterLinks).size === renderedFooterLinks.length, 'duplicate Footer link IDs'], [!footer.includes('https://ig.me/m/doctor.ghezelbaash'), 'Instagram Direct leaked into Footer']], { groups: renderedFooterGroups.length, links: renderedFooterLinks.length });
register('AC-14', 'جداسازی Person و Clinic و mainEntity یکتا', [[hasType(person, 'Person'), 'Person missing'], [hasType(clinic, 'MedicalClinic') && hasType(clinic, 'LocalBusiness'), 'Clinic types incomplete'], [page?.mainEntity?.['@id'] === personId && !Array.isArray(page?.mainEntity), 'sole mainEntity mismatch'], [person?.worksFor?.['@id'] === clinicId && clinic?.employee?.['@id'] === personId, 'Person/Clinic relation mismatch'], [clinic?.hasMap === 'https://www.google.com/maps?cid=12350483144643112463', 'hasMap mismatch']], { personId, clinicId, mainEntity: page?.mainEntity?.['@id'] });

const parityFields = new Map([[personId, ['@type', '@id', 'name', 'url', 'worksFor', 'workLocation', 'affiliation']], [clinicId, ['@type', '@id', 'name', 'url', 'telephone', 'address', 'geo', 'hasMap', 'employee', 'aggregateRating']], [websiteId, ['@type', '@id', 'url', 'name', 'creator', 'publisher', 'about']], [webpageId, ['@type', '@id', 'url', 'name', 'headline', 'mainEntity', 'author', 'reviewedBy', 'publisher']], [articleId, ['@type', '@id', 'headline', 'mainEntity', 'author', 'reviewedBy', 'publisher']], [tocId, ['@type', '@id', 'name', 'numberOfItems', 'itemListElement']]]);
for (const section of homepageGraphSyncContract.sections) parityFields.set(id(section.id), ['@type', '@id', 'name', 'url', 'isPartOf', 'about']);
for (const video of homepageGraphSyncContract.videos) parityFields.set(id(video.graphId), ['@type', '@id', 'name', 'description', 'contentUrl', 'thumbnailUrl', 'isPartOf', 'about']);
const parityFailures = [...parityFields].filter(([nodeId, fields]) => !equal(pick(inlineById.get(nodeId), fields), pick(canonicalById.get(nodeId), fields))).map(([nodeId]) => nodeId);
register('AC-15', 'همگام‌سازی HTML، JSON-LD داخلی و گراف کامل', [[inlineMatches.length === 1, `inline blocks ${inlineMatches.length}`], [[...inlineById.keys()].every((nodeId) => canonicalById.has(nodeId)), 'canonical is not inline superset'], [parityFailures.length === 0, `parity: ${parityFailures.join(', ')}`], [page?.name === h1 && page?.headline === h1 && article?.headline === h1, 'headline parity failed'], [['person', 'clinic', 'doctor'].every((fragment) => !canonicalById.has(id(fragment)) && !inlineById.has(id(fragment))), 'legacy graph ID remains'], [!homepage.includes('mohammad-saeed-ghezelbaash') && !homepage.includes('dr-ghezelbash-aesthetic-clinic'), 'wrong spelling/ID leaked']], { inlineNodes: inlineById.size, canonicalNodes: canonicalById.size, parityNodes: parityFields.size });
register('AC-16', 'قرارداد HTML head و HTTP Link', [[authorLinks.length === 1 && authorLinks[0] === personId, `author ${authorLinks.join(', ')}`], [describedByLinks.length === 1 && describedByLinks[0] === `${site}knowledge-graph.jsonld`, `describedby ${describedByLinks.join(', ')}`], [!/<link\b[^>]*\brel="[^"]*\bme\b/iu.test(head), 'rel=me in head'], [!/<link\b[^>]*\bhreflang=/iu.test(head), 'hreflang in head'], [httpLinks.length === 1 && httpLinks[0] === expectedHttpLink, `HTTP Link ${httpLinks.join(' | ')}`]], { author: authorLinks, describedBy: describedByLinks, httpLinks });
register('AC-17', 'راهنماهای ماشین‌خوان و URIهای canonical', [[llms.includes(personId) && llms.includes(clinicId), 'llms canonical entities missing'], [ai.includes(personId) && ai.includes(clinicId), 'ai canonical entities missing'], [!hasLegacyEntityUri(llms) && !hasLegacyEntityUri(ai), 'exact legacy entity URI remains'], [llms.includes(`${site}#content-table`) && ai.includes(`${site}#content-table`), 'content-table URI missing']], { llms: '/llms.txt', ai: '/.well-known/ai.txt' });
register('AC-18', 'Sitemap، robots و حذف artifactهای قدیمی', [[JSON.stringify(sitemapLocations) === JSON.stringify([site]), `sitemap ${sitemapLocations.join(', ')}`], [imageSitemapLocations.includes(site), 'image sitemap canonical URL missing'], [robots.includes(`Sitemap: ${site}sitemap.xml`) && robots.includes(`Sitemap: ${site}image-sitemap.xml`), 'robots sitemap declarations missing'], [!robots.includes('video-sitemap.xml'), 'video sitemap in robots'], [forbiddenPresent.length === 0, `obsolete artifacts: ${forbiddenPresent.join(', ')}`]], { sitemapUrls: sitemapLocations.length, forbiddenArtifacts: forbiddenPresent });
register('AC-19', 'بودجه عملکرد و الزامات رسانه/DOM', [[rawBytes < 700_000, `raw ${rawBytes}`], [gzipBytes < 180_000, `gzip ${gzipBytes}`], [brotliBytes < 145_000, `brotli ${brotliBytes}`], [domElements < 4_200, `DOM ${domElements}`], [(homepage.match(/<video\b/giu) ?? []).length === 12 && (homepage.match(/<video\b[^>]*preload="none"/giu) ?? []).length === 12, 'video preload contract failed']], { rawBytes, gzipBytes, brotliBytes, domElements, videos: 12 });
const expectedStageScripts = Array.from({ length: 10 }, (_, index) => `validate:stage${index + 2}`);
register('AC-20', 'کنترل انتشار، traceability و rollback', [[expectedStageScripts.every((name) => typeof packageJson.scripts?.[name] === 'string'), 'Stage 2–11 script missing'], [packageJson.scripts?.build?.includes('validate:stage11'), 'Stage 11 absent from build chain'], [productionWorkflow.includes('scripts/run-production-audit.py') && productionWorkflow.includes('production-audit-report'), 'production workflow incomplete'], [releaseRecord.includes('c2608056ffb3ee6f35a1f7f097fdd2cccb17e46a') && releaseRecord.includes('aeeade6650ee4947ec9287c8d15c8887a0ae89a3'), 'baseline/rollback record missing'], [releaseRecord.includes('۲۰ معیار') && releaseRecord.includes('rollback') && releaseRecord.includes(baselineLandingBlobSha), 'traceability record incomplete'], [deploymentStatus.includes(personId) && deploymentStatus.includes(clinicId), 'deployment status canonical IDs missing']], { baselineCommit: 'c2608056ffb3ee6f35a1f7f097fdd2cccb17e46a', rollbackCommit: 'aeeade6650ee4947ec9287c8d15c8887a0ae89a3', sourceBlob: landingBlobSha });

mkdirSync(reportDirectory, { recursive: true });
const report = {
  status: failures.length ? 'fail' : 'pass',
  stage: 9,
  acceptanceCriteria: criteria.length,
  passed: criteria.filter((item) => item.status === 'pass').length,
  failed: criteria.filter((item) => item.status === 'fail').length,
  criteria,
  metrics: { h1, introWords, mainWordCount, htmlIds: allIds.length, h2Sections: homepageGraphSyncContract.sections.length, h3Subsections: homepageArticleSubsections.length, videos: videos.length, footerGroups: renderedFooterGroups.length, footerLinks: renderedFooterLinks.length, inlineGraphNodes: inlineById.size, canonicalGraphNodes: canonicalById.size, rawBytes, gzipBytes, brotliBytes, domElements },
  baseline: { architectureCommit: 'c2608056ffb3ee6f35a1f7f097fdd2cccb17e46a', preStage9RollbackCommit: 'aeeade6650ee4947ec9287c8d15c8887a0ae89a3', landingBlobSha, baselineLandingBlobSha, sourcePreserved: landingBlobSha === baselineLandingBlobSha },
  failures,
};
writeFileSync(join(reportDirectory, 'stage-9-validation.json'), JSON.stringify(report, null, 2));
if (failures.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(report, null, 2));
