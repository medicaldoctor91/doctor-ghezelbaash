import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE, AUTHORED_BODY} from '../src/canonical/source.mjs';

const concept = 'https://doi.org/10.5281/zenodo.18765168';
const exact = 'https://doi.org/10.5281/zenodo.23474664';
const datasetIri = 'https://www.ghezelbaash.ir/graph.jsonld/dataset';

test('public discovery uses concept DOI and archive is a distinct versioned entity', () => {
  assert.match(AUTHORED_BODY, /href="https:\/\/doi.org\/10.5281\/zenodo.18765168"/);
  assert.ok(SOURCE.machineProjection.discoveryGuide.includes(concept));
  const nodes = new Map(SOURCE.graph['@graph'].map(node => [node['@id'], node]));
  assert.equal(nodes.get(exact)?.version, '1.3.4+zenodo.3');
  assert.equal(nodes.get(exact)?.['dcterms:isVersionOf']?.['@id'], concept);
  assert.equal(nodes.get(concept)?.['dcterms:hasVersion']?.['@id'], exact);
  assert.equal(nodes.get(concept)?.['dcat:hasCurrentVersion'], undefined);
  assert.doesNotMatch(JSON.stringify(nodes.get(exact)), /latest verified/i);
  assert.ok(nodes.has(datasetIri));
  for (const id of [datasetIri, 'https://www.ghezelbaash.ir/#saeed-ghezelbash', 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah']) {
    assert.ok(!JSON.stringify(nodes.get(id)?.sameAs ?? []).includes('doi.org/10.5281/zenodo'));
  }
});

test('every immutable record binding agrees with the reserved DOI', () => {
  const p = SOURCE.doiPolicy;
  const record = p.currentArchive.recordId;
  assert.equal(record, 23474664);
  assert.equal(p.downloadBindings.recordId, record);
  assert.equal(p.currentArchive.doi, `10.5281/zenodo.${record}`);
  assert.equal(p.currentArchive.url, `https://doi.org/${p.currentArchive.doi}`);
  assert.equal(p.downloadBindings.publicPrefix, `https://zenodo.org/records/${record}/files/`);
  assert.equal(p.downloadBindings.apiPrefix, `https://zenodo.org/api/records/${record}/files/`);
  assert.ok(p.downloadBindings.bundle.startsWith(p.downloadBindings.publicPrefix));
  assert.ok(p.downloadBindings.bundle.endsWith('zenodo.3.zip'));
});
