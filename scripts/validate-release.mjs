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

const root = join(process.cwd(), 'dist');
const site = 'https://www.ghezelbaash.ir/';
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const files = [];
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
check(statSync(homepagePath).size < 700_000, `homepage exceeds 700KB: ${statSync(homepagePath).size}`);
check((homepage.match(/<h1\b/giu) ?? []).length === 1, 'homepage must contain exactly one h1');
check((homepage.match(/<video\b/giu) ?? []).length === videos.length, `homepage must contain ${videos.length} initial video elements`);
check((homepage.match(/<video\b[^>]*preload="none"/giu) ?? []).length === videos.length, 'every video must use preload="none"');
check((homepage.match(/<source\b[^>]*type="video\/mp4"/giu) ?? []).length === videos.length, 'every video must expose an MP4 source in initial HTML');
check((homepage.match(/\bdata-inline-video(?:\s|>)/giu) ?? []).length === videos.length, 'every video must be embedded contextually inside article text');
check((homepage.match(/\bdata-contextual-image(?:\s|>)/giu) ?? []).length >= 6, 'physician and clinic images must remain contextual');
check(!/<section\b[^>]*\bid="videos"/iu.test(homepage), 'standalone video section is forbidden');
check(!/<section\b[^>]*\bid="clinic"/iu.test(homepage), 'standalone clinic photo section is forbidden');
check(!/<section\b[^>]*\bid="doctor"/iu.test(homepage), 'standalone physician identity section is forbidden');
check(!/<section\b[^>]*\bid="decision-model"/iu.test(homepage), 'standalone decision-model section is forbidden');
check(!homepage.includes('video-rail'), 'video carousel/library markup is forbidden');
check(!homepage.includes('gallery-grid'), 'standalone photo gallery markup is forbidden');
check(!homepage.includes('guide-index'), 'article must not render as a knowledge-base index');
check(!homepage.includes('guide-card'), 'article must not render as accordion cards');
check(!homepage.includes('href="#videos"'), 'navigation must not expose a separate videos destination');
check(!/<div\b[^>]*aria-label=/iu.test(homepage.replace(/<div\b[^>]*role="(?:group|navigation|region)"[^>]*aria-label=[^>]*>/giu, '')), 'generic div uses aria-label without an explicit role');
check(!/<time\b(?![^>]*datetime=)/iu.test(homepage), 'time element missing datetime');

const articleStart = homepage.indexOf('id="clinical-guide"');
const contactStart = homepage.indexOf('id="contact"');
check(articleStart >= 0 && contactStart > articleStart, 'article and contact ordering is invalid');
for (const video of videos) {
  const position = homepage.indexOf(`id="video-${video.id}"`);
  check(position > articleStart && position < contactStart, `${video.id}: video is not inside article text`);
}

for (const phrase of [
  'Knowledge & AI', 'Retrieval Corpus', 'Search Intent', 'knowsAbout', 'مدل زبانی',
  'موتورهای جست‌وجو', 'گوگل و LLM', 'کتابخانهٔ ویدئویی', 'محیط واقعی کلینیک',
  'هویت قابل‌پیگیری', 'تصمیم قابل‌دفاع', 'مدل تصمیم سه‌لایه', 'دانش‌نامهٔ بالینی',
  'راهنمای کامل تصمیم‌گیری', 'مسئول تصمیم بالینی',
]) {
  check(!visible.includes(phrase), `forbidden phrase leaked into visible UI: ${phrase}`);
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
const inline = JSON.parse(inlineMatches[0][1]);
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
  check(page?.mainEntity?.['@id'] === `${site}#person` && !Array.isArray(page?.mainEntity), `${label}: Person must be the sole page mainEntity`);
  return { nodes, defined };
}

