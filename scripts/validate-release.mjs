import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { videos } from '../src/domain/media.mjs';
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
const personFragment = 'mohammad-saeed-ghezelbash';
const clinicFragment = 'dr-saeed-ghezelbash-aesthetic-clinic';
const personId = `${site}#${personFragment}`;
const clinicId = `${site}#${clinicFragment}`;
const pageId = `${site}#webpage`;
const huggingFaceProfile = 'https://huggingface.co/Ghezelbaash';
const huggingFaceDataset = 'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data';
const sectionIds = [
  'best-aesthetic-doctor-kermanshah',
  'aesthetic-services-kermanshah',
  'aesthetic-treatment-selection',
  'injectable-aesthetic-treatments',
  'lifting-and-facial-aging',
  'skin-scar-rejuvenation',
  'hair-loss-and-restoration',
  'submental-and-body-contouring',
  'aesthetic-surgery-and-referral',
  'revision-complications-and-safety',
  'aesthetic-cost-and-consultation',
  'aesthetic-faq-kermanshah-iran',
  'medical-research-and-education',
  'clinic-information-kermanshah',
  'knowledge-graph-and-datasets',
  'sources-contact-and-appointment',
];

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
check(!htmlFiles.some((path) => path.startsWith('videos/')), `video watch pages are forbidden: ${htmlFiles.filter((path) => path.startsWith('videos/')).join(', ')}`);
check(statSync(homepagePath).size < 700_000, `homepage exceeds 700KB: ${statSync(homepagePath).size}`);
check((homepage.match(/<h1\b/giu) ?? []).length === 1, 'homepage must contain exactly one H1');
check(visible.includes('دکتر سعید قزلباش؛ پزشک زیبایی، پوست و مو در کرمانشاه'), 'approved physician-first H1 is missing');

