import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(process.cwd(), 'dist');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

function parseGraph(html, label) {
  const matches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  check(matches.length === 1, `${label}: expected one inline JSON-LD block, found ${matches.length}`);
  if (!matches[0]) return [];
  try {
    return JSON.parse(matches[0][1])['@graph'] ?? [];
  } catch (error) {
    failures.push(`${label}: invalid JSON-LD (${error.message})`);
    return [];
  }
}

const homePath = join(root, 'index.html');
check(existsSync(homePath), 'homepage missing');
if (existsSync(homePath)) {
  const html = readFileSync(homePath, 'utf8');
  const visible = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
  check(!visible.includes('پژوهش و آموزش'), 'homepage still contains the artificial "پژوهش و آموزش" label');
  check(!visible.includes('هویت پژوهشی قابل تفکیک'), 'homepage still contains the artificial research-identity heading');
  check(html.includes('rel="author" href="https://orcid.org/0009-0001-9346-8475"'), 'homepage head is missing ORCID rel=author');
  check(html.includes('href="/research.jsonld"') && html.includes('type="application/ld+json"'), 'homepage head is missing research graph discovery link');

  const nodes = parseGraph(html, '/');
  const person = nodes.find((node) => node['@id'] === 'https://www.ghezelbaash.ir/#person');
  check(Boolean(person), 'homepage canonical Person node missing');
  const occupationNames = (person?.hasOccupation ?? []).map((item) => item?.name);
  check(occupationNames.includes('پژوهشگر پزشکی'), 'homepage Person schema is missing medical researcher occupation');
  check(occupationNames.includes('مدرس پزشکی زیبایی'), 'homepage Person schema is missing medical educator occupation');

  const scholarly = nodes.filter((node) => (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]).includes('ScholarlyArticle'));
  check(scholarly.length === 2, `homepage expected 2 ScholarlyArticle nodes, found ${scholarly.length}`);
  for (const work of scholarly) {
    check(work.author?.['@id'] === 'https://www.ghezelbaash.ir/#person', `${work['@id']}: scholarly author mismatch`);
    check((work.identifier ?? []).some((id) => id?.propertyID === 'DOI'), `${work['@id']}: DOI identifier missing`);
    check((work.identifier ?? []).some((id) => id?.propertyID === 'PMID'), `${work['@id']}: PMID identifier missing`);
    check(work.inLanguage === 'en', `${work['@id']}: inLanguage must be en`);
  }
  const article = nodes.find((node) => node['@type'] === 'Article');
  const mentioned = new Set((article?.mentions ?? []).map((item) => item?.['@id']));
  for (const work of scholarly) check(mentioned.has(work['@id']), `homepage Article does not mention scholarly work ${work['@id']}`);
}

const researchPath = join(root, 'research.jsonld');
check(existsSync(researchPath), '/research.jsonld missing');
if (existsSync(researchPath)) {
  try {
    const data = JSON.parse(readFileSync(researchPath, 'utf8'));
    check(data['@context'] === 'https://schema.org', '/research.jsonld context mismatch');
    const nodes = data['@graph'] ?? [];
    const person = nodes.find((node) => node['@id'] === 'https://www.ghezelbaash.ir/#person');
    const works = nodes.filter((node) => node['@type'] === 'ScholarlyArticle');
    check(Boolean(person), '/research.jsonld Person missing');
    check(works.length === 2, `/research.jsonld expected 2 scholarly works, found ${works.length}`);
    check((person?.subjectOf ?? []).length === 2, '/research.jsonld Person subjectOf must link both works');
    check((person?.sameAs ?? []).includes('https://orcid.org/0009-0001-9346-8475'), '/research.jsonld ORCID missing');
  } catch (error) {
    failures.push(`/research.jsonld invalid JSON (${error.message})`);
  }
}

const workshopIds = [
  'home-workshop-thread-lift-training',
  'home-workshop-thread-lift-advanced',
];

for (const id of workshopIds) {
  const path = join(root, 'videos', id, 'index.html');
  const label = `/videos/${id}/`;
  check(existsSync(path), `${label} missing`);
  if (!existsSync(path)) continue;
  const html = readFileSync(path, 'utf8');
  check(html.includes('این بخش از چه نوع آموزشی است؟'), `${label} visible educational context missing`);
  check(html.includes('ورکشاپ') && html.includes('پزشکان'), `${label} professional workshop narrative missing`);

  const nodes = parseGraph(html, label);
  const video = nodes.find((node) => {
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    return types.includes('VideoObject');
  });
  check(Boolean(video), `${label} VideoObject missing`);
  const videoTypes = Array.isArray(video?.['@type']) ? video['@type'] : [video?.['@type']];
  check(videoTypes.includes('LearningResource'), `${label} VideoObject must also be a LearningResource`);
  check(Boolean(video?.learningResourceType), `${label} learningResourceType missing`);
  check(Array.isArray(video?.educationalUse) && video.educationalUse.length >= 2, `${label} educationalUse is incomplete`);
  check(Array.isArray(video?.teaches) && video.teaches.length >= 3, `${label} teaches is incomplete`);
  check(video?.audience?.['@type'] === 'EducationalAudience', `${label} EducationalAudience missing`);
  check(video?.creator?.['@id'] === 'https://www.ghezelbaash.ir/#person', `${label} creator must be canonical Person`);
  check(video?.author?.['@id'] === 'https://www.ghezelbaash.ir/#person', `${label} author must be canonical Person`);

  const series = nodes.find((node) => node['@type'] === 'CreativeWorkSeries');
  check(Boolean(series), `${label} CreativeWorkSeries missing`);
  check((series?.hasPart ?? []).length === 2, `${label} workshop series must connect both workshop videos`);

  const person = nodes.find((node) => node['@id'] === 'https://www.ghezelbaash.ir/#person');
  const occupations = (person?.hasOccupation ?? []).map((item) => item?.name);
  check(occupations.includes('مدرس پزشکی زیبایی'), `${label} educator occupation missing from Person`);
  const allTypes = nodes.flatMap((node) => Array.isArray(node['@type']) ? node['@type'] : [node['@type']]);
  check(!allTypes.includes('Course'), `${label} must not claim a Course without a published course record`);
  check(!allTypes.includes('EducationEvent'), `${label} must not claim an EducationEvent without event facts`);
}

for (const [path, needle] of [
  [join(root, 'llms.txt'), 'https://www.ghezelbaash.ir/research.jsonld'],
  [join(root, '.well-known', 'ai.txt'), 'https://www.ghezelbaash.ir/research.jsonld'],
]) {
  check(existsSync(path), `required discovery file missing: ${path}`);
  if (existsSync(path)) check(readFileSync(path, 'utf8').includes(needle), `${path} missing research graph URL`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  artificialHomepageResearchCard: false,
  researchGraph: '/research.jsonld',
  scholarlyArticles: 2,
  workshopLearningResources: 2,
  workshopSeries: 1,
}, null, 2));
