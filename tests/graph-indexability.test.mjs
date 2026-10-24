import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {SOURCE} from '../src/canonical/source.mjs';
import {generateHeaders,sealHeaders} from '../build/lib/headers.mjs';
import {createMediaRangeWorker} from '../build/lib/media-range-worker.mjs';

const options={origin:SOURCE.canonicalOrigin,routes:SOURCE.routes.resources.map(resource=>resource.path),
  cssPath:'/assets/style.css',delivery:SOURCE.delivery,machineResources:SOURCE.machineResources};
const blocks=headers=>new Map(headers.trim().split(/\n\s*\n/).map(block=>[block.split('\n')[0],block]));

test('the full canonical graph is indexable at its own URL without changing other representation policies',()=>{
  assert.deepEqual(SOURCE.delivery.http.indexingProfiles.machine.resourceOverrides,{'/graph.jsonld':'index, follow'});
  const result=blocks(generateHeaders(options)),graph=result.get('/graph.jsonld');
  assert.match(graph,/^  X-Robots-Tag: index, follow$/m);
  assert.match(graph,/^  Content-Type: application\/ld\+json(?:;[^\n]+)?$/m);
  assert.match(graph,/^  Link: <https:\/\/www\.ghezelbaash\.ir\/graph\.jsonld>; rel=canonical/m);
  assert.match(graph,/^  Access-Control-Allow-Origin: \*$/m);
  assert.match(graph,new RegExp('^  Cache-Control: '+SOURCE.delivery.machine.cacheControl.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','m'));
  for(const path of ['/graph.ttl','/provenance.jsonld','/doctor.vcf','/clinic.vcf'])
    assert.match(result.get(path),/^  X-Robots-Tag: noindex, follow$/m,path);
  for(const path of ['/data-catalog','/graph.jsonld/*'])
    assert.match(result.get(path),/^  X-Robots-Tag: noindex, follow$/m,path);
});

test('release sealing preserves graph indexing, its exact digest and both preview exclusions',()=>{
  const headers=generateHeaders(options),contentDigest='sha-256=:graph-test-digest:';
  const sealed=blocks(sealHeaders({headers,eligible:{'/graph.jsonld':{contentDigest}},
    resourcePaths:[...SOURCE.machineResources,...SOURCE.delivery.releaseResources].map(resource=>resource.path)}));
  assert.match(sealed.get('/graph.jsonld'),/^  X-Robots-Tag: index, follow$/m);
  assert.ok(sealed.get('/graph.jsonld').includes('  Content-Digest: '+contentDigest));
  assert.match(sealed.get('/graph.jsonld'),/^  Access-Control-Allow-Origin: \*$/m);
  for(const host of ['https://:project.pages.dev/*','https://:version.:project.pages.dev/*'])
    assert.match(sealed.get(host),/^  X-Robots-Tag: noindex, nofollow, noarchive$/m,host);
});

test('a mistyped, wildcard or malformed indexing override cannot silently change deployed headers',()=>{
  for(const override of [{'/graph.jsonld/*':'index, follow'},{'/missing.jsonld':'index, follow'},
    {'/graph.jsonld':'index, follow\nX-Other: bad'},{'/graph.jsonld':'anything'}]){
    const delivery=structuredClone(SOURCE.delivery);delivery.http.indexingProfiles.machine.resourceOverrides=override;
    assert.throws(()=>generateHeaders({...options,delivery}),/unregistered resource|Invalid resource indexing/);
  }
});

test('the existing Pages Worker replaces positive indexing directives on both preview hosts',async()=>{
  const bytes=new TextEncoder().encode('sealed preview media');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  const worker=createMediaRangeWorker({'/media/indexing-test.mp4':{bytes:bytes.length,sha256,mediaType:'video/mp4'}},
    {headers:{'X-Robots-Tag':'index, follow'}});
  for(const host of ['www.ghezelbaash.ir','doctor-ghezelbaash.pages.dev','candidate.doctor-ghezelbaash.pages.dev']){
    const response=await worker.fetch(new Request('https://'+host+'/media/indexing-test.mp4'),
      {ASSETS:{fetch:async()=>new Response(bytes)}});
    assert.equal(response.headers.get('X-Robots-Tag'),host==='www.ghezelbaash.ir'?'index, follow':'noindex');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
  }
});