const ids = [...homepage.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
const idSet = new Set(ids);
const duplicateIds = [...new Set(ids.filter((value, index) => ids.indexOf(value) !== index))];
check(ids.length === idSet.size, `duplicate HTML ids: ${duplicateIds.join(', ')}`);
for (const href of [...homepage.matchAll(/href="#([^"]+)"/gu)].map((match) => match[1])) {
  check(idSet.has(href), `broken homepage fragment: #${href}`);
}

check(idSet.has(personFragment), `canonical Person HTML id missing: ${personFragment}`);
check(idSet.has(clinicFragment), `canonical Clinic HTML id missing: ${clinicFragment}`);
check(!idSet.has('person') && !idSet.has('clinic') && !idSet.has('doctor'), 'legacy entity HTML ids must be removed');
check(idSet.has('content-table'), 'real Content Table is missing');
for (const fragment of sectionIds) check(idSet.has(fragment), `canonical homepage section missing: #${fragment}`);

const position = (fragment) => homepage.indexOf(`id="${fragment}"`);
const personStart = position(personFragment);
const contentTableStart = position('content-table');
const sectionPositions = sectionIds.map((fragment) => position(fragment));
const firstSectionStart = sectionPositions[0];
const clinicStart = position('clinic-information-kermanshah');
check(personStart >= 0 && contentTableStart > personStart, 'Content Table must follow the complete Person block');
check(firstSectionStart > contentTableStart, 'main content must follow the Content Table');
check(sectionPositions.every((value) => value >= 0), 'one or more canonical Homepage section positions are missing');
for (let index = 1; index < sectionPositions.length; index += 1) {
  check(sectionPositions[index] > sectionPositions[index - 1], `canonical Homepage section ordering is invalid: ${sectionIds[index - 1]} -> ${sectionIds[index]}`);
}

const personEnd = homepage.indexOf('</header>', personStart);
const personBlock = homepage.slice(personStart, personEnd + 9);
check((personBlock.match(/class="button\b/gu) ?? []).length === 2, 'physician block must expose exactly two primary CTA links');
check(personBlock.includes('رزرو وقت مشاوره رایگان'), 'free consultation CTA missing');
check(personBlock.includes('گفت‌وگوی آنلاین با دکتر قزلباش'), 'Instagram direct CTA missing');
check(personBlock.includes('https://ig.me/m/doctor.ghezelbaash'), 'Instagram direct deep link missing');
check(personBlock.includes('https://www.google.com/maps?cid=12350483144643112463'), 'Google Maps deep link missing beside rating');
check(personBlock.includes('۱۶۳ ارزیابی Google Maps'), 'clinic rating count missing from Person action bar');

for (const fragment of sectionIds) {
  check(homepage.includes(`href="#${fragment}"`), `Content Table or internal navigation does not link to #${fragment}`);
}

check((homepage.match(/<video\b/giu) ?? []).length === videos.length, `homepage must contain ${videos.length} video elements`);
check((homepage.match(/<video\b[^>]*preload="none"/giu) ?? []).length === videos.length, 'every homepage video must use preload="none"');
check((homepage.match(/<source\b[^>]*type="video\/mp4"/giu) ?? []).length === videos.length, 'every homepage video must expose an MP4 source');
for (const video of videos) {
  const videoFragment = `video-${video.id}`;
  check(ids.filter((value) => value === videoFragment).length === 1, `${videoFragment}: expected one contextual video figure`);
  const destination = video.subsectionId ?? video.sectionId;
  check(idSet.has(destination), `${video.id}: mapped destination is absent from HTML: #${destination}`);
  check(position(videoFragment) > position(destination), `${video.id}: video must render after its mapped destination`);
}
check((homepage.match(/\bdata-inline-video(?:\s|>)/giu) ?? []).length === videos.filter((video) => video.sectionId !== 'clinic-information-kermanshah').length, 'all non-clinic videos must be embedded in medical subsections');
check(position('video-clinic-patient-experience-review') > clinicStart, 'clinic experience video must be inside the clinic section');
check((homepage.match(/\bdata-contextual-image(?:\s|>)/giu) ?? []).length >= 5, 'physician and clinic images must remain contextual');
check(!homepage.includes('video-rail'), 'video carousel/library markup is forbidden');
check(!/href="\/videos\/[^"/]+\/"/u.test(homepage), 'homepage must not link to video watch pages');

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
  const dangling = [...references].filter((value) => !defined.has(value));
  check(dangling.length === 0, `${label}: dangling same-site @id references: ${dangling.join(', ')}`);
  const byId = new Map(nodes.filter((node) => node?.['@id']).map((node) => [node['@id'], node]));
  const page = byId.get(pageId);
  check(hasType(page, 'MedicalWebPage') && hasType(page, 'ProfilePage'), `${label}: homepage must be MedicalWebPage and ProfilePage`);
  check(page?.mainEntity?.['@id'] === personId && !Array.isArray(page?.mainEntity), `${label}: canonical Person must be the sole page mainEntity`);
  check(!defined.has(`${site}#person`) && !defined.has(`${site}#clinic`) && !defined.has(`${site}#doctor`), `${label}: legacy entity graph ids must be removed`);
  return { nodes, defined, byId };
}

function auditPersonIdentity(label, audit) {
  const person = audit.byId.get(personId);
  check(hasType(person, 'Person'), `${label}: canonical Person missing`);
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
}

function auditDoctorClinicRelation(label, audit) {
  const person = audit.byId.get(personId);
  const clinic = audit.byId.get(clinicId);
  check(hasType(person, 'Person'), `${label}: Person missing for doctor-clinic relation`);
  check(hasType(clinic, 'MedicalClinic') && hasType(clinic, 'LocalBusiness'), `${label}: canonical Clinic missing`);
  if (!person || !clinic) return;
  check(person.worksFor?.['@id'] === clinicId, `${label}: Person.worksFor must point to Clinic`);
  check(person.workLocation?.['@id'] === clinicId, `${label}: Person.workLocation must point to Clinic`);
  check(person.affiliation?.['@id'] === clinicId, `${label}: Person.affiliation must point to Clinic`);
  check(clinic.employee?.['@id'] === personId, `${label}: Clinic.employee must point to Person`);
  check(clinic.hasMap === 'https://www.google.com/maps?cid=12350483144643112463', `${label}: Clinic.hasMap mismatch`);
  check(clinic.address?.postalCode === '6714657412', `${label}: Clinic postalCode missing or incorrect`);
  const clinicSameAs = new Set(asArray(clinic.sameAs));
  for (const url of clinicRequiredSameAs) check(clinicSameAs.has(url), `${label}: Clinic.sameAs missing: ${url}`);
}

const fullAudit = auditGraph('canonical graph', full);
const inlineAudit = auditGraph('inline graph', inline);
check(fullAudit.nodes.length >= 500, `canonical graph unexpectedly narrow: ${fullAudit.nodes.length}`);
check(inlineAudit.nodes.length <= 150, `inline graph is unexpectedly broad: ${inlineAudit.nodes.length}`);
for (const item of inlineAudit.defined) check(fullAudit.defined.has(item), `inline @id absent from canonical graph: ${item}`);
check(fullAudit.defined.has(`${site}#knowledge-graph-dataset`), 'canonical knowledge graph Dataset missing');

for (const audit of [fullAudit, inlineAudit]) {
  for (const fragment of sectionIds) check(hasType(audit.byId.get(`${site}#${fragment}`), 'WebPageElement'), `section WebPageElement missing: ${fragment}`);
  check(hasType(audit.byId.get(`${site}#content-table`), 'ItemList'), 'Content Table ItemList missing');
  check(audit.nodes.filter((node) => hasType(node, 'VideoObject')).length === videos.length, `expected ${videos.length} VideoObject nodes`);
}

auditPersonIdentity('canonical graph', fullAudit);
auditPersonIdentity('inline graph', inlineAudit);
auditDoctorClinicRelation('canonical graph', fullAudit);
auditDoctorClinicRelation('inline graph', inlineAudit);
for (const profile of restoredPersonProfileNodes) check(fullAudit.defined.has(profile['@id']), `canonical graph: external ProfilePage missing: ${profile['@id']}`);

const dataset = fullAudit.byId.get(huggingFaceDataset);
check(hasType(dataset, 'Dataset'), 'Hugging Face dataset must remain a separate Dataset node');
check(dataset?.creator?.['@id'] === personId, 'Hugging Face Dataset.creator must point to canonical Person');
check(dataset?.publisher?.['@id'] === clinicId, 'Hugging Face Dataset.publisher must point to canonical Clinic');
const datasetAbout = new Set(asArray(dataset?.about).map((item) => item?.['@id']));
check(datasetAbout.has(personId) && datasetAbout.has(clinicId), 'Hugging Face Dataset.about must include Person and Clinic');

const inlineArticle = inlineAudit.byId.get(`${site}#article`);
const timezoneDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
check(timezoneDateTime.test(inlineArticle?.datePublished ?? ''), 'inline Article datePublished must be timezone-aware');
check(timezoneDateTime.test(inlineArticle?.dateModified ?? ''), 'inline Article dateModified must be timezone-aware');

for (const path of [
  'knowledge-graph.jsonld', 'sitemap.xml', 'image-sitemap.xml',
  'llms.txt', 'site.webmanifest', 'robots.txt', '.well-known/ai.txt', '.well-known/security.txt',
]) check(existsSync(join(root, path)), `required public artifact missing: /${path}`);
check(!existsSync(join(root, 'video-sitemap.xml')), 'video-sitemap.xml must remain removed');

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
  homepageBytes: statSync(homepagePath).size,
  htmlFiles,
  canonicalPerson: personId,
  canonicalClinic: clinicId,
  mainSections: sectionIds.length,
  videos: videos.length,
  inlineGraphNodes: inlineAudit.nodes.length,
  canonicalGraphNodes: fullAudit.nodes.length,
}, null, 2));
