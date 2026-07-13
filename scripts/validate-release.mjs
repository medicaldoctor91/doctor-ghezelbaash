import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { videos } from '../src/domain/media.mjs';
import { serviceUrlRegistry } from '../src/domain/url-architecture.mjs';
import {
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
check((homepage.match(/\bdata-inline-video(?:\s|>)/giu) ?? []).length === videos.length, 'every video must be embedded contextually inside clinical text');
check((homepage.match(/\bdata-contextual-image(?:\s|>)/giu) ?? []).length >= 6, 'physician and clinic images must remain inside contextual sections');
check(!/<section\b[^>]*\bid="videos"/iu.test(homepage), 'standalone video section is forbidden');
check(!/<section\b[^>]*\bid="clinic"/iu.test(homepage), 'standalone clinic photo section is forbidden');
check(!homepage.includes('video-rail'), 'video carousel/library markup is forbidden');
check(!homepage.includes('gallery-grid'), 'standalone photo gallery markup is forbidden');
check(!homepage.includes('href="#videos"'), 'navigation must not expose a separate videos destination');
check(!/<div\b[^>]*aria-label=/iu.test(homepage.replace(/<div\b[^>]*role="(?:group|navigation|region)"[^>]*aria-label=[^>]*>/giu, '')), 'generic div uses aria-label without an explicit role');
check(!/<time\b(?![^>]*datetime=)/iu.test(homepage), 'time element missing datetime');

const guideStart = homepage.indexOf('id="clinical-guide"');
const contactStart = homepage.indexOf('id="contact"');
check(guideStart >= 0 && contactStart > guideStart, 'clinical guide and contact ordering is invalid');
for (const video of videos) {
  const position = homepage.indexOf(`id="video-${video.id}"`);
  check(position > guideStart && position < contactStart, `${video.id}: video is not inside the clinical guide text`);
}

for (const phrase of [
  'Knowledge & AI', 'Retrieval Corpus', 'Search Intent', 'knowsAbout', 'مدل زبانی',
  'موتورهای جست‌وجو', 'گوگل و LLM', 'کتابخانهٔ ویدئویی', 'محیط واقعی کلینیک',
]) {
  check(!visible.includes(phrase), `forbidden or machine-facing phrase leaked into visible UI: ${phrase}`);
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
  check(![...sameAs].some((url) => /facebook\.com|pinterest\.com/iu.test(url)), `${label}: unverified Facebook or Pinterest profile leaked into Person.sameAs`);

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
  check(sameAs.has(personIdentityContract.linkedin), `${label}: LinkedIn identity missing`);
}

const fullAudit = auditGraph('canonical graph', full);
const inlineAudit = auditGraph('inline graph', inline);
check(fullAudit.nodes.length >= 800, `canonical graph unexpectedly narrow: ${fullAudit.nodes.length}`);
check(inlineAudit.nodes.length <= 60, `inline projection is too broad: ${inlineAudit.nodes.length}`);
check(!inlineAudit.nodes.some((node) => [node['@type']].flat().some((type) => type === 'VideoObject' || type === 'Clip')), 'inline projection must not claim video rich-result eligibility without verified uploadDate');
for (const id of inlineAudit.defined) check(fullAudit.defined.has(id), `inline @id absent from canonical graph: ${id}`);
check(fullAudit.defined.has(`${site}#knowledge-graph-dataset`), 'canonical Dataset node missing');
check(!fullAudit.defined.has(`${site}#retrieval-corpus`), 'removed retrieval Dataset still exists');

auditPersonIdentity('canonical graph', fullAudit);
auditPersonIdentity('inline graph', inlineAudit);
for (const profile of restoredPersonProfileNodes) {
  check(fullAudit.defined.has(profile['@id']), `canonical graph: restored Person profile node missing: ${profile['@id']}`);
}
check(!fullAudit.nodes.some((node) => /facebook\.com|pinterest\.com/iu.test(String(node['@id'] ?? ''))), 'unverified Facebook or Pinterest ProfilePage exists in canonical graph');

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
  inlineGraphNodes: inlineAudit.nodes.length,
  canonicalGraphNodes: fullAudit.nodes.length,
  personIdentityContract: {
    minc: personIdentityContract.minc,
    linkedin: true,
    alternateNames: personAlternateNames.length,
    sameAs: personRequiredSameAs.length,
    restoredProfileNodes: restoredPersonProfileNodes.length,
  },
  publicFiles: files.length,
}, null, 2));
