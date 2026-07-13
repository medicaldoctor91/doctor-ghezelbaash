import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { videos } from '../src/domain/media.mjs';
import { serviceUrlRegistry } from '../src/domain/url-architecture.mjs';
import {
  clinicRequiredSameAs,
  personAlternateNames,
  personRequiredSameAs,
  restoredPersonIdentifiers,
  restoredPersonProfileNodes,
  personIdentityContract,
} from '../src/domain/person-identity.mjs';
import { bestDoctorAnswers } from '../src/domain/best-doctor-answers.mjs';

const root = join(process.cwd(), 'dist');
const site = 'https://www.ghezelbaash.ir/';
const huggingFaceProfile = 'https://huggingface.co/Ghezelbaash';
const huggingFaceDataset = 'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data';
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const files = [];
const asArray = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];
const hasType = (node, type) => asArray(node?.['@type']).includes(type);
const walkFiles = (directory) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    statSync(path).isDirectory() ? walkFiles(path) : files.push(path);
  }
};
walkFiles(root);

const homepagePath = join(root, 'index.html');
const homepage = readFileSync(homepagePath, 'utf8');
const visible = homepage
  .replace(/<head[\s\S]*?<\/head>/giu, ' ')
  .replace(/<script[\s\S]*?<\/script>/giu, ' ')
  .replace(/<style[\s\S]*?<\/style>/giu, ' ')
  .replace(/<[^>]+>/gu, ' ')
  .replace(/\s+/gu, ' ');

const htmlFiles = files.filter((path) => path.endsWith('.html')).map((path) => relative(root, path));
check(htmlFiles.length === 2 && htmlFiles.includes('index.html') && htmlFiles.includes('404.html'), `expected only index.html and 404.html; found ${htmlFiles.join(', ')}`);
check(!existsSync(join(root, 'videos', 'index.html')), 'standalone /videos/ page is forbidden');
check(!htmlFiles.some((path) => path.startsWith('videos/')), `video watch pages are forbidden: ${htmlFiles.filter((path) => path.startsWith('videos/')).join(', ')}`);
check(statSync(homepagePath).size < 700_000, `homepage exceeds 700KB: ${statSync(homepagePath).size}`);
check((homepage.match(/<h1\b/giu) ?? []).length === 1, 'homepage must contain exactly one h1');
check((homepage.match(/<video\b/giu) ?? []).length === videos.length, `homepage must contain ${videos.length} video elements`);
check((homepage.match(/<video\b[^>]*preload="none"/giu) ?? []).length === videos.length, 'every homepage video must use preload="none"');
check((homepage.match(/<source\b[^>]*type="video\/mp4"/giu) ?? []).length === videos.length, 'every homepage video must expose an MP4 source');
check((homepage.match(/\bdata-inline-video(?:\s|>)/giu) ?? []).length === videos.length, 'every video must remain embedded contextually inside article text');
check((homepage.match(/\bdata-contextual-image(?:\s|>)/giu) ?? []).length >= 6, 'physician and clinic images must remain contextual');
check(!/<section\b[^>]*\bid="videos"/iu.test(homepage), 'standalone video section is forbidden');
check(!/<section\b[^>]*\bid="clinic"/iu.test(homepage), 'standalone clinic photo section is forbidden');
check(!/<section\b[^>]*\bid="doctor"/iu.test(homepage), 'standalone physician identity section is forbidden');
check(!homepage.includes('video-rail'), 'video carousel/library markup is forbidden');
check(!homepage.includes('gallery-grid'), 'standalone photo gallery markup is forbidden');
check(!homepage.includes('guide-index'), 'article must not render as a knowledge-base index');
check(!homepage.includes('guide-card'), 'article must not render as accordion cards');
check(!homepage.includes('مشاهده در صفحه اختصاصی این ویدئو'), 'watch-page call to action must be absent');
check(!/href="\/videos\/[^"/]+\/"/u.test(homepage), 'homepage must not link to video watch pages');

const articleStart = homepage.indexOf('id="clinical-guide"');
const answerStart = homepage.indexOf('class="quiet-best-wrap');
const contactStart = homepage.indexOf('id="contact"');
check(articleStart >= 0 && answerStart > articleStart && contactStart > answerStart, 'article, closed answer hub and contact ordering is invalid');
for (const video of videos) {
  const position = homepage.indexOf(`id="video-${video.id}"`);
  check(position > articleStart && position < answerStart, `${video.id}: video is not inside the main article`);
}

const bestWrapper = homepage.match(/<details\b[^>]*class="[^"]*\bquiet-best\b[^"]*"[^>]*>/iu)?.[0];
check(Boolean(bestWrapper), 'closed best-doctor disclosure missing');
check(bestWrapper ? !/\bopen(?:\s|=|>)/iu.test(bestWrapper) : false, 'best-doctor disclosure must be closed by default');
check((homepage.match(/class="quiet-best__item"/gu) ?? []).length === bestDoctorAnswers.length, `expected ${bestDoctorAnswers.length} best-doctor answers`);
for (const answer of bestDoctorAnswers) {
  check((homepage.match(new RegExp(`\\sid="${answer.id}"`, 'gu')) ?? []).length === 1, `${answer.id}: answer anchor missing or duplicated`);
  check(visible.includes(answer.question), `${answer.id}: question absent from visible HTML`);
}

