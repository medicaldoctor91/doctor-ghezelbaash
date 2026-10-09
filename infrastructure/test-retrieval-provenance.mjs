import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SOURCE, AUTHORED_BODY } from '../src/canonical/source.mjs';
import * as machine from '../src/lib/machine-output.mjs';
import { materializeMachineResources } from './materialize-machine-resources.mjs';

// RED must be an assertion about the missing interface, not a module-loader error.
const retrieval = await import('../src/lib/retrieval-output.mjs').catch(error => {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  return {};
});
assert.equal(typeof retrieval.buildRetrievalRecords, 'function', 'Shared rich retrieval record builder is required');
const { buildRetrievalRecords, serializeAnswersText, buildFactMap } = retrieval;
const fields = ['questionId', 'answerId', 'question', 'answer', 'language', 'sourceUrl', 'htmlId', 'htmlUrl', 'passageId', 'aboutIds', 'graphNodeIds', 'evidenceIds', 'claimEvidenceIds', 'entityEvidenceIds', 'provenanceClass', 'reviewedBy', 'reviewedAt', 'release', 'sourceHashSha256', 'answerHashSha256', 'passageHashSha256'];
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
const records = buildRetrievalRecords(SOURCE);
const questions = SOURCE.graph['@graph'].filter(node => [node['@type']].flat().includes('Question') && node.acceptedAnswer);
assert.equal(records.length, questions.length, 'Every canonical accepted answer is retrievable');
assert.equal(new Set(records.map(record => record.passageId)).size, records.length);
assert.deepEqual(buildRetrievalRecords(SOURCE), records, 'Record construction is deterministic');
for (const record of records) {
  assert.deepEqual(Object.keys(record), fields, 'Complete metadata in stable field order');
  const question = questions.find(node => node['@id'] === record.questionId);
  const exact = new URL(question.url);
  assert.equal(record.sourceUrl, exact.origin + exact.pathname + exact.search, 'Exact Question route wins over generic WebPage');
  assert.notEqual(record.sourceUrl, SOURCE.canonicalOrigin + '/webpage');
  assert.equal(record.htmlUrl, record.htmlId ? `${record.sourceUrl}#${record.htmlId}` : record.sourceUrl);
  if (exact.hash) assert.equal(record.htmlUrl, question.url, 'Authored fragment is preserved');
  else assert.equal(record.htmlId, SOURCE.routes.resources.find(route => route.path === exact.pathname)?.htmlId ?? '', 'Anchor comes from canonical route ownership');
  assert.match(record.passageId, /^https:\/\/.*\/provenance\.jsonld\/passage-/);
  for (const field of ['sourceHashSha256', 'answerHashSha256', 'passageHashSha256']) assert.match(record[field], /^[a-f0-9]{64}$/);
  assert.equal(record.answerHashSha256, hash(record.answer));
  assert.equal(record.release.edition, SOURCE.edition);
  assert.equal(record.release.version, SOURCE.graph['@graph'].find(node => node['@id'] === SOURCE.canonicalOrigin + '/graph.jsonld/dataset').version);
  assert(record.language);
  assert(record.graphNodeIds.includes(record.questionId) && record.graphNodeIds.includes(record.answerId));
  assert.equal(record.provenanceClass, 'first-party-canonical');
  // Canonical Q&A do not author evidence relationships; broad Person evidence is not answer evidence.
  assert.deepEqual(record.evidenceIds, []);
}

