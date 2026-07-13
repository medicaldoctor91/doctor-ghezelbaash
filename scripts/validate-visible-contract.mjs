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

for (const id of [
  'best-aesthetic-doctor-kermanshah-answers',
  'best-aesthetic-doctor-kermanshah',
  'best-botox-doctor-kermanshah',
  'best-filler-doctor-kermanshah',
  'best-lip-filler-doctor-kermanshah',
  'best-under-eye-filler-doctor-kermanshah',
  'best-thread-lift-doctor-kermanshah',
  'best-acne-scar-subcision-doctor-kermanshah',
  'best-skin-rejuvenation-doctor-kermanshah',
  'best-hair-loss-prp-doctor-kermanshah',
  'best-submental-liposuction-doctor-kermanshah',
]) {
  const count = (homepage.match(new RegExp(`\\sid="${id}"`, 'gu')) ?? []).length;
  check(count === 1, `${id}: expected one canonical HTML anchor; found ${count}`);
}

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
]) {
  check(!visible.includes(phrase), `forbidden artificial phrase leaked into visible copy: ${phrase}`);
}

for (const url of [
  'https://orcid.org/0009-0001-9346-8475',
  'https://www.instagram.com/doctor.ghezelbaash/',
  'https://www.linkedin.com/in/saeed-ghezelbash-93310a96',
  'https://www.facebook.com/Ghezelbaash/',
  'https://www.pinterest.com/qezelbaash/',
]) {
  check(homepage.includes(`<link rel="me" href="${url}">`) || homepage.includes(`<link rel="me" href="${url}"`), `owned head identity link missing: ${url}`);
}

for (const url of [
  'https://www.wikidata.org/entity/Q140287622',
  'https://huggingface.co/Ghezelbaash',
  'https://github.com/Medicaldoctor91',
  'https://x.com/Qezelbaash',
]) {
  check(!homepage.includes(`<link rel="me" href="${url}"`), `nonessential head rel=me link returned: ${url}`);
}

for (const label of ['LinkedIn', 'Facebook', 'Pinterest']) {
  check(visible.includes(label), `visible physician profile link missing: ${label}`);
}

check(homepage.includes('class="article-flow'), 'continuous article layout missing');
check(!homepage.includes('class="guide-card'), 'accordion-card article layout returned');
check(!homepage.includes('class="guide-index'), 'knowledge-base index returned');

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  bestDoctorWrapper: 'closed',
  bestDoctorQueries: 10,
  artificialVisiblePhrases: 0,
  ownedIdentityHeadLinks: 5,
  nonessentialIdentityHeadLinks: 0,
  visibleSocialProfiles: 3,
}, null, 2));
