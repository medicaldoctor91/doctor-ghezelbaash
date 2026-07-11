import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { authoredAnswerMappings } from '../src/domain/answer-hub.mjs';

const root = join(process.cwd(), 'dist');

function readJsonlDirectory(directory, prefix) {
  return readdirSync(join(root, directory))
    .filter((name) => name.startsWith(prefix) && name.endsWith('.jsonl'))
    .sort()
    .flatMap((name) => readFileSync(join(root, directory, name), 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)));
}

const documents = readJsonlDirectory('search', 'chunks-');
const intents = readdirSync(join(root, 'intents'))
  .filter((name) => name.endsWith('.json') && !['index.json', 'reverse-index.json'].includes(name))
  .sort()
  .flatMap((name) => JSON.parse(readFileSync(join(root, 'intents', name), 'utf8')).intents ?? []);

const stopWords = new Set(['از','به','در','با','برای','و','یا','که','را','این','آن','یک','چه','چگونه','چطور','آیا','است','شود','می','کند','کرد','کنیم','باید','خود','های','ترین']);
const normalize = (value) => String(value ?? '')
  .toLocaleLowerCase('fa')
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[‌‏‪-‮]/g, ' ')
  .replace(/[َُِّْٰ]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const tokenize = (value) => normalize(value).split(' ').filter((token) => token.length > 1 && !stopWords.has(token));

const prepared = documents.map((doc) => {
  const title = (doc.headingPath ?? []).join(' ');
  const aliases = (doc.queryAliases ?? []).join(' ');
  const tokens = [...tokenize(title), ...tokenize(title), ...tokenize(title), ...tokenize(aliases), ...tokenize(aliases), ...tokenize(aliases), ...tokenize(aliases), ...tokenize(doc.text)];
  const frequencies = new Map();
  for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  return { ...doc, normalizedTitle: normalize(title), normalizedAliases: (doc.queryAliases ?? []).map(normalize), normalizedText: normalize(doc.text), tokens, frequencies };
});
const averageLength = prepared.reduce((sum, doc) => sum + doc.tokens.length, 0) / Math.max(1, prepared.length);
const documentFrequency = new Map();
for (const doc of prepared) for (const token of new Set(doc.tokens)) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);

function search(query, limit = 10) {
  const queryTokens = tokenize(query);
  const normalizedQuery = normalize(query);
  const scores = prepared.map((doc) => {
    let score = 0;
    for (const token of queryTokens) {
      const tf = doc.frequencies.get(token) ?? 0;
      if (!tf) continue;
      const df = documentFrequency.get(token) ?? 0;
      const idf = Math.log(1 + (prepared.length - df + 0.5) / (df + 0.5));
      const denominator = tf + 1.2 * (1 - 0.75 + 0.75 * doc.tokens.length / averageLength);
      score += idf * (tf * 2.2 / denominator);
    }
    if (doc.normalizedTitle === normalizedQuery) score += 100;
    else if (doc.normalizedAliases.includes(normalizedQuery)) score += 80;
    else if (doc.normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(doc.normalizedTitle)) score += 15;
    if (doc.normalizedText.includes(normalizedQuery)) score += 5;
    return { id: doc.id, score };
  });
  return scores.filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}

const authoredTests = authoredAnswerMappings
  .filter((item) => item.kind === 'question')
  .flatMap((mapping) => [
    { query: mapping.question, expected: mapping.sectionId, exact: true },
    ...mapping.queryVariants.map((query) => ({ query, expected: mapping.sectionId, exact: false })),
  ]);
let authoredTop1 = 0;
let authoredRecall3 = 0;
const authoredFailures = [];
for (const test of authoredTests) {
  const results = search(test.query, 3);
  const rank = results.findIndex((item) => item.id === test.expected) + 1;
  if (rank === 1) authoredTop1 += 1;
  if (rank > 0 && rank <= 3) authoredRecall3 += 1;
  if ((test.exact && rank !== 1) || (!test.exact && (rank < 1 || rank > 3))) {
    authoredFailures.push({ query: test.query, expected: test.expected, rank, top: results.map((item) => item.id) });
  }
}

const buckets = new Map();
for (const intent of intents) {
  if (!intent.queryText || !intent.conceptId) continue;
  const key = intent.parentProcedureId ?? intent.conceptId.split('-')[0] ?? 'general';
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(intent);
}
const balanced = [];
while (balanced.length < 200 && [...buckets.values()].some((items) => items.length)) {
  for (const items of buckets.values()) if (items.length && balanced.length < 200) balanced.push(items.shift());
}

let reciprocal = 0;
let recall3 = 0;
let evaluated = 0;
for (const intent of balanced) {
  const gold = new Set(prepared
    .filter((doc) => doc.id === intent.visibleSectionId || doc.conceptIds?.includes(intent.conceptId))
    .map((doc) => doc.id));
  if (!gold.size) continue;
  evaluated += 1;
  const results = search(intent.queryText, 10);
  const rank = results.findIndex((item) => gold.has(item.id)) + 1;
  if (rank > 0 && rank <= 3) recall3 += 1;
  if (rank > 0) reciprocal += 1 / rank;
}

const result = {
  lexicalCorpusDocuments: prepared.length,
  intentQueries: evaluated,
  recallAt3: evaluated ? recall3 / evaluated : 0,
  mrr: evaluated ? reciprocal / evaluated : 0,
  authoredQueries: authoredTests.length,
  authoredTop1: authoredTests.length ? authoredTop1 / authoredTests.length : 0,
  authoredRecallAt3: authoredTests.length ? authoredRecall3 / authoredTests.length : 0,
  authoredFailures,
  scoringPolicy: 'BM25-style lexical retrieval over visible heading, authored query aliases, and visible text; intent IDs and concept IDs are not scoring features',
};
const pass = result.intentQueries >= 200
  && result.recallAt3 >= 0.80
  && result.mrr >= 0.65
  && result.authoredRecallAt3 === 1
  && result.authoredFailures.length === 0;
console.log(JSON.stringify({ status: pass ? 'pass' : 'fail', ...result }, null, 2));
if (!pass) process.exit(1);
