import assert from 'node:assert/strict';
import {sha256Hex} from './hash.mjs';

// Custom-domain activation can briefly deliver an older mutable asset even
// after its new manifest is visible. The exact sealed bytes remain mandatory.
export async function waitForPublishedFile({name,expected,get,deadline,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 let attempts=0,result;
 while(true){
  attempts++;result=await get(name);
  const {response,bytes}=result;
  const statusOk=response.status===200||(name==='/404.html'&&response.status===404);
  if(statusOk&&bytes.length===expected.bytes&&sha256Hex(bytes)===expected.sha256)return {...result,attempts};
  const remaining=deadline-Date.now();
  if(remaining<=0)break;
  await pause(Math.min(2000,remaining));
 }
 const {response,bytes}=result;
 assert.ok(response.status===200||(name==='/404.html'&&response.status===404),`Live file ${name}: ${response.status}`);
 assert.equal(bytes.length,expected.bytes,`Live byte size ${name}`);
 assert.equal(sha256Hex(bytes),expected.sha256,`Live SHA-256 ${name}`);
}

// The native URL can activate separately from a release-qualified full fetch.
// A retry may wait for activation; it must never accept a full-body HTTP 200.
export async function waitForPublishedRange({name,bytes,start,end,get,deadline,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 const boundary=`bytes ${start}-${end}/${bytes.length}`,expected=bytes.subarray(start,end+1);
 let attempts=0,result;
 while(true){
  attempts++;result=await get(name,start,end);
  if(result.response.status===206&&result.response.headers.get('content-range')===boundary&&result.bytes.equals(expected))return {...result,attempts};
  const remaining=deadline-Date.now();
  if(remaining<=0)break;
  await pause(Math.min(2000,remaining));
 }
 assert.equal(result.response.status,206,`Native media byte-range HTTP ${name}`);
 assert.equal(result.response.headers.get('content-range'),boundary,`Native media byte-range boundary ${name}`);
 assert.deepEqual(result.bytes,expected,`Native media byte-range bytes ${name}`);
}
