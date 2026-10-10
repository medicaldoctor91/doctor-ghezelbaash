import assert from 'node:assert/strict';
import {sha256Hex} from './lib/hash.mjs';
import {waitForPublishedFile} from './lib/live-readiness.mjs';

const current=Buffer.from('new'),old=Buffer.from('old');
const expected={bytes:current.length,sha256:sha256Hex(current)};
const response=(bytes,status=200)=>({response:{status},bytes});
let requests=0,pauses=0;
const recovered=await waitForPublishedFile({name:'/mutable.json',expected,deadline:Date.now()+30000,get:async()=>response(++requests===1?old:current),pause:async()=>{pauses++;}});
assert.equal(recovered.attempts,2);assert.equal(pauses,1);assert.deepEqual(recovered.bytes,current,'A same-sized old release is never accepted');
requests=0;
const uploaded=await waitForPublishedFile({name:'/assets/new.json',expected,deadline:Date.now()+30000,get:async()=>++requests===1?response(Buffer.from('missing'),404):response(current),pause:async()=>{}});
assert.equal(uploaded.attempts,2,'A temporarily unavailable uploaded asset must match its sealed bytes');
await assert.rejects(waitForPublishedFile({name:'/mutable.json',expected,deadline:0,get:async()=>response(old)}),/Live SHA-256/,'Persistent stale data still fails publication');
await assert.rejects(waitForPublishedFile({name:'/mutable.json',expected,deadline:0,get:async()=>response(Buffer.from('shorter'))}),/Live byte size/);
await assert.rejects(waitForPublishedFile({name:'/private.json',expected,deadline:0,get:async()=>response(current,403)}),/Live file/,'Blocked files cannot pass with correct-looking bytes');
const errorPage=await waitForPublishedFile({name:'/404.html',expected,deadline:0,get:async()=>response(current,404)});
assert.equal(errorPage.attempts,1,'Only the sealed custom error page may legitimately use HTTP 404');
console.log('PASS published-file readiness: exact bytes, bounded retry, permanent failure and sealed 404');
