import assert from 'node:assert/strict';
import jsonld from 'jsonld';
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

// Passage provenance must cover every shared record without changing authored lineage.
const authoredProvenance = SOURCE.graph['@graph'].filter(node => {
  const types = [node['@type']].flat();
  return node['@id'].includes('/provenance.jsonld/') || types.some(type => typeof type === 'string' && (type.startsWith('prov:') || type.startsWith('oa:'))) || types.includes('Claim');
});
const canonicalBefore = JSON.stringify(SOURCE.graph);
const provenance = machine.buildProvenanceGraph(SOURCE, records);
const provenanceById = new Map(provenance['@graph'].map(node => [node['@id'], node]));
const refs = ids => ids.map(id => ({ '@id': id }));
function assertPassageProvenance(graph, record, source) {
  const byId = new Map(graph['@graph'].map(node => [node['@id'], node]));
  const passage = byId.get(record.passageId);
  const generated = byId.get(record.passageId + '/retrieval-record');
  assert(passage, `Missing passage provenance for ${record.questionId}`);
  assert(generated, `Missing generated retrieval record for ${record.questionId}`);
  for (const node of [passage, generated]) {
    assert([node['@type']].flat().includes('prov:Entity'));
    assert.equal(node.questionId, record.questionId);
    assert.equal(node.answerId, record.answerId);
    assert.equal(node.sourceUrl, record.sourceUrl);
    assert.equal(node.htmlUrl, record.htmlUrl);
    assert.equal(node.version, record.release.version);
    assert.equal(node.releaseEdition, record.release.edition);
    assert([node.isPartOf].flat().some(ref => ref['@id'] === source.canonicalOrigin + '/graph.jsonld/dataset'));
    for (const field of ['sourceHashSha256', 'answerHashSha256', 'passageHashSha256']) assert.equal(node[field], record[field], `Shared ${field}`);
    assert.deepEqual(node.evidenceIds, record.evidenceIds);
    assert.deepEqual(node.claimEvidenceIds, record.claimEvidenceIds);
    assert.deepEqual(node.entityEvidenceIds, record.entityEvidenceIds);
    assert.deepEqual(node.about, refs(record.aboutIds), 'Topical and Claim references survive projection');
    assert.deepEqual(node.mentions, refs(record.graphNodeIds), 'Associated canonical graph identities remain linked');
    assert.equal(node.provenanceClass, record.provenanceClass);
    assert.deepEqual(node.reviewedBy, refs(record.reviewedBy));
    assert.equal(node.reviewedAt, record.reviewedAt);
  }
  assert.deepEqual(passage['prov:specializationOf'], { '@id': record.htmlUrl }, 'Passage resolves to exact source fragment');
  const sourceIds = [...new Set([record.questionId, record.answerId, ...record.evidenceIds])].sort();
  assert.deepEqual(passage['prov:wasDerivedFrom'], refs(sourceIds), 'Canonical Q&A and explicit evidence are the source lineage');
  assert.deepEqual(generated['prov:wasDerivedFrom'], refs([record.passageId, ...sourceIds].sort()), 'Retrieval derives from its passage and canonical source lineage');
  assert([generated.isPartOf].flat().some(ref => ref['@id'] === source.canonicalOrigin + '/fact-map.json'));
}
for (const record of records) assertPassageProvenance(provenance, record, SOURCE);
for (const node of authoredProvenance) assert.deepEqual(provenanceById.get(node['@id']), node, `Authored provenance preserved: ${node['@id']}`);
for (const type of ['Claim', 'oa:Annotation', 'prov:Collection']) assert(authoredProvenance.some(node => [node['@type']].flat().includes(type)), `Real authored ${type} is covered`);
assert.equal(provenance['@graph'].length, authoredProvenance.length + 2 * records.length);
assert.equal(provenanceById.size, provenance['@graph'].length, 'Generated and authored IDs remain unique');
assert.equal(JSON.stringify(SOURCE.graph), canonicalBefore, 'Projection never mutates canonical truth');
assert.deepEqual(machine.buildProvenanceGraph(SOURCE, records), provenance);
assert.deepEqual(machine.buildProvenanceGraph(SOURCE, [...records].reverse()), provenance, 'Generated record ordering is deterministic');
assert.deepEqual(machine.buildProvenanceGraph(SOURCE), provenance, 'One-argument provenance interface remains supported');
assert.equal(provenance['@context'], SOURCE.graph['@context'], 'Authored context is preserved');
const expanded = await jsonld.expand(provenance);
for (const record of records) {
  const passage = expanded.find(node => node['@id'] === record.passageId);
  const ontology = SOURCE.canonicalOrigin + '/ontology/';
  assert.deepEqual(passage[ontology + 'questionId'], refs([record.questionId]), 'Question identity is an RDF IRI');
  assert.deepEqual(passage[ontology + 'answerId'], refs([record.answerId]), 'Answer identity is an RDF IRI');
  assert.deepEqual(passage['https://schema.org/url'], refs([record.sourceUrl]), 'Source URL is an RDF IRI');
  assert.deepEqual(passage['https://schema.org/contentUrl'], refs([record.htmlUrl]), 'Exact HTML location is an RDF IRI');
  assert.deepEqual(passage[ontology + 'sourceHashSha256'], [{ '@value': record.sourceHashSha256 }], 'Source hash remains a literal');
  assert(!Object.hasOwn(passage, 'http://www.w3.org/ns/prov#generatedAtTime'), 'No build timestamp is invented');
}


