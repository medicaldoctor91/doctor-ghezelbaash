import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {deriveRoutingRows, renderRedirects} from '../src/lib/delivery-output.mjs';
import {generateHeaders} from '../build/lib/headers.mjs';

test('the published data catalog IRI has a native Pages graph representation', () => {
  const catalogId=SOURCE.canonicalOrigin+'/data-catalog';
  assert.ok(SOURCE.graph['@graph'].some(node=>node['@id']===catalogId));

  const rows=deriveRoutingRows(SOURCE,SOURCE.graph);
  const rule=rows.find(row=>row.source==='/data-catalog');
  assert.deepEqual(rule,{source:'/data-catalog',target:'/graph.jsonld',statusCode:200});
  assert.ok(renderRedirects(rows).split('\n').includes('/data-catalog /graph.jsonld 200'));
});

test('the data catalog graph alias carries the machine representation headers', () => {
  const headers=generateHeaders({
    origin:SOURCE.canonicalOrigin,
    routes:SOURCE.routes.resources.map(resource=>resource.path),
    cssPath:'/assets/canonical.css',
    delivery:SOURCE.delivery,
    machineResources:SOURCE.machineResources,
  });
  const block=headers.trim().split(/\n\s*\n/).find(value=>value.split('\n')[0]==='/data-catalog');
  assert.ok(block,'The catalog alias must have its own machine-resource header policy');
  assert.match(block,/^  Content-Type: application\/ld\+json(?:;[^\n]+)?$/m);
  assert.match(block,/^  X-Robots-Tag: noindex, follow$/m);
  assert.match(block,/^  Link: <\/graph\.jsonld>; rel=describedby; type="application\/ld\+json"$/m);
});


test('active migraine therapy and service IRIs resolve to the graph representation', () => {
  const rows=deriveRoutingRows(SOURCE,SOURCE.graph);
  for(const path of ['/procedure-botulinum-toxin-chronic-migraine','/service-botulinum-toxin-chronic-migraine']) {
    assert.ok(SOURCE.graph['@graph'].some(n=>n['@id']===SOURCE.canonicalOrigin+path));
    assert.deepEqual(rows.find(row=>row.source===path),{source:path,target:'/graph.jsonld',statusCode:200});
  }
});
