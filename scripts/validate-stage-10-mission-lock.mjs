import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  homepageMissionLock,
  localServiceIntentAnswers,
  nationalAuthorityAnswers,
} from '../src/domain/homepage-mission-lock.mjs';

const root = process.cwd();
const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
const graph = JSON.parse(readFileSync(join(root, 'dist', 'knowledge-graph.jsonld'), 'utf8'));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const site = 'https://www.ghezelbaash.ir/';
const id = (fragment) => `${site}#${fragment}`;
const nodes = new Map((graph['@graph'] ?? []).filter((node) => node?.['@id']).map((node) => [node['@id'], node]));
const personId = id(homepageMissionLock.primaryEntity);
const clinicId = id(homepageMissionLock.supportingEntity);
const person = nodes.get(personId);
const clinic = nodes.get(clinicId);
const asArray = (value) => value === undefined ? [] : Array.isArray(value) ? value : [value];
const refIds = (value) => asArray(value).map((entry) => entry?.['@id']).filter(Boolean);

check(localServiceIntentAnswers.length === 17, `local answer count ${localServiceIntentAnswers.length}`);
check(nationalAuthorityAnswers.length === 3, `national answer count ${nationalAuthorityAnswers.length}`);
check(new Set(localServiceIntentAnswers.map((entry) => entry.id)).size === localServiceIntentAnswers.length, 'duplicate local intent IDs');
check(new Set(nationalAuthorityAnswers.map((entry) => entry.id)).size === nationalAuthorityAnswers.length, 'duplicate national intent IDs');
check(homepageMissionLock.requiredRelationships.every((value) => localServiceIntentAnswers.some((entry) => entry.relationship === value)), 'offered/evaluated/referral-context coverage is incomplete');
check(localServiceIntentAnswers.filter((entry) => entry.relationship === 'referral-context').length >= 5, 'surgical/referral coverage is too narrow');
check(localServiceIntentAnswers.filter((entry) => entry.relationship !== 'referral-context').length >= 10, 'non-surgical coverage is too narrow');

for (const entry of [...localServiceIntentAnswers, ...nationalAuthorityAnswers]) {
  const sectionPattern = new RegExp(`<section\\b[^>]*id="${entry.id}"[^>]*aria-labelledby="${entry.id}-title"[\\s\\S]*?<h3\\b[^>]*id="${entry.id}-title"[^>]*>[\\s\\S]*?<\\/h3>[\\s\\S]*?<\\/section>`, 'u');
  check(sectionPattern.test(html), `visible answer section missing: ${entry.id}`);
  check(html.includes(entry.question), `visible question mismatch: ${entry.id}`);
  check(html.includes(entry.answer), `visible answer mismatch: ${entry.id}`);
  check(html.includes(`href="${entry.href}"`), `destination link missing: ${entry.id}`);
  check(html.includes(`data-coverage-relationship="${entry.relationship}"`), `relationship marker missing: ${entry.id}`);

  const questionId = id(`question-${entry.id}`);
  const answerId = id(`answer-${entry.id}`);
  const question = nodes.get(questionId);
  const answer = nodes.get(answerId);
  check(question?.['@type'] === 'Question', `Question node missing: ${entry.id}`);
  check(answer?.['@type'] === 'Answer', `Answer node missing: ${entry.id}`);
  check(question?.name === entry.question && question?.text === entry.question, `Question parity failed: ${entry.id}`);
  check(answer?.text === entry.answer, `Answer parity failed: ${entry.id}`);
  check(question?.url === id(entry.id) && answer?.url === id(entry.id), `Question/Answer URL mismatch: ${entry.id}`);
  check(question?.acceptedAnswer?.['@id'] === answerId, `acceptedAnswer mismatch: ${entry.id}`);
  check(question?.about?.['@id'] === personId && question?.mentions?.['@id'] === clinicId, `entity relation mismatch: ${entry.id}`);
  check(answer?.author?.['@id'] === personId && answer?.mentions?.['@id'] === clinicId, `Answer author/support entity mismatch: ${entry.id}`);
}

for (const [fragment, entries] of [
  [homepageMissionLock.localAnswerListId, localServiceIntentAnswers],
  [homepageMissionLock.nationalAnswerListId, nationalAuthorityAnswers],
]) {
  const list = nodes.get(id(fragment));
  check(list?.['@type'] === 'ItemList', `ItemList missing: ${fragment}`);
  check(list?.numberOfItems === entries.length, `ItemList count mismatch: ${fragment}`);
  check((list?.itemListElement ?? []).length === entries.length, `ItemList elements mismatch: ${fragment}`);
  check(html.includes(`id="${fragment}"`), `visible ItemList container missing: ${fragment}`);
}

check(person?.['@type'] === 'Person', 'canonical Person missing');
check(!person?.aggregateRating, 'Clinic aggregateRating leaked onto Person');
check(refIds(person?.knowsAbout).length >= 15, `Person.knowsAbout is too narrow: ${refIds(person?.knowsAbout).length}`);
check(person?.worksFor?.['@id'] === clinicId && person?.workLocation?.['@id'] === clinicId, 'Person to Clinic relation mismatch');
check(asArray(clinic?.['@type']).includes('MedicalClinic') && asArray(clinic?.['@type']).includes('LocalBusiness'), 'Clinic types incomplete');
check(clinic?.employee?.['@id'] === personId, 'Clinic.employee mismatch');
check(clinic?.aggregateRating?.ratingValue === 5 && clinic?.aggregateRating?.ratingCount === 163, 'Clinic rating contract mismatch');
check(nodes.get(id('webpage'))?.mainEntity?.['@id'] === personId, 'Person is not the sole WebPage mainEntity');

const localQuestionPhraseCount = (html.match(/بهترین دکتر/gu) ?? []).length;
check(localQuestionPhraseCount < 40, `best-doctor phrase repetition is excessive: ${localQuestionPhraseCount}`);
const nationalText = nationalAuthorityAnswers.map((entry) => `${entry.question} ${entry.answer}`).join(' ');
check(nationalText.includes('ایران'), 'national authority passages do not name Iran');
check(!/(تهران|سنندج|همدان|ایلام|شیراز|اصفهان)،\s*(تهران|سنندج|همدان|ایلام|شیراز|اصفهان)/u.test(nationalText), 'national passages contain city-list stuffing');

if (failures.length) {
  console.error(JSON.stringify({ stage: 10, status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  stage: 10,
  status: 'pass',
  primaryEntity: personId,
  supportingEntity: clinicId,
  localServiceIntentPassages: localServiceIntentAnswers.length,
  nationalAuthorityPassages: nationalAuthorityAnswers.length,
  referralContextPassages: localServiceIntentAnswers.filter((entry) => entry.relationship === 'referral-context').length,
  nonSurgicalPassages: localServiceIntentAnswers.filter((entry) => entry.relationship !== 'referral-context').length,
  questionNodes: localServiceIntentAnswers.length + nationalAuthorityAnswers.length,
  answerNodes: localServiceIntentAnswers.length + nationalAuthorityAnswers.length,
  personKnowsAbout: refIds(person?.knowsAbout).length,
  clinicRatingValue: clinic.aggregateRating.ratingValue,
  clinicRatingCount: clinic.aggregateRating.ratingCount,
  keywordStuffingGuard: 'pass',
}, null, 2));
