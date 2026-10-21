import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createMediaRangeWorker} from '../build/lib/media-range-worker.mjs';
const bytes=Uint8Array.from({length:128},(_,i)=>i);
const hex=createHash('sha256').update(bytes).digest('hex');
const digest=b=>'sha-256=:'+createHash('sha256').update(b).digest('base64')+':';
const etag=`"${hex}"`,url='https://www.ghezelbaash.ir/media/test.mp4';
const policy={headers:{'X-Content-Type-Options':'nosniff','Content-Signal':'search=yes'}};
const media={'/media/test.mp4':{bytes:bytes.length,sha256:hex,mediaType:'video/mp4'}};
function harness({legacy=false,corrupt=false}={}){
 const original=globalThis.caches;let cached,fetches=0,puts=0,cacheKey;
 const full=()=>new Response(bytes,{headers:{'Content-Digest':digest(bytes),'Last-Modified':'Tue, 20 Oct 2026 00:00:00 GMT','Content-Length':'128','ETag':etag,'Link':'<old>; rel=canonical'}});
 if(legacy)cached=full();
 globalThis.caches={default:{async match(k){cacheKey=k.url;return cached?.clone();},async put(k,r){puts++;cacheKey=k.url;cached=r;}}};
 const worker=createMediaRangeWorker(media,policy);
 const env={ASSETS:{async fetch(req){fetches++;assert.equal(req.headers.get('Range'),null);assert.equal(req.headers.get('Accept-Encoding'),'identity');return corrupt?new Response(new Uint8Array(128)):full();}}};
 return {async fetch(headers={},method='GET'){return worker.fetch(new Request(url,{headers,method}),env);},state:()=>({fetches,puts,cacheKey}),restore(){globalThis.caches=original;}};
}
for(const legacy of [false,true])test(`partial digests cover exact returned bytes (${legacy?'legacy cache':'cold upstream'})`,async()=>{
 const h=harness({legacy});try{
  for(const [range,start,end] of [['bytes=0-63',0,63],['bytes=-9',119,127],['bytes=120-',120,127],['bytes=120-999',120,127]]){
   const r=await h.fetch({Range:range});const actual=new Uint8Array(await r.arrayBuffer());assert.equal(r.status,206);assert.deepEqual(actual,bytes.slice(start,end+1));assert.equal(r.headers.get('Content-Digest'),digest(actual));assert.equal(r.headers.get('Content-Range'),`bytes ${start}-${end}/128`);assert.equal(r.headers.get('Content-Length'),String(end-start+1));assert.equal(r.headers.get('ETag'),etag);assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(r.headers.get('Link'),null);
  }
  assert.equal(h.state().fetches,legacy?0:1);assert.equal(h.state().puts,legacy?0:1);assert.equal(new URL(h.state().cacheKey).searchParams.get('sealed-media'),hex);
 }finally{h.restore();}
});
test('full GET, matching and mismatching If-Range preserve full digest and validators',async()=>{
 const h=harness();try{
  for(const headers of [{},{Range:'bytes=0-9','If-Range':'"different"'},{Range:'bytes=0-9','If-Range':'Mon, 19 Oct 2026 00:00:00 GMT'},{Range:'bytes=9-2'}]){
   const r=await h.fetch(headers);assert.equal(r.status,200);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),bytes);assert.equal(r.headers.get('Content-Digest'),digest(bytes));assert.equal(r.headers.get('ETag'),etag);
  }
  for(const value of [etag,'Wed, 21 Oct 2026 00:00:00 GMT']){const r=await h.fetch({Range:'bytes=0-9','If-Range':value});assert.equal(r.status,206);assert.equal(r.headers.get('Content-Digest'),digest(bytes.slice(0,10)));}
 }finally{h.restore();}
});
test('empty HEAD, 304 and 416 never inherit a full-body Content-Digest',async()=>{
 const h=harness({legacy:true});try{
  for(const [headers,method,status] of [[{},'HEAD',200],[{'If-None-Match':etag},'GET',304],[{'If-Modified-Since':'Wed, 21 Oct 2026 00:00:00 GMT'},'GET',304],[{Range:'bytes=200-'},'GET',416]]){
   const r=await h.fetch(headers,method);assert.equal(r.status,status);assert.equal((await r.arrayBuffer()).byteLength,0);assert.equal(r.headers.get('Content-Digest'),null);assert.equal(r.headers.get('ETag'),etag);if(method==='HEAD')assert.equal(r.headers.get('Content-Length'),'128');if(status===416)assert.equal(r.headers.get('Content-Range'),'bytes */128');
  }
 }finally{h.restore();}
});
test('sealed full-file verification still rejects wrong upstream bytes without caching',async()=>{
 const h=harness({corrupt:true});try{const r=await h.fetch({Range:'bytes=0-63'});assert.equal(r.status,502);assert.equal(h.state().puts,0);}finally{h.restore();}
});
test('nonmedia and non-GET/HEAD requests delegate unchanged',async()=>{
 const w=createMediaRangeWorker(media,policy);for(const req of [new Request('https://www.ghezelbaash.ir/'),new Request(url,{method:'POST'})]){let seen;const response=new Response('delegated');assert.equal(await w.fetch(req,{ASSETS:{fetch(r){seen=r;return response;}}}),response);assert.equal(seen,req);}
});
