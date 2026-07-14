import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { videos } from '../src/domain/media.mjs';
import { homepageEntityIds, homepageSections, homepageMainSectionIds } from '../src/domain/homepage-sections.mjs';
import { homepageArticleGroups, homepageArticleSubsections } from '../src/domain/homepage-article-registry.mjs';
import { homepageServiceTargets } from '../src/domain/homepage-service-targets.mjs';
import { personIdentityContract } from '../src/domain/person-identity.mjs';

const root = join(process.cwd(), 'dist');
const site = 'https://www.ghezelbaash.ir/';
const homepage = readFileSync(join(root, 'index.html'), 'utf8');
const canonical = JSON.parse(readFileSync(join(root, 'knowledge-graph.jsonld'), 'utf8'));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
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
const plain = (value) => decode(value)
  .replace(/<script[\s\S]*?<\/script>/giu, ' ')
  .replace(/<style[\s\S]*?<\/style>/giu, ' ')
  .replace(/<[^>]+>/gu, ' ')
  .replace(/\s+/gu, ' ')
  .trim();
const words = (value) => plain(value).split(/\s+/u).filter(Boolean).length;
const normalize = (value) => plain(value).replace(/[\u200c\s]+/gu, ' ').trim();
const id = (fragment) => `${site}#${fragment}`;
const ids = [...homepage.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
const idSet = new Set(ids);
const position = (fragment) => homepage.indexOf(`id="${fragment}"`);

check(homepageSections.length === 16, `canonical H2 registry must contain 16 sections; found ${homepageSections.length}`);
check(new Set(homepageSections.map((section) => section.id)).size === homepageSections.length, 'duplicate IDs exist in canonical H2 registry');
check(new Set(homepageArticleSubsections.map((section) => section.id)).size === homepageArticleSubsections.length, 'duplicate IDs exist in canonical H3 registry');
check(ids.length === idSet.size, 'rendered HTML contains duplicate IDs');

for (const section of homepageSections) {
  check(idSet.has(section.id), `registry H2 destination missing from HTML: #${section.id}`);
  const headingPattern = new RegExp(`<h2\\b[^>]*id="${section.id}-title"[^>]*>([\\s\\S]*?)<\\/h2>`, 'u');
  const renderedTitle = homepage.match(headingPattern)?.[1] ?? '';
  check(normalize(renderedTitle) === normalize(section.title), `H2 title mismatch for #${section.id}`);
}
for (const subsection of homepageArticleSubsections) {
  check(idSet.has(subsection.id), `registry H3 destination missing from HTML: #${subsection.id}`);
  const headingPattern = new RegExp(`<h3\\b[^>]*id="${subsection.id}-title"[^>]*>([\\s\\S]*?)<\\/h3>`, 'u');
  const renderedTitle = homepage.match(headingPattern)?.[1] ?? '';
  check(normalize(renderedTitle) === normalize(subsection.title), `H3 title mismatch for #${subsection.id}`);
}

const mainStart = Math.min(...homepageMainSectionIds.map(position).filter((value) => value >= 0));
const mainEnd = homepage.indexOf('</main>', mainStart);
const mainHtml = homepage.slice(mainStart, mainEnd);
const mainWordCount = words(mainHtml);
check(mainWordCount >= 18_000 && mainWordCount <= 23_000, `main Homepage content must remain near the 18–22k target; found ${mainWordCount} words`);

const sectionWordCounts = {};
for (let index = 0; index < homepageMainSectionIds.length; index += 1) {
  const fragment = homepageMainSectionIds[index];
  const start = position(fragment);
  const laterPositions = homepageMainSectionIds.slice(index + 1).map(position).filter((value) => value > start);
  const end = laterPositions.length ? Math.min(...laterPositions) : mainEnd;
  sectionWordCounts[fragment] = words(homepage.slice(start, end));
}
for (const group of homepageArticleGroups) {
  const actual = sectionWordCounts[group.id] ?? 0;
  check(actual >= Math.max(180, group.targetWords * 0.45), `${group.id}: content became unexpectedly thin (${actual} words)`);
  check(actual <= group.targetWords * 1.35 + 220, `${group.id}: content exceeds audited budget (${actual} words; target ${group.targetWords})`);
}

const duplicateParagraphs = new Map();
for (const match of mainHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)) {
  const text = normalize(match[1]);
  if (text.split(/\s+/u).length < 35) continue;
  duplicateParagraphs.set(text, (duplicateParagraphs.get(text) ?? 0) + 1);
}
const repeatedLongParagraphs = [...duplicateParagraphs].filter(([, count]) => count > 1);
check(repeatedLongParagraphs.length === 0, `exact duplicate long paragraphs remain: ${repeatedLongParagraphs.length}`);
check((homepage.match(/<h4\b/giu) ?? []).length <= 230, `H4 count remains too high: ${(homepage.match(/<h4\b/giu) ?? []).length}`);
check(!/\sid="clinical-decision-model-[^"]+"/u.test(homepage), 'legacy numeric clinical-decision-model IDs leaked into HTML');

