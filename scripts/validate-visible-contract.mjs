import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { videos } from '../src/domain/media.mjs';

const homepage = readFileSync(join(process.cwd(), 'dist', 'index.html'), 'utf8');
const headers = readFileSync(join(process.cwd(), 'dist', '_headers'), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const countId = (id) => (homepage.match(new RegExp(`\\sid="${id}"`, 'gu')) ?? []).length;
const position = (needle) => homepage.indexOf(needle);

const mainSectionIds = [
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

const personId = 'mohammad-saeed-ghezelbash';
const clinicId = 'dr-saeed-ghezelbash-aesthetic-clinic';

check((homepage.match(/<h1\b/gu) ?? []).length === 1, 'homepage must contain exactly one H1');
check(homepage.includes('دکتر سعید قزلباش؛ پزشک زیبایی، پوست و مو در کرمانشاه'), 'approved physician-first H1 is missing');
check(countId(personId) === 1, `canonical Person HTML id must appear once: ${personId}`);
check(countId(clinicId) === 1, `canonical Clinic HTML id must appear once: ${clinicId}`);
check(countId('content-table') === 1, 'real content table id must appear once');

for (const id of mainSectionIds) check(countId(id) === 1, `${id}: expected one canonical HTML section id; found ${countId(id)}`);

const personStart = position(`id="${personId}"`);
const h1Start = position('id="page-title"');
const portraitStart = position('class="physician-hero__portrait"');
const actionBarStart = position('class="physician-hero__bar"');
const tocStart = position('id="content-table"');
check(personStart >= 0 && h1Start > personStart, 'H1 must be inside the Person entity block');
check(portraitStart > h1Start, 'physician portrait must follow the H1 and introduction');
check(actionBarStart > portraitStart, 'key action bar must appear directly after the physician portrait');
check(tocStart > actionBarStart, 'content table must follow the complete Person block');

const personEnd = homepage.indexOf('</header>', personStart);
const personBlock = homepage.slice(personStart, personEnd + 9);
check((personBlock.match(/class="button\b/gu) ?? []).length === 2, 'physician action bar must expose exactly two primary CTA links');
check(personBlock.includes('رزرو وقت مشاوره رایگان'), 'free consultation CTA missing from physician action bar');
check(personBlock.includes('گفت‌وگوی آنلاین با دکتر قزلباش'), 'Instagram direct CTA missing from physician action bar');
check(personBlock.includes('https://ig.me/m/doctor.ghezelbaash'), 'Instagram direct deep link missing');
check(personBlock.includes('https://www.google.com/maps?cid=12350483144643112463'), 'Google Maps deep link missing beside clinic rating');
check(personBlock.includes('۱۶۳ ارزیابی Google Maps'), 'visible dated clinic rating count is missing from physician action bar');

check(!homepage.includes('class="quiet-best'), 'collapsed best-doctor wrapper must not return');
check(!homepage.includes('id="clinic-reputation"'), 'separate reputation H2 must not return');
check(!homepage.includes('id="search-intent-hub"'), 'separate priority answer H2 must not return');
check(!homepage.includes('id="services"'), 'legacy generic services anchor must not return');
check(!homepage.includes('clinical-decision-model-detail-19"'), 'legacy numeric section anchors must not leak into rendered HTML');

for (const video of videos) {
  const videoId = `video-${video.id}`;
  check(countId(videoId) === 1, `${videoId}: expected one contextual video figure`);
  const videoPosition = position(`id="${videoId}"`);
  const destinationPosition = position(`id="${video.subsectionId ?? video.sectionId}"`);
  check(destinationPosition >= 0, `${video.id}: mapped destination is missing from HTML`);
  check(videoPosition > destinationPosition, `${video.id}: video must render after its mapped destination`);
}

const educationStart = position('id="medical-education"');
const researchSectionEnd = position('id="clinic-information-kermanshah"');
for (const id of ['home-workshop-thread-lift-training', 'home-workshop-thread-lift-advanced']) {
  const videoPosition = position(`id="video-${id}"`);
  check(videoPosition > educationStart && videoPosition < researchSectionEnd, `${id}: medical education video must remain inside #medical-education`);
}
check((homepage.match(/\bdata-inline-video(?:\s|>)/gu) ?? []).length === 11, 'eleven non-clinic videos must be embedded in medical subsections');
check(countId('video-clinic-patient-experience-review') === 1, 'clinic experience video must be embedded in the clinic section');

for (const label of [
  'بررسی شماره نظام پزشکی دکتر محمدسعید قزلباش',
  'شناسه پژوهشگر ORCID دکتر سعید قزلباش',
  'کتاب‌شناسی عمومی NCBI دکتر سعید قزلباش',
  'اینستاگرام رسمی دکتر سعید قزلباش',
  'دیتاست عمومی Hugging Face',
  'گراف دانش JSON-LD سایت',
  'انتیتی کلینیک در Wikidata',
]) check(homepage.includes(label), `footer or source directory link missing: ${label}`);

check(homepage.includes(`<link rel="author" href="https://www.ghezelbaash.ir/#${personId}"`), 'head author link must use the canonical physician entity id');
const describedByMatches = [...homepage.matchAll(/<link\b[^>]*\brel="describedby"[^>]*>/giu)];
check(describedByMatches.length === 1, `head must expose exactly one rel=describedby link; found ${describedByMatches.length}`);
check(describedByMatches[0]?.[0].includes('knowledge-graph.jsonld'), 'describedby must point to the canonical knowledge graph');

const homepageHeaderBlock = headers.match(/\n\/\n([\s\S]*?)(?=\n\/404\.html\n)/u)?.[1] ?? '';
const httpLinkLines = [...homepageHeaderBlock.matchAll(/^\s*Link:\s*(.+)$/gmu)].map((match) => match[1].trim());
check(httpLinkLines.length === 1, `homepage must emit exactly one HTTP Link header; found ${httpLinkLines.length}`);
check(httpLinkLines[0] === '</knowledge-graph.jsonld>; rel="describedby"; type="application/ld+json"', 'homepage HTTP Link contract must remain minimal');

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  h1Count: 1,
  mainSections: mainSectionIds.length,
  personEntityId: personId,
  clinicEntityId: clinicId,
  heroPrimaryCtas: 2,
  mappedVideos: videos.length,
  contentTable: true,
  externalSourceDirectory: true,
}, null, 2));