function auditPersonIdentity(label, audit) {
  const person = audit.nodes.find((node) => node['@id'] === `${site}#person`);
  check(Boolean(person), `${label}: canonical Person missing`);
  if (!person) return;

  check(person.honorificPrefix === personIdentityContract.honorificPrefix, `${label}: Person honorificPrefix missing`);

  const aliases = new Set(Array.isArray(person.alternateName) ? person.alternateName : [person.alternateName].filter(Boolean));
  for (const alias of personAlternateNames) check(aliases.has(alias), `${label}: Person alternateName missing: ${alias}`);

  const sameAs = new Set(Array.isArray(person.sameAs) ? person.sameAs : [person.sameAs].filter(Boolean));
  for (const url of personRequiredSameAs) check(sameAs.has(url), `${label}: Person sameAs missing: ${url}`);
  for (const url of clinicRequiredSameAs) check(!sameAs.has(url), `${label}: clinic social URL leaked into Person.sameAs: ${url}`);

  const identifiers = Array.isArray(person.identifier) ? person.identifier : [person.identifier].filter(Boolean);
  for (const required of restoredPersonIdentifiers) {
    check(
      identifiers.some((item) => item?.propertyID === required.propertyID && item?.value === required.value),
      `${label}: Person identifier missing: ${required.propertyID}=${required.value}`,
    );
  }

  check(
    identifiers.some((item) => item?.propertyID === 'MINC' && item?.value === personIdentityContract.minc),
    `${label}: Canadian MINC identifier missing`,
  );
  check(sameAs.has(personIdentityContract.pinterest), `${label}: Pinterest identity missing`);
}

function auditDoctorClinicRelation(label, audit) {
  const person = audit.nodes.find((node) => node['@id'] === `${site}#person`);
  const clinic = audit.nodes.find((node) => node['@id'] === `${site}#clinic`);
  check(Boolean(person), `${label}: Person missing for doctor-clinic relation`);
  check(Boolean(clinic), `${label}: Clinic missing for doctor-clinic relation`);
  if (!person || !clinic) return;

  check(person.worksFor?.['@id'] === `${site}#clinic`, `${label}: Person.worksFor must point to Clinic`);
  check(person.workLocation?.['@id'] === `${site}#clinic`, `${label}: Person.workLocation must point to Clinic`);
  check(person.affiliation?.['@id'] === `${site}#clinic`, `${label}: Person.affiliation must point to Clinic`);
  check(clinic.employee?.['@id'] === `${site}#person`, `${label}: Clinic.employee must point to Person`);

  const clinicSameAs = new Set(Array.isArray(clinic.sameAs) ? clinic.sameAs : [clinic.sameAs].filter(Boolean));
  for (const url of clinicRequiredSameAs) check(clinicSameAs.has(url), `${label}: Clinic.sameAs missing: ${url}`);
}

const fullAudit = auditGraph('canonical graph', full);
const inlineAudit = auditGraph('inline graph', inline);
check(fullAudit.nodes.length >= 800, `canonical graph unexpectedly narrow: ${fullAudit.nodes.length}`);
check(inlineAudit.nodes.length <= 60, `inline projection is too broad: ${inlineAudit.nodes.length}`);
check(!inlineAudit.nodes.some((node) => [node['@type']].flat().some((type) => type === 'VideoObject' || type === 'Clip')), 'inline projection must not claim video rich-result eligibility without verified uploadDate');
check(!inlineAudit.nodes.some((node) => [node['@type']].flat().includes('ScholarlyArticle')), 'research articles must stay in canonical graph and out of Google page projection');
for (const id of inlineAudit.defined) check(fullAudit.defined.has(id), `inline @id absent from canonical graph: ${id}`);
check(fullAudit.defined.has(`${site}#knowledge-graph-dataset`), 'canonical Dataset node missing');
check(!fullAudit.defined.has(`${site}#retrieval-corpus`), 'removed retrieval Dataset still exists');

