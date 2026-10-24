import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFragment} from 'parse5';
import {SOURCE} from '../src/canonical/source.mjs';
import {appendHomeDatasetDiscovery,renderCompactMachineDiscoveryLinks} from '../src/lib/home-graph-discovery.mjs';
import {projectBoundedSearchDocument,projectHomeSearchGraph,assertBoundedSearchDocument} from '../src/lib/search-contract.mjs';

test('homepage exposes the complete graph as an authored Dataset download without changing its existing Search identities',()=>{
  const graph=structuredClone(SOURCE.graph),origin=SOURCE.canonicalOrigin;
  const before=projectBoundedSearchDocument(graph,{graph,primaryPageId:origin+'/webpage'});
  const result=projectHomeSearchGraph(graph,origin);
  assert.equal(result['@context'],'https://schema.org');
  assert.deepEqual(result['@graph'].slice(0,-1),before['@graph'],'the proven profile, clinical and licensed-image identities remain exact');
  const dataset=result['@graph'].at(-1),authored=graph['@graph'].find(node=>node['@id']===dataset['@id']);
  assert.equal(dataset['@id'],origin+'/graph.jsonld/dataset');
  assert.equal(dataset['@type'],'Dataset');
  assert.equal(dataset.name,authored.name);
  assert.ok(authored.description.startsWith(dataset.description));
  assert.ok(dataset.description.length>=50&&dataset.description.length<=5000);
  assert.match(dataset.description,/supporting clinic\.$/);
  assert.deepEqual(dataset.creator,authored.creator);
  assert.equal(dataset.license,authored.license);
  assert.deepEqual(dataset.distribution,{'@type':'DataDownload',contentUrl:origin+'/graph.jsonld',encodingFormat:'application/ld+json'});
  assert.equal(dataset.about,undefined,'the graph is downloaded rather than recursively reframed through its homepage inventory');
  assert.ok(Buffer.byteLength(JSON.stringify(result))<38000);
  assert.ok(assertBoundedSearchDocument(result).expandedObjects<4096);
  assert.equal(graph['@graph'].length,1600);
  assert.deepEqual(graph,SOURCE.graph,'every full-graph entity and authored literal remains unchanged');
});

test('a missing or unsuitable canonical discovery claim cannot be replaced with invented metadata',()=>{
  const origin=SOURCE.canonicalOrigin;
  for(const alter of [
    graph=>delete graph['@graph'].find(node=>node['@id']===origin+'/graph.jsonld/dataset').name,
    graph=>graph['@graph'].find(node=>node['@id']===origin+'/graph.jsonld/dataset').description='Too short.',
    graph=>graph['@graph'].find(node=>node['@id']===origin+'/graph.jsonld/download').contentUrl='https://other.test/graph',
  ]) {
    const graph=structuredClone(SOURCE.graph);alter(graph);
    const document=projectBoundedSearchDocument(graph,{graph,primaryPageId:origin+'/webpage'});
    assert.throws(()=>appendHomeDatasetDiscovery(document,graph,origin),/requires|must link/);
  }
});

test('compact head links preserve every discoverable resource URL, relation and media type',()=>{
  const before=structuredClone(SOURCE.machineResources);
  const expected=SOURCE.machineResources.filter(resource=>resource.discoverable);
  const links=parseFragment(renderCompactMachineDiscoveryLinks(SOURCE.machineResources)).childNodes;
  assert.equal(links.length,expected.length);
  for(let i=0;i<links.length;i++) {
    const attrs=Object.fromEntries(links[i].attrs.map(attribute=>[attribute.name,attribute.value]));
    assert.equal(links[i].tagName,'link');
    assert.equal(new URL(attrs.href,SOURCE.canonicalOrigin+'/').href,SOURCE.canonicalOrigin+expected[i].path);
    assert.equal(attrs.rel,expected[i].rel);
    assert.equal(attrs.type,expected[i].mediaType);
    assert.equal(attrs.title,undefined,'a non-rendered title hint is not repeated in the crawler prefix');
  }
  assert.ok(expected.some(resource=>resource.profiles.length),'the canonical profile declarations still exist');
  assert.deepEqual(SOURCE.machineResources,before,'full descriptions, MIME parameters and profiles remain in the registry');
});

test('compact discovery rejects network-relative and non-HTTP resource paths',()=>{
  for(const path of ['//other.test/graph','javascript:alert(1)'])
    assert.throws(()=>renderCompactMachineDiscoveryLinks([{discoverable:true,path,rel:'describedby',mediaType:'application/ld+json'}]),/Invalid compact/);
});
