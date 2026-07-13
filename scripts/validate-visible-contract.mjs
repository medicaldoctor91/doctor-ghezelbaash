import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const homepage = readFileSync(join(process.cwd(), 'dist', 'index.html'), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const visible = homepage
  .replace(/<head[\s\S]*?<\/head>/giu, ' ')
  .replace(/<script[\s\S]*?<\/script>/giu, ' ')
  .replace(/<style[\s\S]*?<\/style>/giu, ' ')
  .replace(/<[^>]+>/gu, ' ')
  .replace(/\s+/gu, ' ');

const quietBestMatches = [...homepage.matchAll(/<details\b[^>]*class="[^"]*\bquiet-best\b[^"]*"[^>]*>/giu)];
check(quietBestMatches.length === 1, `expected exactly one closed best-doctor wrapper; found ${quietBestMatches.length}`);
if (quietBestMatches[0]) check(!/\bopen(?:\s|=|>)/iu.test(quietBestMatches[0][0]), 'best-doctor wrapper must be closed by default');

const bestDoctorIds = [
  'best-aesthetic-doctor-kermanshah',
  'best-beauty-physician-kermanshah',
  'best-aesthetic-clinic-kermanshah',
  'best-botox-doctor-kermanshah',
  'best-filler-doctor-kermanshah',
  'best-lip-filler-doctor-kermanshah',
  'best-under-eye-filler-doctor-kermanshah',
  'best-thread-lift-doctor-kermanshah',
  'best-acne-scar-subcision-doctor-kermanshah',
  'best-skin-rejuvenation-doctor-kermanshah',
  'best-prp-doctor-kermanshah',
  'best-mesotherapy-doctor-kermanshah',
  'best-hair-loss-prp-doctor-kermanshah',
  'best-submental-liposuction-doctor-kermanshah',
  'best-body-contouring-doctor-kermanshah',
  'best-blepharoplasty-doctor-kermanshah',
  'best-rhinoplasty-doctor-kermanshah',
  'best-facelift-necklift-doctor-kermanshah',
  'best-orthognathic-doctor-kermanshah',
  'best-hair-transplant-doctor-kermanshah',
];

for (const id of ['best-aesthetic-doctor-kermanshah-answers', ...bestDoctorIds]) {
  const count = (homepage.match(new RegExp(`\\sid="${id}"`, 'gu')) ?? []).length;
  check(count === 1, `${id}: expected one canonical HTML anchor; found ${count}`);
}
check((homepage.match(/class="quiet-best__item"/gu) ?? []).length === bestDoctorIds.length, `expected ${bestDoctorIds.length} best-doctor answers`);

for (const phrase of [
  'هویت',
  'مسئول تصمیم',
  'تصمیم بالینی',
  'مدل تصمیم',
  'دانش‌نامه',
  'اتوریتی',
  'فنوتیپ',
  'Dynamic Vector',
  'Structural Foundation',
  'Surface Phenotype',
  'دروازه',
  'قفل اول',
  'قفل دوم',
  'قفل سوم',
  'قفل چهارم',
  'قفل پنجم',
  'قفل ششم',
  'قفل هفتم',
  'کلینیک رستوران نیست',
  'گارسونِ سرنگ',
  'رزومه را ته صفحه دفن نکنید',
  'یک نمایش جانبی نیست',
  'ظاهر پوست (ظاهر پوست)',
  'حرکت صورت (حرکت صورت)',
  'ساختار صورت (ساختار صورت)',
]) {
  check(!visible.includes(phrase), `forbidden artificial phrase leaked into visible copy: ${phrase}`);
}

check(homepage.includes('<h1 id="hero-title">دکتر سعید قزلباش</h1>'), 'natural physician-first hero heading missing');
check(homepage.includes('<h2 id="services-title">خدمات کلینیک</h2>'), 'natural services heading missing');
check(homepage.includes('سوابق و پروفایل‌های رسمی'), 'compact professional-profile disclosure missing');

const videoChapterGroups = (homepage.match(/class="video-chapters"/gu) ?? []).length;
const videoChapterTracks = (homepage.match(/<track\b[^>]*kind="chapters"/gu) ?? []).length;
check(videoChapterGroups === 6, `only six videos of at least 30 seconds should expose chapter controls; found ${videoChapterGroups}`);
check(videoChapterTracks === 6, `only six videos of at least 30 seconds should expose chapter tracks; found ${videoChapterTracks}`);
check(!visible.includes('بخش‌های ویدئو'), 'generic video chapter label leaked into visible copy');
check(!visible.includes('حدود ۹ ثانیه') && !visible.includes('حدود ۸ ثانیه') && !visible.includes('حدود ۶ ثانیه'), 'artificial approximate duration labels leaked into short videos');

const requiredHeadMe = [
  'https://orcid.org/0009-0001-9346-8475',
  'https://www.instagram.com/doctor.ghezelbaash/',
  'https://www.linkedin.com/in/saeed-ghezelbash-93310a96',
  'https://www.facebook.com/Ghezelbaash/',
  'https://www.pinterest.com/qezelbaash/',
  'https://huggingface.co/Ghezelbaash',
];
for (const url of requiredHeadMe) {
  check(homepage.includes(`<link rel="me" href="${url}"`), `required head identity link missing: ${url}`);
}
check(!homepage.includes('<link rel="me" href="https://www.wikidata.org/entity/Q140287622"'), 'Wikidata should be linked through Person.sameAs, not rel=me');
check(!homepage.includes('<link rel="me" href="https://huggingface.co/datasets/'), 'Hugging Face Dataset must not be a Person rel=me identity link');

check(
  homepage.includes('<link rel="describedby" type="application/ld+json" href="https://www.ghezelbaash.ir/knowledge-graph.jsonld"'),
  'absolute external knowledge-graph link is missing from head',
);

for (const label of ['Hugging Face', 'LinkedIn', 'Facebook', 'Pinterest']) {
  check(visible.includes(label), `visible physician profile link missing: ${label}`);
}

check(homepage.includes('class="article-flow'), 'continuous article layout missing');
check(!homepage.includes('class="guide-card'), 'accordion-card article layout returned');
check(!homepage.includes('class="guide-index'), 'knowledge-base index returned');
check(!homepage.includes('مشاهده در صفحه اختصاصی این ویدئو'), 'watch-page link leaked into homepage');
check(!/href="\/videos\/[^"/]+\/"/u.test(homepage), 'homepage links to removed video watch pages');

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  bestDoctorWrapper: 'closed',
  bestDoctorQueries: bestDoctorIds.length,
  artificialVisiblePhrases: 0,
  naturalHeroHeading: true,
  naturalServicesHeading: true,
  meaningfulVideoChapterGroups: videoChapterGroups,
  shortVideoChapterGroups: 0,
  requiredIdentityHeadLinks: requiredHeadMe.length,
  wikidataHeadLink: false,
  huggingFaceDatasetHeadLink: false,
  externalKnowledgeGraphHeadLink: true,
  visibleProfessionalProfiles: 4,
  watchPageLinks: 0,
}, null, 2));