auditPersonIdentity('canonical graph', fullAudit);
auditPersonIdentity('inline graph', inlineAudit);
auditDoctorClinicRelation('canonical graph', fullAudit);
auditDoctorClinicRelation('inline graph', inlineAudit);
for (const profile of restoredPersonProfileNodes) {
  check(fullAudit.defined.has(profile['@id']), `canonical graph: restored external profile node missing: ${profile['@id']}`);
}

const inlineArticle = inlineAudit.nodes.find((node) => node['@id'] === `${site}#article`);
const timezoneDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
check(timezoneDateTime.test(inlineArticle?.datePublished ?? ''), 'inline Article datePublished must be a timezone-aware ISO datetime');
check(timezoneDateTime.test(inlineArticle?.dateModified ?? ''), 'inline Article dateModified must be a timezone-aware ISO datetime');
const inlineClinic = inlineAudit.nodes.find((node) => node['@id'] === `${site}#clinic`);
check(inlineClinic?.address?.postalCode === '6714657412', 'inline clinic postalCode is missing or incorrect');

for (const node of fullAudit.nodes) {
  const values = [];
  const visit = (value, key = '') => {
    if (Array.isArray(value)) return value.forEach((item) => visit(item, key));
    if (!value || typeof value !== 'object') return;
    for (const [childKey, child] of Object.entries(value)) {
      if ((childKey === 'url' || childKey === 'contentUrl') && typeof child === 'string') values.push(child);
      visit(child, childKey);
    }
  };
  visit(node);
  for (const value of values.filter((url) => url.startsWith(`${site}#`))) {
    check(idSet.has(value.split('#')[1]), `graph URL has no HTML anchor: ${value}`);
  }
}

const videoNodes = fullAudit.nodes.filter((node) => [node['@type']].flat().includes('VideoObject'));
const clipNodes = fullAudit.nodes.filter((node) => [node['@type']].flat().includes('Clip'));
check(videoNodes.length === videos.length, `canonical graph must contain ${videos.length} VideoObject nodes`);
check(clipNodes.length === videos.length * 3, `canonical graph must contain ${videos.length * 3} Clip nodes`);
for (const video of videoNodes) {
  check((video.hasPart ?? []).length === 3, `${video['@id']}: expected three clips`);
  check(video.url === video['@id'], `${video['@id']}: URL must target the visible video anchor`);
}
for (const clip of clipNodes) check(clip.url === clip['@id'], `${clip['@id']}: URL must target its visible chapter anchor`);

for (const path of [
  'knowledge-graph.jsonld', 'sitemap.xml', 'image-sitemap.xml', 'video-sitemap.xml',
  'llms.txt', 'site.webmanifest', 'robots.txt', '.well-known/ai.txt', '.well-known/security.txt',
]) check(existsSync(join(root, path)), `required public artifact missing: /${path}`);

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
  videos: videoNodes.length,
  clips: clipNodes.length,
  mediaPlacement: {
    standaloneVideoSection: false,
    standalonePhotoSection: false,
    inlineVideos: videos.length,
    contextualImages: (homepage.match(/\bdata-contextual-image(?:\s|>)/giu) ?? []).length,
  },
  richResults: {
    postalCode: inlineClinic?.address?.postalCode,
    datePublished: inlineArticle?.datePublished,
    dateModified: inlineArticle?.dateModified,
    researchArticlesInInlineGraph: 0,
  },
  inlineGraphNodes: inlineAudit.nodes.length,
  canonicalGraphNodes: fullAudit.nodes.length,
  personIdentityContract: {
    minc: personIdentityContract.minc,
    pinterest: true,
    alternateNames: personAlternateNames.length,
    sameAs: personRequiredSameAs.length,
    restoredProfileNodes: restoredPersonProfileNodes.length,
  },
  clinicIdentityContract: {
    socialSameAs: clinicRequiredSameAs,
    employee: `${site}#person`,
  },
  doctorClinicRelation: {
    worksFor: true,
    workLocation: true,
    affiliation: true,
    employee: true,
  },
  publicFiles: files.length,
}, null, 2));
