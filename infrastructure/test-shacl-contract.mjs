import assert from 'node:assert/strict';
import {DataFactory, Parser, Store} from 'n3';
import {SOURCE} from '../src/canonical/source.mjs';
import {serializeGraphAsNTriples} from '../src/lib/machine-output.mjs';

const {namedNode, literal, quad} = DataFactory;
const sh = term => namedNode('http://www.w3.org/ns/shacl#' + term);
const schema = term => namedNode('https://schema.org/' + term);
const home = namedNode(SOURCE.canonicalOrigin + '/webpage');
const graph = new Store(new Parser().parse(serializeGraphAsNTriples(SOURCE.graph)));
const shapes = new Store(new Parser().parse(SOURCE.validation.shaclSupplement));

// Evaluate the SHACL Core cardinality constraints actually published for the
// Home target. This deliberately is not presented as a complete SHACL engine;
// independent release audits also validate the complete published data union.
function cardinalityViolations(dataset, shapeStore, focus) {
  const violations = [];
  for (const target of shapeStore.getQuads(null, sh('targetNode'), focus, null)) {
    for (const property of shapeStore.getQuads(target.subject, sh('property'), null, null)) {
      const paths = shapeStore.getObjects(property.object, sh('path'), null);
      assert.equal(paths.length, 1, 'A direct Home property shape has one RDF path');
      assert.equal(paths[0].termType, 'NamedNode', 'This cardinality check covers direct RDF paths');
      const count = dataset.countQuads(focus, paths[0], null, null);
      for (const key of ['minCount', 'maxCount']) {
        for (const limit of shapeStore.getObjects(property.object, sh(key), null)) {
          const expected = Number(limit.value);
          if (key === 'minCount' ? count < expected : count > expected)
            violations.push({path: paths[0].value, constraint: key, expected, count});
        }
      }
    }
  }
  return violations;
}

assert(shapes.countQuads(null, sh('targetNode'), home, null) > 0,
  'The machine contract actually constrains the canonical Home resource');
const dates=graph.getObjects(home,schema('dateModified'),null);
assert.equal(dates.length,1,'The finalized Home has one documented modification date');
assert.equal(dates[0].value,'2026-10-10','Home records its actual final content and structured-data modification');
assert.equal(dates[0].datatype.value,'http://www.w3.org/2001/XMLSchema#date');
assert.deepEqual(cardinalityViolations(graph, shapes, home), [],
  'Published Home cardinality rules must accept the real canonical RDF without inventing dates');

const homeShape = shapes.getSubjects(sh('targetNode'), home, null)[0];
const dateShape = shapes.getObjects(homeShape, sh('property'), null).find(property =>
  shapes.countQuads(property, sh('path'), schema('dateModified'), null));
assert(dateShape, 'The optional modification-date cardinality contract is retained');
assert.equal(shapes.getObjects(dateShape, sh('maxCount'), null)[0]?.value, '1',
  'A supported Home modification date remains single-valued');

const staleShapes = new Store(shapes.getQuads(null, null, null, null));
staleShapes.addQuad(quad(dateShape, sh('minCount'), literal('1', namedNode('http://www.w3.org/2001/XMLSchema#integer'))));
const undated=new Store(graph.getQuads(null,null,null,null));
undated.removeQuads(undated.getQuads(home,schema('dateModified'),null,null));
assert.deepEqual(cardinalityViolations(undated,shapes,home),[],
  'The published optional date contract never forces an unsupported date');
assert(cardinalityViolations(undated, staleShapes, home).some(violation =>
  violation.path === schema('dateModified').value && violation.constraint === 'minCount'),
  'A stale required-date contract is detected against the real published RDF');

const fixture = new Store(undated.getQuads(null, null, null, null));
fixture.addQuad(home, schema('dateModified'), literal('2000-01-01', namedNode('http://www.w3.org/2001/XMLSchema#date')));
assert.deepEqual(cardinalityViolations(fixture, shapes, home), [],
  'A supported single modification date is accepted (test fixture only)');
fixture.addQuad(home, schema('dateModified'), literal('2000-01-02', namedNode('http://www.w3.org/2001/XMLSchema#date')));
assert(cardinalityViolations(fixture, shapes, home).some(violation =>
  violation.path === schema('dateModified').value && violation.constraint === 'maxCount'),
  'Multiple modification dates still fail the semantic cardinality contract');

console.log('Published SHACL Home cardinality agrees with its documented date; optional omission and duplicate-date regression PASS');
