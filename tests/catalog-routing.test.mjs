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

test('catalog, current Dataset release and version-series membership describe one edition', () => {
  const nodes=new Map(SOURCE.graph['@graph'].map(node=>[node['@id'],node]));
  const dataset=nodes.get(SOURCE.canonicalOrigin+'/graph.jsonld/dataset');
  const current=nodes.get(dataset['dcat:hasCurrentVersion']['@id']);
  assert.ok(current,'The current Dataset edition must be a real graph node');
  assert.equal(dataset.version,dataset['dcat:version']);
  assert.equal(current.version,dataset.version);
  assert.equal(current['dcat:version'],dataset.version);
  assert.deepEqual(current['datePublished'],current['dcterms:issued']);
  const series=nodes.get(current['dcat:inSeries']['@id']);
  assert.equal(series['dcat:last']['@id'],current['@id']);
  for(const [owner,key] of [[dataset,'dcat:hasVersion'],[dataset,'dcterms:hasVersion'],
    [series,'dcat:seriesMember'],[series,'prov:hadMember']]) {
    assert.equal(owner[key].filter(value=>value['@id']===current['@id']).length,1);
  }
  const previous=current['dcat:previousVersion']['@id'];
  assert.ok(nodes.has(previous));
  assert.notEqual(previous,current['@id']);
  for(const key of ['dcat:prev','prov:wasRevisionOf','owl:priorVersion']) {
    assert.equal(current[key]['@id'],previous);
  }
  for(const path of ['/data-catalog','/doctor-ghezelbaash-structured-data-project',
    '/project-github-source','/project-huggingface-dataset']) {
    assert.equal(nodes.get(SOURCE.canonicalOrigin+path).version,dataset.version);
  }
});
