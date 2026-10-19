import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {projectHomeGraph} from '../src/lib/home-projection.mjs';
test('homepage schema preserves authored values and closes identity without copying the corpus',()=>{
 const before=JSON.stringify(SOURCE.graph), projected=projectHomeGraph(SOURCE.graph,SOURCE.canonicalOrigin);
 assert.equal(JSON.stringify(SOURCE.graph),before);
 assert.ok(Buffer.byteLength(JSON.stringify(projected))<35_000);
 const truth=new Map(SOURCE.graph['@graph'].map(n=>[n['@id'],n]));
 const ids=new Set(projected['@graph'].map(n=>n['@id']));
 function subset(value,source){
  if(Array.isArray(value))for(const item of value)assert.ok(source.some(candidate=>{try{subset(item,candidate);return true;}catch{return false;}}));
  else if(value&&typeof value==='object'){
   for(const [key,entry] of Object.entries(value)){assert.ok(key in source);subset(entry,source[key]);}
   if(Object.keys(value).length===1&&value['@id']?.startsWith(SOURCE.canonicalOrigin+'/'))assert.ok(ids.has(value['@id']));
  }else assert.deepEqual(value,source);
 }
 for(const n of projected['@graph'])subset(n,truth.get(n['@id']));
 assert.ok(!projected['@graph'].some(n=>[n['@type']].flat().some(t=>['Question','Answer','NodeShape','Service'].includes(t))));
 const dataset=projected['@graph'].find(n=>n['@id']===SOURCE.canonicalOrigin+'/graph.jsonld/dataset');
 assert.ok(dataset && dataset.name && dataset.description);
 assert.ok([dataset['@type']].flat().includes('Dataset'));
 for(const suffix of ['concept','current-archive'])assert.ok(projected['@graph'].some(n=>n['@id']===SOURCE.canonicalOrigin+'/identifier-dataset-zenodo-'+suffix));
 assert.ok(projected['@graph'].some(n=>n.contentUrl===SOURCE.canonicalOrigin+'/entity-facts.csv'));
 assert.ok(SOURCE.graph['@graph'].some(n=>[n['@type']].flat().includes('Answer')));
});