const ids = [...homepage.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
const idSet = new Set(ids);
check(ids.length === idSet.size, `duplicate HTML ids: ${[...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].join(', ')}`);
for (const href of [...homepage.matchAll(/href="#([^"]+)"/gu)].map((match) => match[1])) {
  check(idSet.has(href), `broken homepage fragment: #${href}`);
}
for (const item of serviceUrlRegistry) check(idSet.has(item.anchor), `missing stable service anchor: #${item.anchor}`);

const inlineMatches = [...homepage.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gu)];
check(inlineMatches.length === 1, `expected one inline JSON-LD block; found ${inlineMatches.length}`);
const inline = inlineMatches.length === 1 ? JSON.parse(inlineMatches[0][1]) : { '@graph': [] };
const full = JSON.parse(readFileSync(join(root, 'knowledge-graph.jsonld'), 'utf8'));

function auditGraph(label, graph) {
  const nodes = graph['@graph'] ?? [];
  const graphIds = nodes.map((node) => node['@id']).filter(Boolean);
  const defined = new Set(graphIds);
  const references = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    if (typeof value['@id'] === 'string' && value['@id'].startsWith(site)) references.add(value['@id']);
    Object.values(value).forEach(visit);
  };
  nodes.forEach(visit);
  check(graphIds.length === defined.size, `${label}: duplicate @id values`);
  check([...references].every((id) => defined.has(id)), `${label}: dangling same-site @id references`);
  const page = nodes.find((node) => node['@id'] === `${site}#webpage`);
  check(hasType(page, 'MedicalWebPage'), `${label}: homepage must be MedicalWebPage`);
  check(hasType(page, 'ProfilePage'), `${label}: homepage must also be ProfilePage`);
  check(page?.mainEntity?.['@id'] === `${site}#person` && !Array.isArray(page?.mainEntity), `${label}: Person must be the sole page mainEntity`);
  return { nodes, defined, byId: new Map(nodes.filter((node) => node?.['@id']).map((node) => [node['@id'], node])) };
}

function auditPersonIdentity(label, audit) {
  const person = audit.byId.get(`${site}#person`);
  check(Boolean(person), `${label}: canonical Person missing`);
  if (!person) return;
  check(person.honorificPrefix === personIdentityContract.honorificPrefix, `${label}: Person honorificPrefix missing`);
  const aliases = new Set(asArray(person.alternateName));
  for (const alias of personAlternateNames) check(aliases.has(alias), `${label}: Person alternateName missing: ${alias}`);
  const sameAs = new Set(asArray(person.sameAs));
  for (const url of personRequiredSameAs) check(sameAs.has(url), `${label}: Person sameAs missing: ${url}`);
  for (const url of clinicRequiredSameAs) check(!sameAs.has(url), `${label}: clinic social URL leaked into Person.sameAs: ${url}`);
  check(sameAs.has(huggingFaceProfile), `${label}: personal Hugging Face profile missing from Person.sameAs`);
  check(!sameAs.has(huggingFaceDataset), `${label}: Dataset leaked into Person.sameAs`);
  const identifiers = asArray(person.identifier);
  for (const required of restoredPersonIdentifiers) {
    check(identifiers.some((item) => item?.propertyID === required.propertyID && item?.value === required.value), `${label}: Person identifier missing: ${required.propertyID}=${required.value}`);
  }
  check(!identifiers.some((item) => item?.propertyID === 'Hugging Face Profile'), `${label}: Hugging Face profile must not be a formal identifier`);
}

function auditDoctorClinicRelation(label, audit) {
  const person = audit.byId.get(`${site}#person`);
  const clinic = audit.byId.get(`${site}#clinic`);
  check(Boolean(person), `${label}: Person missing for doctor-clinic relation`);
  check(Boolean(clinic), `${label}: Clinic missing for doctor-clinic relation`);
  if (!person || !clinic) return;
  check(person.worksFor?.['@id'] === `${site}#clinic`, `${label}: Person.worksFor must point to Clinic`);
  check(person.workLocation?.['@id'] === `${site}#clinic`, `${label}: Person.workLocation must point to Clinic`);
  check(person.affiliation?.['@id'] === `${site}#clinic`, `${label}: Person.affiliation must point to Clinic`);
  check(clinic.employee?.['@id'] === `${site}#person`, `${label}: Clinic.employee must point to Person`);
  const clinicSameAs = new Set(asArray(clinic.sameAs));
  for (const url of clinicRequiredSameAs) check(clinicSameAs.has(url), `${label}: Clinic.sameAs missing: ${url}`);
}

