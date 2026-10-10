import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createMediaRangeWorker} from './lib/media-range-worker.mjs';
import {renderMediaWorker,materializeMediaWorker,verifyMediaWorker} from './materialize-media-worker.mjs';
import {sha256Hex} from './lib/hash.mjs';
import {SOURCE} from '../src/canonical/source.mjs';

const name='/media/videos/education/example.mp4',bytes=Buffer.from('0123456789');
const media=body=>({[name]:{bytes:body.length,sha256:sha256Hex(body),mediaType:'video/mp4'}});
const entries=new Map(),pending=[];
globalThis.caches={default:{async match(key){return entries.get(key.url)?.clone();},async put(key,response){entries.set(key.url,new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers}));}}};
const ctx={waitUntil(promise){pending.push(promise);}},flush=()=>Promise.all(pending.splice(0));
let uploads=0,upstreamBytes=bytes,forwarded;
const env={ASSETS:{async fetch(request){
 forwarded=request;uploads++;
 if(new URL(request.url).pathname!==name)return new Response('static fallback',{status:404});
 assert.equal(request.headers.get('Range'),null,'Pages only receives a full asset fetch on cache miss');
 return new Response(upstreamBytes,{headers:{'Content-Type':'video/mp4','Content-Length':String(upstreamBytes.length),'Content-Security-Policy':"default-src 'self'",'Last-Modified':'Mon, 05 Oct 2026 00:00:00 GMT'}});
}}};
const worker=createMediaRangeWorker(media(bytes));
const request=(headers={},method='GET')=>new Request('https://www.ghezelbaash.ir'+name,{headers,method});
const check=async(headers,status,body,boundary)=>{
 const response=await worker.fetch(request(headers),env,ctx);await flush();
 assert.equal(response.status,status);assert.equal(await response.text(),body);
 assert.equal(response.headers.get('Content-Range'),boundary??null);
 assert.equal(response.headers.get('Accept-Ranges'),'bytes');
 assert.equal(response.headers.get('Content-Security-Policy'),"default-src 'self'",'Static security headers survive the media handler');
 return response;
};
await check({Range:'bytes=2-5'},206,'2345','bytes 2-5/10');
await check({Range:'bytes=7-'},206,'789','bytes 7-9/10');
await check({Range:'bytes=-3'},206,'789','bytes 7-9/10');
await check({Range:'bytes=8-999'},206,'89','bytes 8-9/10');
await check({Range:'bytes=-999'},206,'0123456789','bytes 0-9/10');
await check({Range:'bytes=10-'},416,'','bytes */10');
await check({Range:'bytes=-0'},416,'','bytes */10');
await check({Range:'bytes=0-1,4-5'},200,'0123456789');
await check({Range:'invalid'},200,'0123456789');
await check({Range:'bytes=8-2'},200,'0123456789');
await check({},200,'0123456789');
assert.equal(uploads,1,'Repeated seeks reuse one verified full encoding per edge cache');
const etag=`"${sha256Hex(bytes)}"`;
await check({Range:'bytes=2-5','If-Range':etag},206,'2345','bytes 2-5/10');
await check({Range:'bytes=2-5','If-Range':'"old"'},200,'0123456789');
await check({Range:'bytes=2-5','If-Range':'W/'+etag},200,'0123456789');
await check({Range:'bytes=2-5','If-Range':'Mon, 05 Oct 2026 00:00:00 GMT'},206,'2345','bytes 2-5/10');
await check({Range:'bytes=2-5','If-Range':'Sun, 04 Oct 2026 00:00:00 GMT'},200,'0123456789');
const notModified=await worker.fetch(request({'If-None-Match':'"other", W/'+etag}),env,ctx);
assert.equal(notModified.status,304);assert.equal(await notModified.text(),'');assert.equal(notModified.headers.get('Content-Length'),null);
const head=await worker.fetch(request({Range:'bytes=2-5'},'HEAD'),env,ctx);
assert.equal(head.status,200);assert.equal(head.headers.get('Content-Length'),'10');assert.equal(await head.text(),'');
const staticRequest=new Request('https://www.ghezelbaash.ir/botox',{headers:{Range:'bytes=1-2'}});
assert.equal((await worker.fetch(staticRequest,env,ctx)).status,404);assert.equal(forwarded,staticRequest,'All other URLs retain native Pages request handling');

