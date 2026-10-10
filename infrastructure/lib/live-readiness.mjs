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
