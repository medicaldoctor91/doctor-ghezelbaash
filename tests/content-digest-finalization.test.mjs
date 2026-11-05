import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {SOURCE} from '../src/canonical/source.mjs';
import {generateHeaders,sealHeaders} from '../build/lib/headers.mjs';
import {mediaWorkerPaths} from '../build/materialize-media-worker.mjs';

const sealRelease = await fs.readFile(new URL('../build/seal-release.mjs', import.meta.url), 'utf8');
const workflow = await fs.readFile(new URL('../.github/workflows/machine-readable-interop.yml', import.meta.url), 'utf8');

test('release sealing emits deployable Cloudflare Content-Digest headers instead of a permanent pending state', () => {
  assert.doesNotMatch(sealRelease, /pending-live-byte-identity-verification/);
  assert.doesNotMatch(sealRelease, /writeFile\(path\.join\(distDir,'_headers\.content-digest\.pending'\)/);
  assert.match(sealRelease, /path\.join\(distDir,'_headers'\)/);
  assert.match(sealRelease, /status:'configured-for-cloudflare-pages'/);
});

test('deployment verification checks the live Content-Digest response header', () => {
  assert.match(workflow, /Content-Digest/i);
  assert.match(workflow, /content-digest-eligibility\.json/);
});

test('final release preserves representation and 404 policies alongside all 61 static/Worker asset digests',()=>{
  const resources=[...SOURCE.machineResources,...SOURCE.delivery.releaseResources].filter(r=>r.path!=='/_headers.content-digest.pending');
  const headers=generateHeaders({origin:SOURCE.canonicalOrigin,routes:SOURCE.routes.resources.map(r=>r.path),
    cssPath:'/assets/style.css',delivery:SOURCE.delivery,machineResources:SOURCE.machineResources});
  const workerDigestPaths=mediaWorkerPaths(SOURCE);
  const eligible=Object.fromEntries([...Array.from({length:53},(_,i)=>[`/media/test-${i}.webp`,{contentDigest:'sha-256=:test'+i+':'}]),
    ...workerDigestPaths.map((path,i)=>[path,{contentDigest:'sha-256=:video'+i+':'}])]);
  const sealed=sealHeaders({headers,eligible,resourcePaths:resources.map(r=>r.path),workerDigestPaths});
  const blocks=new Map(sealed.trim().split(/\n\s*\n/).map(block=>[block.split('\n')[0],block]));
  assert.ok(blocks.size<=100);
  for(const resource of resources){
    if(resource.httpHeaderPolicy==='static-json'){
      assert.ok((resource.path.startsWith('/enrichment/')||resource.path==='/doi-policy.json')&&resource.path.endsWith('.json'));
      assert.equal(resource.mediaType,'application/json');
      assert.ok(blocks.has('/*'),'Native static JSON retains the shared security policy');
    }else assert.ok(blocks.get(resource.path).includes('  Content-Type: '+resource.mediaType),resource.path);
  }
  for(const [url,meta] of Object.entries(eligible)){
    if(workerDigestPaths.includes(url))assert.equal(blocks.has(url),false,'Worker responses publish their own digest');
    else assert.ok(blocks.get(url).includes('  Content-Digest: '+meta.contentDigest));
  }
  for(const path of ['/404','/404.html']){
    assert.match(blocks.get(path),/^  Cache-Control: no-store$/m,path);
    assert.match(blocks.get(path),/^  X-Robots-Tag: noindex$/m,path);
    assert.match(blocks.get(path),/^  ! Link$/m,path);
  }
  assert.doesNotMatch(blocks.get('/*'),/X-Robots-Tag/,'Normal HTML must not inherit error exclusions');
  assert.match(blocks.get('/croissant.json'),/Access-Control-Allow-Origin: \*/);
  assert.match(blocks.get('/entity-facts.csv-metadata.json'),/Content-Type: application\/csvm\+json/);
  assert.throws(()=>sealHeaders({headers,eligible:{...eligible,...Object.fromEntries(Array.from({length:10},(_,i)=>['/extra-'+i,{contentDigest:'test'}]))},resourcePaths:resources.map(r=>r.path),workerDigestPaths}),/rule limit exceeded/);
  for(const name of ['/graph.jsonld','/media/videos/unregistered.mp4'])
    assert.throws(()=>sealHeaders({headers,eligible,resourcePaths:resources.map(r=>r.path),workerDigestPaths:[name]}),/Invalid Worker-owned digest path/);
});
