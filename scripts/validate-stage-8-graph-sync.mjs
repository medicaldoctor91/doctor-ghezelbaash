import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homepageGraphSyncContract, homepageSharedGraphFragments } from '../src/domain/homepage-graph-sync.mjs';

const root = join(process.cwd(), 'dist');
const homepage = readFileSync(join(root, 'index.html'), 'utf8');
const canonical = JSON.parse(readFileSync(join(root, 'knowledge-graph.jsonld'), 'utf8'));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const site = 'https://www.ghezelbaash.ir/';
const id = (fragment) => `${site}#${fragment}`;
const asArray = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];
const hasType = (node, type) => asArray(node?.['@type']).includes(type);
const decode = (value) => value
  .replaceAll('&nbsp;', ' ')
  .replaceAll('&zwnj;', '‌')
  .replaceAll('&amp;', '&')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&quot;', '"')
  .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)));
const plain = (value) => decode(value).replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
};
const equal = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const pick = (node, fields) => Object.fromEntries(fields.filter((field) => node?.[field] !== undefined).map((field) => [field, node[field]]));
const collectRefs = (value, output = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRefs(item, output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  if (typeof value['@id'] === 'string') output.push(value['@id']);
  Object.values(value).forEach((item) => collectRefs(item, output));
  return output;
};
const containsExactLegacyEntityUri = (text, fragment) => {
  const escaped = `${site}#${fragment}`.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`${escaped}(?=$|[\\s),;\\]])`, 'mu').test(text);
};

const inlineMatches = [...homepage.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gu)];
check(inlineMatches.length === 1, `Stage 8 requires exactly one inline JSON-LD block; found ${inlineMatches.length}`);
const inline = inlineMatches.length === 1 ? JSON.parse(inlineMatches[0][1]) : { '@graph': [] };
const graphs = [['inline', inline], ['canonical', canonical]];
const maps = new Map(graphs.map(([label, graph]) => [label, new Map((graph['@graph'] ?? []).filter((node) => node?.['@id']).map((node) => [node['@id'], node]))]));

const h1 = plain(homepage.match(/<h1\b[^>]*id="page-title"[^>]*>([\s\S]*?)<\/h1>/u)?.[1] ?? '');
check(h1 === homepageGraphSyncContract.headline, `visible H1 differs from Stage 8 contract: ${h1}`);

const personId = id(homepageGraphSyncContract.entities.person);
const clinicId = id(homepageGraphSyncContract.entities.clinic);
const websiteId = id(homepageGraphSyncContract.entities.website);
const webpageId = id(homepageGraphSyncContract.entities.webpage);
const articleId = id(homepageGraphSyncContract.webpage.articleId);
const contentTableId = id(homepageGraphSyncContract.toc.id);
const legacyIds = new Set([id('person'), id('clinic'), id('doctor')]);