const revised=Buffer.from('abcdefghij');upstreamBytes=revised;
const revisedWorker=createMediaRangeWorker(media(revised));
const newRange=await revisedWorker.fetch(request({Range:'bytes=2-5'}),env,ctx);await flush();
assert.equal(newRange.status,206);assert.equal(await newRange.text(),'cdef','A new release cannot reuse a same-sized older cached encoding');
upstreamBytes=Buffer.from('wrong-byte');
const uncached=Buffer.from('9876543210'),rejectWorker=createMediaRangeWorker(media(uncached));
const rejected=await rejectWorker.fetch(request({Range:'bytes=0-1'}),env,ctx);await flush();
assert.equal(rejected.status,502);assert.equal(rejected.headers.get('Cache-Control'),'no-store');
assert(![...entries.keys()].some(key=>key.includes(sha256Hex(uncached))),'Wrong source bytes never enter the sealed edge cache');
const newPolicy=createMediaRangeWorker(media(bytes),{headers:{'Content-Security-Policy':"default-src 'none'",'Referrer-Policy':'strict-origin-when-cross-origin'}});
const policyResponse=await newPolicy.fetch(request({Range:'bytes=0-1'}),env,ctx);
assert.equal(policyResponse.status,206);assert.equal(await policyResponse.text(),'01');
assert.equal(policyResponse.headers.get('Content-Security-Policy'),"default-src 'none'",'A header-only release updates reused media cache responses');
const preview=await newPolicy.fetch(new Request('https://abc123.doctor-ghezelbaash.pages.dev'+name,{headers:{Range:'bytes=0-1'}}),{ASSETS:{fetch:async()=>new Response(bytes)}},ctx);await flush();
assert.equal(preview.status,206);assert.equal(preview.headers.get('X-Robots-Tag'),'noindex','Preview media remains outside indexing');

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'video-range-worker-'));
try{
 const registered=SOURCE.graph['@graph'].filter(node=>[].concat(node['@type']??[]).includes('MediaObject')&&/\/media\/videos\/.+\.(mp4|webm)$/.test(node.contentUrl??''));
 for(const node of registered){const p=new URL(node.contentUrl).pathname,file=path.join(temp,p);await fs.mkdir(path.dirname(file),{recursive:true});await fs.copyFile(new URL('../public'+p,import.meta.url),file);}
 await fs.writeFile(path.join(temp,'_headers'),"/*\n  Content-Security-Policy: default-src 'self'\n  Content-Signal: search=yes\n");
 const output=await renderMediaWorker({distDir:temp,source:SOURCE});
 const routes=JSON.parse(output.routes);assert.equal(routes.include.length,8);assert.deepEqual(routes.exclude,[]);
 assert(SOURCE.routes.resources.every(route=>!routes.include.includes(route.path)),'All 72 HTML routes stay outside Functions invocation');
 await materializeMediaWorker({distDir:temp,source:SOURCE});await verifyMediaWorker({distDir:temp,source:SOURCE});
 await fs.appendFile(path.join(temp,'_worker.js'),'\n// tampered');
 await assert.rejects(verifyMediaWorker({distDir:temp,source:SOURCE}),/Sealed range Worker/,'The verifier rejects a modified delivery handler');
}finally{await fs.rm(temp,{recursive:true,force:true});delete globalThis.caches;}
console.log('PASS sealed native media delivery: ranges, conditional requests, cache reuse, release isolation, byte integrity and video-only invocation');
