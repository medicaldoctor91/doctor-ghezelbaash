import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  homepageSections,
  homepageArticleSubsections,
} from '../src/domain/homepage-content-registry.mjs';
import { homepageSubsectionSummaries } from '../src/domain/homepage-subsection-summaries.mjs';

const root = process.cwd();
const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const normalize = (value) => value
  .replace(/<script\b[\s\S]*?<\/script>/giu, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/giu, ' ')
  .replace(/<svg\b[\s\S]*?<\/svg>/giu, ' ')
  .replace(/<[^>]+>/gu, ' ')
  .replace(/&zwnj;|&#8204;/giu, '\u200c')
  .replace(/&nbsp;|&#160;/giu, ' ')
  .replace(/&#(\d+);/gu, (_, number) => String.fromCodePoint(Number(number)))
  .replace(/&[a-z0-9#]+;/giu, ' ')
  .replace(/\s+/gu, ' ')
  .trim();
const wordCount = (value) => normalize(value).split(/\s+/u).filter(Boolean).length;
const occurrences = (value, term) => value.split(term).length - 1;
const sectionPosition = (id) => html.indexOf(`id="${id}"`);
const sectionSlice = (id) => {
  const index = homepageSections.findIndex((section) => section.id === id);
  const start = sectionPosition(id);
  const nextId = homepageSections[index + 1]?.id;
  const end = nextId ? sectionPosition(nextId) : html.indexOf('</main>', start);
  return start >= 0 && end > start ? html.slice(start, end) : '';
};

const mainMatch = html.match(/<main\b[^>]*id="main-content"[^>]*>([\s\S]*?)<\/main>/iu);
const main = mainMatch?.[1] ?? '';
const mainWordCount = wordCount(main);
check(mainWordCount >= 18_000 && mainWordCount <= 22_000, `Stage 5 main content must remain between 18,000 and 22,000 words; found ${mainWordCount}`);

const expectedSummaryIds = homepageArticleSubsections.map((subsection) => subsection.id);
const actualSummaryIds = Object.keys(homepageSubsectionSummaries);
check(actualSummaryIds.length === expectedSummaryIds.length, `curated H3 direct-answer count mismatch: ${actualSummaryIds.length}/${expectedSummaryIds.length}`);
check(expectedSummaryIds.every((id) => Object.hasOwn(homepageSubsectionSummaries, id)), 'one or more canonical H3 direct answers are missing');
check(actualSummaryIds.every((id) => expectedSummaryIds.includes(id)), 'unknown H3 direct-answer key exists');

for (const [id, summary] of Object.entries(homepageSubsectionSummaries)) {
  const words = wordCount(summary);
  check(words >= 55 && words <= 90, `${id}: curated direct answer must contain 55–90 words; found ${words}`);
  check(!/<[^>]+>/u.test(summary), `${id}: curated direct answer must remain plain text`);
  check(!/(?:تضمین(?:‌|\s)?شده|صددرصد|بدون عارضه|کاملاً بی‌خطر)/u.test(summary), `${id}: absolute medical claim is forbidden`);
}

for (let index = 0; index < homepageArticleSubsections.length; index += 1) {
  const subsection = homepageArticleSubsections[index];
  const start = sectionPosition(subsection.id);
  const nextId = homepageArticleSubsections[index + 1]?.id;
  const nextPosition = nextId ? sectionPosition(nextId) : html.indexOf('</article>', start);
  const slice = start >= 0 && nextPosition > start ? html.slice(start, nextPosition) : '';
  const direct = slice.match(/<p\b[^>]*class="[^"]*\bsubsection-direct-answer\b[^"]*"[^>]*>([\s\S]*?)<\/p>/iu);
  check(Boolean(direct), `${subsection.id}: visible direct answer is missing`);
  const visible = normalize(direct?.[1] ?? '').replace(/^پاسخ مستقیم:\s*/u, '');
  check(visible === homepageSubsectionSummaries[subsection.id], `${subsection.id}: visible direct answer differs from the curated source`);
  const h4Position = slice.indexOf('<h4');
  check(h4Position < 0 || slice.indexOf('subsection-direct-answer') < h4Position, `${subsection.id}: direct answer must precede legacy H4 detail`);
}

const directAnswerSectionIds = homepageSections.slice(0, 13).map((section) => section.id);
for (const id of directAnswerSectionIds) {
  const slice = sectionSlice(id);
  check(Boolean(slice), `${id}: section is missing`);
  const hasAnswerFirstOpening = slice.includes('پاسخ مستقیم:')
    || (id === 'aesthetic-services-kermanshah' && slice.includes('باور غلط را کنار بگذارید:'));
  check(hasAnswerFirstOpening, `${id}: H2 section lacks an answer-first or myth-busting opening`);
}

const sectionWordRanges = {
  'best-aesthetic-doctor-kermanshah': [1200, 2300],
  'aesthetic-services-kermanshah': [1500, 2500],
  'aesthetic-treatment-selection': [1300, 2500],
  'injectable-aesthetic-treatments': [2400, 4000],
  'lifting-and-facial-aging': [1100, 2400],
  'skin-scar-rejuvenation': [1600, 3100],
  'hair-loss-and-restoration': [900, 2000],
  'submental-and-body-contouring': [800, 1900],
  'aesthetic-surgery-and-referral': [650, 1500],
  'revision-complications-and-safety': [950, 2200],
  'aesthetic-cost-and-consultation': [450, 1100],
  'aesthetic-faq-kermanshah-iran': [900, 1800],
  'medical-research-and-education': [600, 1300],
  'clinic-information-kermanshah': [150, 600],
  'knowledge-graph-and-datasets': [120, 450],
  'sources-contact-and-appointment': [70, 350],
};
const sectionWordCounts = {};
for (const section of homepageSections) {
  const words = wordCount(sectionSlice(section.id));
  sectionWordCounts[section.id] = words;
  const [minimum, maximum] = sectionWordRanges[section.id];
  check(words >= minimum && words <= maximum, `${section.id}: section depth ${words} is outside ${minimum}–${maximum}`);
}

const nationalArticleIds = [
  'aesthetic-treatment-selection',
  'injectable-aesthetic-treatments',
  'lifting-and-facial-aging',
  'skin-scar-rejuvenation',
  'hair-loss-and-restoration',
  'submental-and-body-contouring',
  'aesthetic-surgery-and-referral',
  'revision-complications-and-safety',
  'medical-research-and-education',
];
for (const id of nationalArticleIds) {
  const cityMentions = occurrences(normalize(sectionSlice(id)), 'کرمانشاه');
  check(cityMentions <= 2, `${id}: local keyword is overused in a national section (${cityMentions})`);
}

const services = sectionSlice('aesthetic-services-kermanshah');
check(services.includes('یک Knowledge Domain؛ نه منوی فروش'), 'unified medical knowledge-domain framing is missing');
check(services.includes('وقتی سوزن و دستگاه کم می‌آورند؛ جراحی وارد تصمیم می‌شود'), 'surgical decision boundary is missing from the unified domain');
check(services.includes('حکم آناتومی:'), 'surgical topics do not expose the anatomical decision boundary');
check(!services.includes('خدمات ارائه‌شده پس از ارزیابی پزشکی'), 'obsolete offered-service presentation split remains');
check(!services.includes('class="service-card__badge"'), 'obsolete referral badge remains');
check(services.includes('id="botox-kermanshah"') && services.includes('id="aesthetic-surgery-evaluation-kermanshah"'), 'medical topic destinations are not independently addressable');

check(homepageSubsectionSummaries['dermal-filler-guide'].includes('انسداد عروقی'), 'filler guide must state vascular-occlusion risk');
check(homepageSubsectionSummaries['filler-complications'].includes('اختلال بینایی'), 'filler complication answer must state the vision-warning boundary');
check(homepageSubsectionSummaries['botox-complications'].includes('تنفس') && homepageSubsectionSummaries['botox-complications'].includes('بلع'), 'botulinum complication answer must include breathing and swallowing warnings');
check(homepageSubsectionSummaries['hair-loss-diagnosis'].includes('آزمایش خون') && homepageSubsectionSummaries['hair-loss-diagnosis'].includes('نمونه‌برداری'), 'hair-loss diagnosis answer must preserve targeted testing boundaries');
check(homepageSubsectionSummaries['active-acne-before-scar-treatment'].includes('آکنه فعال کنترل شده'), 'scar pathway must prioritize control of active acne');

const paragraphs = [...main.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/giu)]
  .map((match) => normalize(match[1]))
  .filter((text) => wordCount(text) >= 35);
const paragraphCounts = new Map();
for (const paragraph of paragraphs) paragraphCounts.set(paragraph, (paragraphCounts.get(paragraph) ?? 0) + 1);
const repeatedLongParagraphs = [...paragraphCounts].filter(([, amount]) => amount > 1).map(([text]) => text.slice(0, 120));
check(repeatedLongParagraphs.length === 0, `duplicate long medical paragraphs remain: ${repeatedLongParagraphs.join(' | ')}`);

check(html.includes('data-stage-five-content'), 'Stage 5 renderer marker is missing');
check(!html.includes('سطح ۳ (Tier 3)') && !html.includes('Structural Foundation'), 'internal editorial tier language leaked into visible content');
check(!html.includes('قفل پنجم:'), 'internal editorial lock language leaked into visible content');
check(!html.includes('افسانهٔ «تقویت ریشه»'), 'dismissive legacy heading leaked into visible content');
check(!html.includes('پروتکل قبل از خروج'), 'internal protocol heading leaked into visible content');

if (failures.length) {
  console.error(JSON.stringify({
    stage: 5,
    status: 'fail',
    failures,
    mainWordCount,
    sectionWordCounts,
    curatedDirectAnswers: actualSummaryIds.length,
    repeatedLongParagraphs: repeatedLongParagraphs.length,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  stage: 5,
  status: 'pass',
  mainWordCount,
  sectionWordCounts,
  curatedDirectAnswers: actualSummaryIds.length,
  summaryWordRange: [
    Math.min(...Object.values(homepageSubsectionSummaries).map(wordCount)),
    Math.max(...Object.values(homepageSubsectionSummaries).map(wordCount)),
  ],
  duplicateLongParagraphs: 0,
  localKeywordStuffing: 0,
  unifiedMedicalKnowledgeDomain: true,
  absoluteMedicalClaims: 0,
}, null, 2));