const fullAudit = auditGraph('canonical graph', full);
const inlineAudit = auditGraph('inline graph', inline);
check(fullAudit.nodes.length >= 800, `canonical graph unexpectedly narrow: ${fullAudit.nodes.length}`);
check(inlineAudit.nodes.length <= 60, `inline projection is too broad: ${inlineAudit.nodes.length}`);
check(!inlineAudit.nodes.some((node) => hasType(node, 'VideoObject') || hasType(node, 'Clip')), 'inline graph must not contain VideoObject or Clip');
check(!fullAudit.nodes.some((node) => hasType(node, 'VideoObject') || hasType(node, 'Clip')), 'canonical graph must keep videos as contextual homepage media');
check(!inlineAudit.nodes.some((node) => hasType(node, 'ScholarlyArticle')), 'research articles must stay out of Google page projection');
for (const id of inlineAudit.defined) check(fullAudit.defined.has(id), `inline @id absent from canonical graph: ${id}`);
check(fullAudit.defined.has(`${site}#knowledge-graph-dataset`), 'canonical knowledge graph Dataset missing');
check(!fullAudit.defined.has(`${site}#retrieval-corpus`), 'removed retrieval Dataset still exists');

auditPersonIdentity('canonical graph', fullAudit);
auditPersonIdentity('inline graph', inlineAudit);
auditDoctorClinicRelation('canonical graph', fullAudit);
auditDoctorClinicRelation('inline graph', inlineAudit);
for (const profile of restoredPersonProfileNodes) check(fullAudit.defined.has(profile['@id']), `canonical graph: external ProfilePage missing: ${profile['@id']}`);

const dataset = fullAudit.byId.get(huggingFaceDataset);
check(hasType(dataset, 'Dataset'), 'Hugging Face dataset must be a separate Dataset node');
check(dataset?.creator?.['@id'] === `${site}#person`, 'Hugging Face Dataset.creator must point to Person');
check(dataset?.publisher?.['@id'] === `${site}#clinic`, 'Hugging Face Dataset.publisher must point to Clinic');
const datasetAbout = new Set(asArray(dataset?.about).map((item) => item?.['@id']));
check(datasetAbout.has(`${site}#person`) && datasetAbout.has(`${site}#clinic`), 'Hugging Face Dataset.about must include Person and Clinic');

const inlineArticle = inlineAudit.byId.get(`${site}#article`);
const timezoneDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
check(timezoneDateTime.test(inlineArticle?.datePublished ?? ''), 'inline Article datePublished must be timezone-aware');
check(timezoneDateTime.test(inlineArticle?.dateModified ?? ''), 'inline Article dateModified must be timezone-aware');
const inlineClinic = inlineAudit.byId.get(`${site}#clinic`);
check(inlineClinic?.address?.postalCode === '6714657412', 'inline clinic postalCode is missing or incorrect');

for (const path of [
  'knowledge-graph.jsonld', 'sitemap.xml', 'image-sitemap.xml',
  'llms.txt', 'site.webmanifest', 'robots.txt', '.well-known/ai.txt', '.well-known/security.txt',
]) check(existsSync(join(root, path)), `required public artifact missing: /${path}`);
check(!existsSync(join(root, 'video-sitemap.xml')), 'video-sitemap.xml must be removed');

for (const removed of [
  'context.json', 'llms-full.txt', 'answers.json', 'search.json', 'intents.json', 'services.json',
  'authority-map.json', 'authority-network.json', 'decision-capsules.json', 'editorial-review.json',
  'reputation.json', 'claims.json', 'evidence.json', 'media.json', 'ontology.json', 'resolver.json',
  'ai', 'answers', 'search', 'intents', 'evidence', 'media/index.json', 'knowledge-manifest.json',
]) check(!existsSync(join(root, removed)), `removed artifact still exists: /${removed}`);

for (const path of files) check(statSync(path).size > 0, `zero-byte public file: ${relative(root, path)}`);

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  htmlPages: htmlFiles.length,
  homepageBytes: statSync(homepagePath).size,
  htmlIds: ids.length,
  profilePage: true,
  homepageMainEntity: `${site}#person`,
  bestDoctorAnswers: bestDoctorAnswers.length,
  watchPages: 0,
  videoSchemaNodes: 0,
  contextualVideos: videos.length,
  contextualImages: (homepage.match(/\bdata-contextual-image(?:\s|>)/giu) ?? []).length,
  inlineGraphNodes: inlineAudit.nodes.length,
  canonicalGraphNodes: fullAudit.nodes.length,
  huggingFace: {
    profileInPersonSameAs: true,
    profileAsIdentifier: false,
    datasetSeparate: true,
    datasetCreatorPerson: true,
    datasetPublisherClinic: true,
  },
  doctorClinicRelation: true,
  publicFiles: files.length,
}, null, 2));
