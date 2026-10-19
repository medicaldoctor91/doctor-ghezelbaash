import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {projectHomeGraph} from '../src/lib/home-projection.mjs';
import {serializeInlineJsonLd} from '../src/lib/jsonld.mjs';

test('homepage inline schema preserves every canonical entity, predicate and value', () => {
  const before = structuredClone(SOURCE.graph);
  const home = projectHomeGraph(SOURCE.graph, SOURCE.canonicalOrigin);
  assert.deepEqual(home, before);
  assert.deepEqual(JSON.parse(serializeInlineJsonLd(home)), before);
  assert.deepEqual(SOURCE.graph, before);
  assert.notStrictEqual(home, SOURCE.graph);
  const types = new Set(home['@graph'].flatMap(node => [node['@type']].flat()));
  for (const type of ['Question', 'Answer', 'Service', 'MedicalProcedure', 'Dataset']) {
    assert.ok(types.has(type), 'Missing authored homepage entity type: ' + type);
  }
});
