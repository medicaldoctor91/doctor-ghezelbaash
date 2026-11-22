import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {attributePhysicianWorks} from '../src/lib/physician-work-provenance.mjs';
import {serializeCanonicalGraph} from '../src/lib/jsonld.mjs';

const site = 'https://www.ghezelbaash.ir/';
const doctor = site + '#saeed-ghezelbash';
const graph = SOURCE.graph;
const node = slug => graph['@graph'].find(item => item['@id'] === site + slug);

test('indexed papers preserve full PubMed bylines, physician rank, and evidenced CRediT roles', () => {
  const omega = node('article-omega-3-bipolar-i-2016');
  const mdd = node('article-mdd-attachment-dissociation-trauma-2021');
  assert.equal(omega.author.length, 8);
  assert.deepEqual(omega.author[7], {'@id': doctor});
  assert.equal(mdd.author.length, 13);
  assert.deepEqual(mdd.author[5], {'@id': doctor});
  for (const paper of [omega, mdd]) {
    assert.equal(paper.author.filter(author => author['@id'] === doctor).length, 1);
    assert.deepEqual(paper['prov:wasAttributedTo'], {'@id': doctor});
  }
  assert.ok(!omega['prov:wasGeneratedBy']);
  assert.ok(!omega.isBasedOn);
  assert.equal(mdd.isBasedOn['@type'], 'Thesis');
  assert.deepEqual(mdd.isBasedOn.author, {'@id': doctor});
  const association = mdd['prov:wasGeneratedBy']['prov:qualifiedAssociation'];
  assert.deepEqual(association['prov:agent'], {'@id': doctor});
  assert.deepEqual(association['prov:hadRole'].map(role => role['@id'].split('/').at(-2)), [
    'conceptualization', 'methodology', 'validation', 'investigation', 'resources', 'data-curation', 'writing-review-editing',
  ]);
});

test('clinical and media provenance follows positive authorship or creation evidence', () => {
  const {site: prefix, 'prov:wasAttributedTo': term} = graph['@context'];
  assert.equal(prefix, site);
  assert.equal(term['@type'], '@id');
  assert.equal(term['@id'], 'http://www.w3.org/ns/prov#wasAttributedTo');
  const answers = graph['@graph'].filter(item => item['@type'] === 'Answer');
  assert.equal(answers.length, 125);
  for (const answer of answers) {
    assert.deepEqual(answer.author, {'@id': doctor});
    assert.equal(answer['prov:wasAttributedTo'], 'site:#saeed-ghezelbash');
  }
  const article = node('evidence-iranmedlabs-interview');
  assert.ok(article.author['@id'] !== doctor);
  assert.ok(!article['prov:wasAttributedTo']);
  const copy = structuredClone(graph);
  attributePhysicianWorks(copy, copy['@graph'].find(item => item['@id'] === doctor));
  assert.deepEqual(copy, graph);
});

test('all directly authored or created resources carry physician provenance, without credit for coverage', () => {
  const values = x => x == null ? [] : Array.isArray(x) ? x : [x];
  const identifier = x => typeof x === 'string' ? x : x?.['@id'];
  const credits = item => ['author', 'creator'].some(key =>
    values(item[key]).some(agent => identifier(agent) === doctor));
  const attributed = item => values(item['prov:wasAttributedTo']).some(agent =>
    [doctor, 'site:#saeed-ghezelbash'].includes(identifier(agent)));
  const directlyCredited = graph['@graph'].filter(item => credits(item));
  assert.equal(directlyCredited.length, 427, 'Published author/creator inventory drift');
  for (const work of directlyCredited) {
    assert.ok(attributed(work), 'Missing direct author/creator provenance: ' + work['@id']);
  }
  for (const slug of [
    'historical-patient-origin-summary',
    'doctor-ghezelbaash-structured-data-project',
    'presentation-attachment-style-dissociative-depression-2017',
    'project-huggingface-dataset', 'project-kaggle-dataset',
    'graph.jsonld/download', 'external-identity-evidence-registry',
    'wikiversity-botulinum-toxin-aesthetic-medicine',
  ]) {
    assert.ok(credits(node(slug)), 'Positive author/creator evidence absent: ' + slug);
    assert.ok(attributed(node(slug)), 'Doctor attribution not closed: ' + slug);
  }
  // Publishing material about somebody does not make them its author.
  const website = node('website');
  assert.equal(website.publisher['@id'], doctor);
  assert.equal(website['prov:wasAttributedTo'], undefined);
  const interview = node('evidence-iranmedlabs-interview');
  assert.ok(!credits(interview));
  assert.ok(!attributed(interview));
});

test('canonical wire compaction changes only the spelling of XSD literal datatypes', () => {
  const wire = JSON.parse(serializeCanonicalGraph(graph));
  function restore(value) {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, '@value') && value['@type']?.startsWith('xsd:'))
      value['@type'] = wire['@context'].xsd + value['@type'].slice(4);
    for (const child of Object.values(value)) restore(child);
  }
  restore(wire['@graph']);
  assert.deepEqual(wire, graph);
});
