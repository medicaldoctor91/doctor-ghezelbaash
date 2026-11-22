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