const origin = 'https://example.com';
const ref = id => ({ '@id': origin + id });
const fixture = (questionOverrides = {}, answerOverrides = {}) => ({
  canonicalOrigin: origin, edition: '2026-10-01',
  routes: { resources: [{ path: '/', htmlId: 'home' }, { path: '/topic', htmlId: 'topic-content' }], htmlIdTargets: { 'topic-content': '/topic' } },
  graph: { '@context': { '@vocab': 'https://schema.org/', prov: 'http://www.w3.org/ns/prov#' }, '@graph': [
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

const richSource = fixture({ about: [ref('/claim'), ref('/entity')], citation: ref('/citation') }, { reviewedBy: ref('/answer-reviewer'), reviewedAt: '2026-09-28' });
const richRecords = buildRetrievalRecords(richSource);
assertPassageProvenance(machine.buildProvenanceGraph(richSource, richRecords), richRecords[0], richSource);
// Provided records are authoritative; provenance cannot independently derive source/hash/release values.
const supplied = { ...richRecords[0], sourceUrl: origin + '/topic?shared=1', htmlUrl: origin + '/topic?shared=1#shared', sourceHashSha256: 'a'.repeat(64), release: { version: 'shared-version', edition: 'shared-edition' } };
assertPassageProvenance(machine.buildProvenanceGraph(richSource, [supplied]), supplied, richSource);
for (const collisionId of [richRecords[0].passageId, richRecords[0].passageId + '/retrieval-record']) {
  const collisionSource = fixture();
  const authored = { '@id': collisionId, '@type': 'prov:Entity', name: 'Authored identity' };
  collisionSource.graph['@graph'].push(authored);
  const before = JSON.stringify(collisionSource);
  assert.throws(() => machine.buildProvenanceGraph(collisionSource, richRecords), /authored.*collision|collision.*authored/i, 'Authored IDs cannot be overwritten by generated records');
  assert.equal(JSON.stringify(collisionSource), before);
}

const inlineCollision = fixture();
inlineCollision.graph['@graph'][0].subjectOf = { '@id': richRecords[0].passageId, '@type': 'prov:Entity', name: 'Embedded authored identity' };
assert.throws(() => machine.buildProvenanceGraph(inlineCollision, richRecords), /authored.*collision/i, 'Embedded authored definitions cannot be overwritten');
assert.throws(() => machine.buildProvenanceGraph(richSource, [richRecords[0], richRecords[0]]), /duplicate generated/i, 'Duplicate records cannot silently duplicate entity IDs');
const richExpanded = await jsonld.expand(machine.buildProvenanceGraph(richSource, richRecords));
const richPassage = richExpanded.find(node => node['@id'] === richRecords[0].passageId);
assert.deepEqual(richPassage['https://schema.org/citation'], refs(richRecords[0].evidenceIds), 'Explicit evidence becomes RDF links');
assert.deepEqual(richPassage[origin + '/ontology/claimEvidence'], refs(richRecords[0].claimEvidenceIds));
assert.deepEqual(richPassage[origin + '/ontology/entityEvidence'], refs(richRecords[0].entityEvidenceIds));

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
  const provenanceBytes = await fs.readFile(path.join(distDir, 'provenance.jsonld'), 'utf8');
  assert.equal(provenanceBytes, JSON.stringify(provenance) + '\n', 'Materialized provenance projects the shared retrieval recordset');
  await materializeMachineResources({ source: SOURCE, authoredBody: AUTHORED_BODY, distDir });
  assert.equal(await fs.readFile(path.join(distDir, 'answers.txt'), 'utf8'), answers);
  assert.equal(await fs.readFile(path.join(distDir, 'fact-map.json'), 'utf8'), facts);
  assert.equal(await fs.readFile(path.join(distDir, 'provenance.jsonld'), 'utf8'), provenanceBytes, 'Provenance bytes repeat deterministically');
} finally {
  await fs.rm(distDir, { recursive: true, force: true });
}
console.log(JSON.stringify({ retrievalProvenance: 'PASS', records: records.length, fields: fields.length, authoredProvenance: authoredProvenance.length, generatedProvenance: 2 * records.length }, null, 2));
