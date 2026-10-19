import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE, AUTHORED_BODY} from '../src/canonical/source.mjs';

const concept = 'https://doi.org/10.5281/zenodo.18765168';
const exact = 'https://doi.org/10.5281/zenodo.23473947';
const datasetIri = 'https://www.ghezelbaash.ir/graph.jsonld/dataset';

test('public discovery uses concept DOI and archive is a distinct versioned entity', () => {
  assert.match(AUTHORED_BODY, /href="https:\/\/doi.org\/10.5281\/zenodo.18765168"/);
  assert.ok(SOURCE.machineProjection.discoveryGuide.includes(concept));
  const nodes = new Map(SOURCE.graph['@graph'].map(node => [node['@id'], node]));
  assert.equal(nodes.get(exact)?.version, '1.3.4+zenodo.2');
  assert.equal(nodes.get(exact)?.['dcterms:isVersionOf']?.['@id'], concept);
  assert.equal(nodes.get(concept)?.['dcat:hasCurrentVersion']?.['@id'], exact);
  assert.ok(nodes.has(datasetIri));
  for (const id of [datasetIri, 'https://www.ghezelbaash.ir/#saeed-ghezelbash', 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah']) {
    assert.ok(!JSON.stringify(nodes.get(id)?.sameAs ?? []).includes('doi.org/10.5281/zenodo'));
  }
});