const headingLevels = [...homepage.matchAll(/<h([1-4])\b/giu)].map((match) => Number(match[1]));
for (let index = 1; index < headingLevels.length; index += 1) {
  check(headingLevels[index] <= headingLevels[index - 1] + 1, `heading hierarchy jumps from H${headingLevels[index - 1]} to H${headingLevels[index]}`);
}
check(new RegExp(`<figure\\b[^>]*id="video-clinic-patient-experience-review"[\\s\\S]*?<figcaption\\b[\\s\\S]*?id="video-clinic-patient-experience-review-title"`, 'u').test(homepage), 'clinic contextual video title must remain inside figcaption');
check(!new RegExp(`<figure\\b[^>]*id="video-clinic-patient-experience-review"[\\s\\S]*?<h3\\b`, 'u').test(homepage), 'clinic contextual video title must not be an H3');

const graphs = [];
const inlineMatches = [...homepage.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gu)];
check(inlineMatches.length === 1, `expected one inline JSON-LD block; found ${inlineMatches.length}`);
if (inlineMatches.length === 1) graphs.push(['inline', JSON.parse(inlineMatches[0][1])]);
graphs.push(['canonical', canonical]);

const personId = id(homepageEntityIds.person);
const clinicId = id(homepageEntityIds.clinic);
const personalSocials = [personIdentityContract.instagram, personIdentityContract.linkedin, personIdentityContract.facebook];
const mapResources = ['https://www.google.com/maps?cid=12350483144643112463', 'https://www.google.com/maps/search/?api=1&query=کلینیک%20زیبایی%20دکتر%20قزلباش%20کرمانشاه&query_place_id=ChIJBTOYDOTt-j8RD-7mAPy6Zas', 'https://www.openstreetmap.org/node/13530287096'];

for (const [label, graph] of graphs) {
  const nodes = graph['@graph'] ?? [];
  const byId = new Map(nodes.filter((node) => node?.['@id']).map((node) => [node['@id'], node]));
  const person = byId.get(personId);
  const clinic = byId.get(clinicId);
  const personSameAs = new Set(asArray(person?.sameAs));
  const clinicSameAs = new Set(asArray(clinic?.sameAs));
  for (const social of personalSocials) {
    check(personSameAs.has(social), `${label}: physician social missing from Person.sameAs: ${social}`);
    check(!clinicSameAs.has(social), `${label}: physician social leaked into Clinic.sameAs: ${social}`);
    const profile = byId.get(social);
    if (profile) check(profile?.about?.['@id'] === personId, `${label}: social ProfilePage.about must point to Person: ${social}`);
  }
  for (const map of mapResources) check(!clinicSameAs.has(map), `${label}: map resource leaked into Clinic.sameAs: ${map}`);
  check(clinic?.hasMap === mapResources[0], `${label}: Clinic.hasMap must use the canonical Google Maps deep link`);

  for (const { fragment, target } of homepageServiceTargets) {
    const node = byId.get(id(fragment));
    if (!node) continue;
    check(node.url === id(target), `${label}: explicit service target mismatch: ${fragment} -> ${node.url}`);
  }

  for (const video of videos) {
    const node = byId.get(id(`video-${video.id}`));
    check(hasType(node, 'VideoObject'), `${label}: VideoObject missing: ${video.id}`);
    if (!node) continue;
    check(node.name === video.title, `${label}: video title mismatch: ${video.id}`);
    check(node.description === video.description, `${label}: video description mismatch: ${video.id}`);
    check(node.duration === video.duration, `${label}: video duration mismatch: ${video.id}`);
    check(node.width === video.width && node.height === video.height, `${label}: video dimensions mismatch: ${video.id}`);
    check(node.contentUrl === new URL(`videos/${video.file}`, site).href, `${label}: video contentUrl mismatch: ${video.id}`);
    check(node.thumbnailUrl === new URL(video.thumbnail.replace(/^\//u, ''), site).href, `${label}: video thumbnail mismatch: ${video.id}`);
    check(node.creator?.['@id'] === personId && node.author?.['@id'] === personId, `${label}: video creator/author mismatch: ${video.id}`);
    check(node.isPartOf?.['@id'] === id(video.subsectionId ?? video.sectionId), `${label}: video destination mismatch: ${video.id}`);
  }

  for (const node of nodes) {
    if (typeof node?.url !== 'string' || !node.url.startsWith(`${site}#`)) continue;
    const fragment = node.url.slice(`${site}#`.length);
    check(idSet.has(fragment) || fragment.startsWith('video-'), `${label}: Graph URL does not resolve to visible HTML: ${node['@id']} -> #${fragment}`);
  }
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures, mainWordCount, sectionWordCounts, repeatedLongParagraphs: repeatedLongParagraphs.length }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  mainWordCount,
  sectionWordCounts,
  duplicateLongParagraphs: 0,
  h4Count: (homepage.match(/<h4\b/giu) ?? []).length,
  registryH2: homepageSections.length,
  registryH3: homepageArticleSubsections.length,
  videos: videos.length,
  explicitServiceTargets: homepageServiceTargets.length,
}, null, 2));
