import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const homepage = readFileSync(join(process.cwd(), 'dist', 'index.html'), 'utf8');
const headers = readFileSync(join(process.cwd(), 'dist', '_headers'), 'utf8');
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
]) {
  check(!visible.includes(phrase), `forbidden artificial phrase leaked into visible copy: ${phrase}`);
}

const describedByMatches = [...homepage.matchAll(/<link\b[^>]*\brel="describedby"[^>]*>/giu)];
check(describedByMatches.length === 1, `head must expose exactly one rel=describedby link; found ${describedByMatches.length}`);
check(
  describedByMatches[0]?.[0].includes('href="https://www.ghezelbaash.ir/knowledge-graph.jsonld"')
    && describedByMatches[0]?.[0].includes('type="application/ld+json"'),
  'the sole head describedby link must be the canonical knowledge graph',
);

check((homepage.match(/<link\b[^>]*\brel="me"[^>]*>/giu) ?? []).length === 0, 'rel=me links are forbidden in the canonical head');
check(!/<link\b[^>]*\brel="alternate"[^>]*\btype="text\/plain"/iu.test(homepage), 'AI text endpoints must not be advertised as alternate page representations');
check(!/<link\b[^>]*\bhreflang=/iu.test(homepage), 'single-language homepage must not emit hreflang alternates');
check(!/<meta\b[^>]*\bname="googlebot"/iu.test(homepage), 'duplicate googlebot robots directive is forbidden');
check(!/<meta\b[^>]*\bname="(?:geo\.[^"]+|ICBM)"/iu.test(homepage), 'legacy geo and ICBM metadata are forbidden');
check(
  homepage.includes('<link rel="author" href="https://www.ghezelbaash.ir/#person"'),
  'canonical Person author link is missing',
);
check(
  homepage.includes('<meta property="og:site_name" content="وب‌سایت رسمی دکتر سعید قزلباش"'),
  'Open Graph site name must remain physician-first',
);

const homepageHeaderBlock = headers.match(/\n\/\n([\s\S]*?)(?=\n\/404\.html\n)/u)?.[1] ?? '';
const httpLinkLines = [...homepageHeaderBlock.matchAll(/^\s*Link:\s*(.+)$/gmu)].map((match) => match[1].trim());
check(httpLinkLines.length === 1, `homepage must emit exactly one HTTP Link header; found ${httpLinkLines.length}`);
check(
  httpLinkLines[0] === '</knowledge-graph.jsonld>; rel="describedby"; type="application/ld+json"',
  `homepage HTTP Link contract is not minimal: ${httpLinkLines[0] ?? 'missing'}`,
);
for (const forbidden of ['llms.txt', '.well-known/ai.txt', 'huggingface.co', 'wikidata.org', 'orcid.org', 'membersearch.irimc.org', 'ncbi.nlm.nih.gov']) {
  check(!homepageHeaderBlock.includes(forbidden), `forbidden external or experimental resource leaked into homepage HTTP Link header: ${forbidden}`);
}

for (const label of ['Hugging Face', 'LinkedIn', 'Facebook', 'Pinterest']) {
  check(visible.includes(label), `visible physician profile link missing: ${label}`);
}

check(homepage.includes('class="article-flow'), 'continuous article layout missing');
check(!homepage.includes('class="guide-card'), 'accordion-card article layout returned');
check(!homepage.includes('class="guide-index'), 'knowledge-base index returned');
check(!homepage.includes('مشاهده در صفحه اختصاصی این ویدئو'), 'watch-page link leaked into homepage');
check(!/href="\/videos\/[^"/]+\/"/u.test(homepage), 'homepage links to removed video watch pages');

const contextualVideos = (homepage.match(/<article\b[^>]*\bdata-inline-video(?:\s|>)/giu) ?? []).length;
check(contextualVideos === 12, `all 12 videos must remain contextually embedded in article sections; found ${contextualVideos}`);
check(!visible.includes('مرکز دانش ویدئویی صفحه'), 'standalone video knowledge hub label returned');
check(!visible.includes('۱۲ ویدئو؛ هر رسانه متصل به موضوع، خدمت و مرز تصمیم خودش'), 'standalone video knowledge hub heading returned');
check(!/href="#(?:videos|video-knowledge-hub)"/u.test(homepage), 'a visible link to the removed video hub returned');

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  bestDoctorWrapper: 'closed',
  bestDoctorQueries: bestDoctorIds.length,
  artificialVisiblePhrases: 0,
  headContract: {
    relMeLinks: 0,
    describedByLinks: 1,
    describedByTarget: 'knowledge-graph.jsonld',
    textAlternates: 0,
    hreflangLinks: 0,
    googlebotMeta: 0,
    legacyGeoMeta: 0,
    physicianFirstOpenGraph: true,
  },
  httpLinkContract: {
    links: 1,
    target: 'knowledge-graph.jsonld',
  },
  visibleProfessionalProfiles: 4,
  watchPageLinks: 0,
  standaloneVideoHub: false,
  videoHubLinks: 0,
  contextualVideos,
}, null, 2));
