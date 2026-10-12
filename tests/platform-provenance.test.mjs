import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {SOURCE} from '../src/canonical/source.mjs';
import {buildProvenanceGraph} from '../src/lib/retrieval-output.mjs';

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
