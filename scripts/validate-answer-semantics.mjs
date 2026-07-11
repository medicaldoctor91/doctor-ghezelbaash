import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { authoredAnswerMappings } from '../src/domain/answer-hub.mjs';

const root = join(process.cwd(), 'dist');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const sameArray = (actual = [], expected = []) => actual.length === expected.length && actual.every((value, index) => value === expected[index]);

function readJsonlDirectory(directory, prefix) {
  return readdirSync(join(root, directory))
    .filter((name) => name.startsWith(prefix) && name.endsWith('.jsonl'))
    .sort()
    .flatMap((name) => readFileSync(join(root, directory, name), 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)));
}

const answers = readJsonlDirectory('answers', 'answers-');
const searchChunks = readJsonlDirectory('search', 'chunks-');
const faq = JSON.parse(readFileSync(join(root, 'faq.json'), 'utf8')).questions ?? [];
const aiFaq = JSON.parse(readFileSync(join(root, 'ai', 'faq.json'), 'utf8')).questions ?? [];

for (const mapping of authoredAnswerMappings) {
  const answer = answers.find((record) => record.visibleSectionId === mapping.sectionId);
  const chunk = searchChunks.find((record) => record.id === mapping.sectionId);
  check(Boolean(answer), `${mapping.sectionId}: missing answer record`);
  check(Boolean(chunk), `${mapping.sectionId}: missing search chunk`);
  if (!answer || !chunk) continue;

  check(answer.question === mapping.question, `${mapping.sectionId}: answer question drifted`);
  check(answer.conceptId === mapping.primaryConceptId, `${mapping.sectionId}: primary concept mismatch (${answer.conceptId} !== ${mapping.primaryConceptId})`);
  check(answer.procedureId === mapping.primaryProcedureId, `${mapping.sectionId}: primary procedure mismatch (${answer.procedureId} !== ${mapping.primaryProcedureId})`);
  check(sameArray(answer.conceptIds, mapping.conceptIds), `${mapping.sectionId}: answer conceptIds mismatch`);
  check(sameArray(answer.procedureIds, mapping.procedureIds), `${mapping.sectionId}: answer procedureIds mismatch`);
  check(sameArray(answer.primaryIntentIds, mapping.primaryIntentIds), `${mapping.sectionId}: answer primaryIntentIds mismatch`);

  check(chunk.primaryConceptId === mapping.primaryConceptId, `${mapping.sectionId}: search primaryConceptId mismatch`);
  check(chunk.primaryProcedureId === mapping.primaryProcedureId, `${mapping.sectionId}: search primaryProcedureId mismatch`);
  check(sameArray(chunk.conceptIds, mapping.conceptIds), `${mapping.sectionId}: search conceptIds mismatch`);
  check(sameArray(chunk.procedureIds, mapping.procedureIds), `${mapping.sectionId}: search procedureIds mismatch`);
  check(sameArray(chunk.primaryIntentIds, mapping.primaryIntentIds), `${mapping.sectionId}: search primaryIntentIds mismatch`);
  check(sameArray(chunk.queryAliases, [mapping.question, ...mapping.queryVariants]), `${mapping.sectionId}: search query aliases mismatch`);

  if (mapping.kind === 'question') {
    const faqRecord = faq.find((record) => record.id === mapping.sectionId);
    const aiFaqRecord = aiFaq.find((record) => record.id === mapping.sectionId);
    check(Boolean(faqRecord), `${mapping.sectionId}: missing FAQ record`);
    check(Boolean(aiFaqRecord), `${mapping.sectionId}: missing AI FAQ record`);
    if (faqRecord) {
      check(sameArray(faqRecord.conceptIds, mapping.conceptIds), `${mapping.sectionId}: FAQ conceptIds mismatch`);
      check(sameArray(faqRecord.procedureIds, mapping.procedureIds), `${mapping.sectionId}: FAQ procedureIds mismatch`);
      check(sameArray(faqRecord.primaryIntentIds, mapping.primaryIntentIds), `${mapping.sectionId}: FAQ primaryIntentIds mismatch`);
    }
    if (aiFaqRecord) check(sameArray(aiFaqRecord.conceptIds, mapping.conceptIds), `${mapping.sectionId}: AI FAQ conceptIds mismatch`);
  }
}

const forbiddenPairs = [
  ['best-hair-loss-prp-doctor-kermanshah', /^(filler|botox|thread|submental)-/],
  ['best-thread-lift-doctor-kermanshah', /^(filler|botox|hair|submental)-/],
  ['best-skin-rejuvenation-doctor-kermanshah', /^(filler-lips|botox-lip|thread-face|submental)-/],
  ['best-submental-liposuction-doctor-kermanshah', /^(botox|hair|acne|subcision)-/],
];
for (const [sectionId, pattern] of forbiddenPairs) {
  const chunk = searchChunks.find((record) => record.id === sectionId);
  check(Boolean(chunk), `${sectionId}: missing for cross-service test`);
  if (chunk) check(!chunk.conceptIds.some((id) => pattern.test(id)), `${sectionId}: cross-service concept contamination detected`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  status: 'pass',
  authoredMappings: authoredAnswerMappings.length,
  questionMappings: authoredAnswerMappings.filter((item) => item.kind === 'question').length,
  artifactsChecked: ['answers JSONL', 'search JSONL', 'faq.json', 'ai/faq.json'],
  semanticPolicy: 'authored answer mappings are exact and cannot be inferred by keyword order',
}, null, 2));