const origin = 'https://example.com';
const ref = id => ({ '@id': origin + id });
const fixture = (questionOverrides = {}, answerOverrides = {}) => ({
  canonicalOrigin: origin, edition: '2026-10-01',
  routes: { resources: [{ path: '/', htmlId: 'home' }, { path: '/topic', htmlId: 'topic-content' }], htmlIdTargets: { 'topic-content': '/topic' } },
  graph: { '@graph': [
    { '@id': origin + '/q', '@type': 'Question', name: 'Question', inLanguage: 'en', acceptedAnswer: ref('/a'), mainEntityOfPage: ref('/webpage'), url: origin + '/topic#exact', ...questionOverrides },
    { '@id': origin + '/a', '@type': 'Answer', text: 'Answer', url: origin + '/topic#answer-target', ...answerOverrides },
    { '@id': origin + '/webpage', '@type': 'WebPage', url: origin + '/', reviewedBy: ref('/reviewer'), lastReviewed: { '@value': '2026-09-30' } },
    { '@id': origin + '/topic#webpage', '@type': 'WebPage', url: origin + '/topic', reviewedBy: ref('/topic-reviewer'), lastReviewed: { '@value': '2026-09-29' } },
    { '@id': origin + '/claim', '@type': 'Claim', claimEvidence: ref('/claim-source') },
    { '@id': origin + '/entity', '@type': 'Thing', entityEvidence: ref('/entity-source') },
  ] },
});
const first = source => buildRetrievalRecords(source)[0];
assert.equal(first(fixture()).htmlUrl, origin + '/topic#exact', 'Question exact URL precedes Answer URL and mainEntityOfPage');
assert.equal(first(fixture({ url: undefined })).htmlUrl, origin + '/topic#answer-target', 'Explicit route-owned Answer URL is next');
assert.equal(first(fixture({ url: origin + '/not-a-route' })).htmlUrl, origin + '/topic#answer-target', 'Unknown canonical-looking URLs are not route-owned');
assert.equal(first(fixture({ url: 'https://external.example/topic' })).htmlUrl, origin + '/topic#answer-target', 'External URL cannot override route ownership');
assert.equal(first(fixture({ url: undefined, mainEntityOfPage: ref('/topic#webpage') }, { url: undefined })).htmlUrl, origin + '/topic#topic-content', 'Page references resolve through route descriptor URL');
assert.equal(first(fixture({ url: undefined }, { url: undefined })).htmlUrl, origin + '/#home', 'Generic Home relationship is only the last fallback');
const unresolvedPage = fixture({ url: undefined, mainEntityOfPage: ref('/topic#webpage') }, { url: undefined });
unresolvedPage.graph['@graph'] = unresolvedPage.graph['@graph'].filter(node => node['@id'] !== origin + '/topic#webpage');
assert.equal(first(unresolvedPage).htmlUrl, origin + '/topic#topic-content', 'Semantic page identity fragments are not invented HTML anchors');
const noTarget = fixture({ url: origin + '/topic' });
noTarget.routes.resources[1] = { path: '/topic' };
noTarget.routes.htmlIdTargets = {};
assert.equal(first(noTarget).htmlId, '', 'No anchor is invented without canonical content target');
assert.equal(first(noTarget).htmlUrl, origin + '/topic');
const rich = first(fixture({ about: [ref('/claim'), ref('/entity')], citation: ref('/citation') }, { reviewedBy: ref('/answer-reviewer'), reviewedAt: '2026-09-28' }));
assert.deepEqual(rich.claimEvidenceIds, [origin + '/claim-source']);
assert.deepEqual(rich.entityEvidenceIds, [origin + '/entity-source']);
assert.deepEqual(rich.evidenceIds, [origin + '/citation', origin + '/claim-source', origin + '/entity-source']);
assert.deepEqual(rich.reviewedBy, [origin + '/answer-reviewer']);
assert.equal(rich.reviewedAt, '2026-09-28');
assert.deepEqual(first(fixture()).reviewedBy, [origin + '/topic-reviewer'], 'Review metadata follows resolved source page');
assert.equal(first(fixture()).reviewedAt, '2026-09-29');
const unreviewed = fixture();
unreviewed.graph['@graph'] = unreviewed.graph['@graph'].filter(node => ![origin + '/webpage', origin + '/topic#webpage'].includes(node['@id']));
assert.deepEqual(first(unreviewed).reviewedBy, []);
assert.equal(first(unreviewed).reviewedAt, '', 'Missing review is not invented');
const normalized = first(fixture({ name: '  Que\r\nstion  ' }, { text: ' cafe\u0301\r\nanswer ' }));
assert.equal(normalized.question, 'Que\nstion');
assert.equal(normalized.answer, 'café\nanswer');
assert.equal(normalized.answerHashSha256, hash('café\nanswer'));
const changed = first(fixture({}, { text: 'Changed answer' }));
assert.notEqual(changed.sourceHashSha256, first(fixture()).sourceHashSha256);
assert.notEqual(changed.answerHashSha256, first(fixture()).answerHashSha256);
assert.notEqual(changed.passageHashSha256, first(fixture()).passageHashSha256);
assert.equal(changed.passageId, first(fixture()).passageId, 'Passage identity survives content revisions');
const reordered = fixture();
reordered.graph['@graph'] = reordered.graph['@graph'].reverse().map(node => Object.fromEntries(Object.entries(node).reverse()));
assert.deepEqual(buildRetrievalRecords(reordered), buildRetrievalRecords(fixture()), 'Graph and property order do not affect records or hashes');