for (const [label, graph] of graphs) {
  const nodes = graph['@graph'] ?? [];
  const nodeIds = nodes.map((node) => node?.['@id']).filter(Boolean);
  check(nodeIds.length === new Set(nodeIds).size, `${label}: duplicate @id definitions exist`);
  const byId = maps.get(label);
  for (const fragment of homepageSharedGraphFragments) check(byId.has(id(fragment)), `${label}: shared Stage 8 node missing: #${fragment}`);
  for (const legacyId of legacyIds) check(!byId.has(legacyId), `${label}: legacy entity definition remains: ${legacyId}`);
  const refs = collectRefs(graph);
  for (const legacyId of legacyIds) check(!refs.includes(legacyId), `${label}: legacy entity reference remains: ${legacyId}`);

  const person = byId.get(personId);
  const clinic = byId.get(clinicId);
  const page = byId.get(webpageId);
  const website = byId.get(websiteId);
  const article = byId.get(articleId);
  const toc = byId.get(contentTableId);

  check(hasType(person, 'Person'), `${label}: canonical Person is missing`);
  check(person?.url === personId, `${label}: Person.url must equal canonical Person URI`);
  check(person?.mainEntityOfPage?.['@id'] === webpageId, `${label}: Person.mainEntityOfPage mismatch`);
  check(person?.worksFor?.['@id'] === clinicId && person?.workLocation?.['@id'] === clinicId && person?.affiliation?.['@id'] === clinicId, `${label}: Person-to-Clinic relationship mismatch`);

  check(hasType(clinic, 'MedicalClinic') && hasType(clinic, 'LocalBusiness'), `${label}: canonical Clinic types are incomplete`);
  check(clinic?.url === clinicId, `${label}: Clinic.url must equal canonical Clinic URI`);
  check(clinic?.employee?.['@id'] === personId, `${label}: Clinic.employee mismatch`);
  check(clinic?.hasMap === 'https://www.google.com/maps?cid=12350483144643112463', `${label}: Clinic.hasMap mismatch`);
  check(Number(clinic?.aggregateRating?.ratingValue) === 5, `${label}: Clinic ratingValue mismatch`);
  check(Number(clinic?.aggregateRating?.bestRating) === 5, `${label}: Clinic bestRating mismatch`);
  check(Number(clinic?.aggregateRating?.ratingCount) === 163, `${label}: Clinic ratingCount mismatch`);
  check(Number(clinic?.aggregateRating?.reviewCount) === 163, `${label}: Clinic reviewCount mismatch`);

  check(hasType(page, 'MedicalWebPage') && hasType(page, 'ProfilePage'), `${label}: Homepage schema types are incomplete`);
  check(page?.name === h1 && page?.headline === h1, `${label}: WebPage name/headline must match visible H1`);
  check(!Array.isArray(page?.mainEntity) && page?.mainEntity?.['@id'] === personId, `${label}: Person must be the sole Homepage mainEntity`);
  check(page?.author?.['@id'] === personId && page?.reviewedBy?.['@id'] === personId, `${label}: Homepage physician authorship mismatch`);
  check(page?.publisher?.['@id'] === clinicId, `${label}: Homepage publisher must be Clinic`);
  check(page?.isPartOf?.['@id'] === websiteId, `${label}: Homepage isPartOf mismatch`);
  check(website?.creator?.['@id'] === personId && website?.publisher?.['@id'] === clinicId, `${label}: WebSite creator/publisher mismatch`);
  check(article?.headline === h1 && article?.mainEntity?.['@id'] === personId, `${label}: Article headline/mainEntity mismatch`);

  check(hasType(toc, 'ItemList'), `${label}: content table ItemList missing`);
  check(toc?.name === homepageGraphSyncContract.toc.title, `${label}: content table name mismatch`);
  check(Number(toc?.numberOfItems) === homepageGraphSyncContract.sections.length, `${label}: content table count mismatch`);
  const items = asArray(toc?.itemListElement);
  check(items.length === homepageGraphSyncContract.sections.length, `${label}: content table item array mismatch`);
  homepageGraphSyncContract.sections.forEach((section, index) => {
    const sectionNode = byId.get(id(section.id));
    const item = items[index];
    check(hasType(sectionNode, 'WebPageElement'), `${label}: WebPageElement missing: ${section.id}`);
    check(sectionNode?.name === section.title, `${label}: section title mismatch: ${section.id}`);
    check(sectionNode?.url === id(section.id), `${label}: section URL mismatch: ${section.id}`);
    check(sectionNode?.isPartOf?.['@id'] === webpageId, `${label}: section parent mismatch: ${section.id}`);
    check(item?.position === index + 1 && item?.name === section.title && item?.url === id(section.id) && item?.item?.['@id'] === id(section.id), `${label}: TOC ItemList mismatch at position ${index + 1}`);
  });

  homepageGraphSyncContract.videos.forEach((video) => {
    const node = byId.get(id(video.graphId));
    check(hasType(node, 'VideoObject'), `${label}: VideoObject missing: ${video.id}`);
    if (!node) return;
    check(node.name === video.title, `${label}: video title mismatch: ${video.id}`);
    check(node.description === video.description, `${label}: video description mismatch: ${video.id}`);
    check(node.contentUrl === new URL(`videos/${video.file}`, site).href, `${label}: video content URL mismatch: ${video.id}`);
    check(node.thumbnailUrl === new URL(video.thumbnail.replace(/^\//u, ''), site).href, `${label}: video thumbnail mismatch: ${video.id}`);
    check(node.duration === video.duration && node.width === video.width && node.height === video.height, `${label}: video media metadata mismatch: ${video.id}`);
    check(node.isPartOf?.['@id'] === id(video.destinationId), `${label}: video destination mismatch: ${video.id}`);
    check(node.creator?.['@id'] === personId && node.author?.['@id'] === personId && node.publisher?.['@id'] === clinicId, `${label}: video responsibility mismatch: ${video.id}`);
  });
}

const inlineById = maps.get('inline');
const canonicalById = maps.get('canonical');
for (const inlineId of inlineById.keys()) check(canonicalById.has(inlineId), `canonical graph is not a superset of inline graph: ${inlineId}`);

const parityFields = new Map([
  [personId, ['@type', '@id', 'name', 'alternateName', 'url', 'mainEntityOfPage', 'worksFor', 'workLocation', 'affiliation']],
  [clinicId, ['@type', '@id', 'name', 'url', 'telephone', 'address', 'geo', 'hasMap', 'employee', 'aggregateRating']],
  [websiteId, ['@type', '@id', 'url', 'name', 'inLanguage', 'creator', 'publisher', 'about']],
  [webpageId, ['@type', '@id', 'url', 'name', 'headline', 'description', 'inLanguage', 'isPartOf', 'mainEntity', 'primaryImageOfPage', 'author', 'reviewedBy', 'publisher']],
  [articleId, ['@type', '@id', 'url', 'headline', 'mainEntity', 'mainEntityOfPage', 'author', 'reviewedBy', 'publisher']],
  [contentTableId, ['@type', '@id', 'name', 'url', 'inLanguage', 'numberOfItems', 'itemListOrder', 'itemListElement']],
]);
for (const section of homepageGraphSyncContract.sections) parityFields.set(id(section.id), ['@type', '@id', 'name', 'url', 'inLanguage', 'isPartOf', 'about']);
for (const video of homepageGraphSyncContract.videos) parityFields.set(id(video.graphId), ['@type', '@id', 'name', 'description', 'url', 'contentUrl', 'thumbnailUrl', 'duration', 'width', 'height', 'inLanguage', 'creator', 'author', 'publisher', 'isPartOf', 'about']);
for (const [nodeId, fields] of parityFields) {
  check(equal(pick(inlineById.get(nodeId), fields), pick(canonicalById.get(nodeId), fields)), `inline/canonical field parity mismatch: ${nodeId}`);
}

const tocStart = homepage.indexOf(`id="${homepageGraphSyncContract.toc.id}"`);
const tocEnd = homepage.indexOf('</nav>', tocStart);
const tocHtml = homepage.slice(tocStart, tocEnd + 6);
const tocOrder = [...tocHtml.matchAll(/<a\b[^>]*href="#([^"]+)"/gu)].map((match) => match[1]).filter((fragment) => homepageGraphSyncContract.toc.sectionIds.includes(fragment));
check(JSON.stringify(tocOrder) === JSON.stringify(homepageGraphSyncContract.toc.sectionIds), `visible TOC order differs from graph registry: ${tocOrder.join(', ')}`);

for (const section of homepageGraphSyncContract.sections) {
  const rendered = plain(homepage.match(new RegExp(`<h2\\b[^>]*id="${section.id}-title"[^>]*>([\\s\\S]*?)<\\/h2>`, 'u'))?.[1] ?? '');
  check(rendered === section.title, `visible H2 differs from Stage 8 graph contract: ${section.id}`);
}
for (const video of homepageGraphSyncContract.videos) {
  const start = homepage.indexOf(`id="${video.graphId}"`);
  const end = homepage.indexOf('</figure>', start);
  const block = homepage.slice(start, end + 9);
  check(start >= 0 && end > start, `visible video figure missing: ${video.id}`);
  check(block.includes(video.title), `visible video title mismatch: ${video.id}`);
  check(block.includes(video.description), `visible video description mismatch: ${video.id}`);
  check(block.includes(`poster="${video.thumbnail}"`), `visible video poster mismatch: ${video.id}`);
  check(block.includes(`src="/videos/${video.file}"`), `visible video source mismatch: ${video.id}`);
}

const llmsPath = join(root, 'llms.txt');
check(existsSync(llmsPath), 'Stage 8 requires generated llms.txt');
if (existsSync(llmsPath)) {
  const llms = readFileSync(llmsPath, 'utf8');
  check(llms.includes(personId), 'llms.txt omits canonical Person URI');
  check(llms.includes(clinicId), 'llms.txt omits canonical Clinic URI');
  check(!containsExactLegacyEntityUri(llms, 'person') && !containsExactLegacyEntityUri(llms, 'clinic'), 'llms.txt still exposes legacy entity URIs');
  check(llms.includes(`${site}#${homepageGraphSyncContract.toc.id}`), 'llms.txt omits canonical content table URI');
}
const aiPath = join(root, '.well-known', 'ai.txt');
check(existsSync(aiPath), 'Stage 8 requires existing ai.txt');
if (existsSync(aiPath)) {
  const ai = readFileSync(aiPath, 'utf8');
  check(ai.includes(personId), 'ai.txt omits canonical Person URI');
  check(ai.includes(clinicId), 'ai.txt omits canonical Clinic URI');
  check(!containsExactLegacyEntityUri(ai, 'person') && !containsExactLegacyEntityUri(ai, 'clinic'), 'ai.txt still exposes legacy entity URIs');
  check(ai.includes(`${site}#${homepageGraphSyncContract.toc.id}`), 'ai.txt omits canonical content table URI');
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', stage: 8, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  stage: 8,
  headline: h1,
  sharedNodes: homepageSharedGraphFragments.length,
  sections: homepageGraphSyncContract.sections.length,
  videos: homepageGraphSyncContract.videos.length,
  inlineNodes: inlineById.size,
  canonicalNodes: canonicalById.size,
  canonicalSuperset: true,
  llmsCanonicalEntities: true,
  aiCanonicalEntities: true,
}, null, 2));
