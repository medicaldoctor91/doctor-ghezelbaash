import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {SOURCE} from '../src/canonical/source.mjs';
import {buildProvenanceGraph} from '../src/lib/retrieval-output.mjs';

test('canonical dataset modification predicates describe the same recorded date', () => {
  const dataset=SOURCE.graph['@graph'].find(node=>node['@id']===SOURCE.canonicalOrigin+'/graph.jsonld/dataset');
  assert.deepEqual(dataset['dcterms:modified'],dataset.dateModified);
  assert.equal(dataset.dateModified['@value'],'2026-10-10');
});

test('release descriptions permit documented DOI maintenance and cite the dataset explicitly', () => {
  const descriptions=SOURCE.graph['@graph'].flatMap(node=>[node.description,node['dcterms:description']]).filter(value=>typeof value==='string');
  assert.ok(!descriptions.some(value=>value.includes('immutable DOI preservation')));
  const review=SOURCE.graph['@graph'].find(node=>node['@id'].endsWith('/source-review-professional-identity-2026-10-03'));
  assert.ok(review.citation.includes('https://doi.org/10.5281/zenodo.22838416'));
  assert.ok(!review.citation.includes('https://doi.org/10.5281/zenodo.18765168'));
});

test('generated clinical provenance publishes reviewed dates as RDF dates', () => {
  const graph=buildProvenanceGraph(SOURCE);
  const check=spawnSync(process.env.PYTHON??'python',['-c',`
import json,sys,rdflib
from rdflib.namespace import XSD
value=json.load(sys.stdin)
g=rdflib.Graph().parse(data=json.dumps(value),format='json-ld')
dates=list(g.objects(None,rdflib.URIRef('https://schema.org/lastReviewed')))
assert len(dates)==250,len(dates)
assert all(str(v)=='2026-10-04' and v.datatype==XSD.date for v in dates)
print('250 valid RDF dates')
`],{input:JSON.stringify(graph),encoding:'utf8',maxBuffer:16*1024*1024,timeout:30000});
  assert.equal(check.status,0,check.stderr);
  assert.equal(check.stdout.trim(),'250 valid RDF dates');
});