const factMap = buildFactMap(SOURCE, records);
assert.deepEqual(factMap.records, records, 'Fact map projects the exact shared record model');
assert.equal(factMap.canonicalOrigin, SOURCE.canonicalOrigin);
assert.equal(factMap.sourceOfTruth, SOURCE.canonicalOrigin + '/graph.jsonld');
assert.deepEqual(factMap.release, records[0].release);
assert.equal(machine.buildAnswersText(SOURCE), serializeAnswersText(records), 'Legacy wrapper uses shared records');
assert.deepEqual(machine.buildFactMap(SOURCE), factMap, 'Legacy fact-map interface remains supported');
const text = serializeAnswersText(records);
const labels = ['Question ID', 'Answer ID', 'Question', 'Answer', 'Language', 'Source', 'HTML ID', 'HTML URL', 'Passage ID', 'About IDs', 'Graph Node IDs', 'Evidence IDs', 'Claim Evidence IDs', 'Entity Evidence IDs', 'Provenance Class', 'Reviewed By', 'Reviewed At', 'Release', 'Source Hash SHA-256', 'Answer Hash SHA-256', 'Passage Hash SHA-256'];
for (const [index, block] of text.trimEnd().split('\n\n---\n\n').entries()) {
  const lines = block.split('\n');
  assert.equal(lines.length, fields.length);
  fields.forEach((field, fieldIndex) => {
    // Values use JSON escaping so multiline content cannot masquerade as metadata.
    assert.equal(lines[fieldIndex], `${labels[fieldIndex]}: ${JSON.stringify(records[index][field])}`, `Text and JSON agree on ${field}`);
  });
}
const distDir = await fs.mkdtemp(path.join(os.tmpdir(), 'retrieval-provenance-'));
try {
  await materializeMachineResources({ source: SOURCE, authoredBody: AUTHORED_BODY, distDir });
  const answers = await fs.readFile(path.join(distDir, 'answers.txt'), 'utf8');
  const facts = await fs.readFile(path.join(distDir, 'fact-map.json'), 'utf8');
  assert.equal(answers, text);
  assert.equal(facts, JSON.stringify(factMap) + '\n');
  await materializeMachineResources({ source: SOURCE, authoredBody: AUTHORED_BODY, distDir });
  assert.equal(await fs.readFile(path.join(distDir, 'answers.txt'), 'utf8'), answers);
  assert.equal(await fs.readFile(path.join(distDir, 'fact-map.json'), 'utf8'), facts);
} finally {
  await fs.rm(distDir, { recursive: true, force: true });
}
console.log(JSON.stringify({ retrievalProvenance: 'PASS', records: records.length, fields: fields.length }, null, 2));
