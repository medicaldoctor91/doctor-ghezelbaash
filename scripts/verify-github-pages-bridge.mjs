import assert from 'node:assert/strict';
import {canonical,escapeHtml,humanRoutes,machineRoutes,redirectHtml} from './build-github-pages-bridge.mjs';

const publicBase=new URL('https://medicaldoctor91.github.io/doctor-ghezelbaash/');
const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

export function verifyHumanHtml(html,target){
  assert.ok(html.includes(`content="0; url=${escapeHtml(target)}"`),'Zero-second permanent meta refresh drift');
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`),'Cross-domain canonical drift');
  assert.ok(html.includes(`href="${escapeHtml(target)}"`),'Visible canonical destination link drift');
  assert.ok(!/noindex/i.test(html),'A noindex directive would weaken redirect consolidation');
}

export function verifyMachinePayload(text,target){
  const payload=JSON.parse(text);
  assert.equal(payload.schemaVersion,1);
  assert.equal(payload.status,'moved-permanently');
  assert.equal(payload.deprecated,true);
  assert.equal(payload.canonicalSite,canonical);
  assert.equal(payload.canonicalEntity,`${canonical}#dr-saeed-ghezelbash`);
  assert.equal(payload.movedTo,target);
}

async function request(relative,attempt){
  const url=new URL(relative,publicBase);
  url.searchParams.set('__bridge_verify',`${process.env.GITHUB_SHA||'manual'}-${attempt}`);
  const response=await fetch(url,{
    cache:'no-store',
    redirect:'manual',
    headers:{
      'cache-control':'no-cache, no-store, max-age=0',
      pragma:'no-cache',
      'user-agent':'ghezelbaash-github-pages-bridge-verifier/1.0',
    },
    signal:AbortSignal.timeout(20_000),
  });
  return {response,text:await response.text()};
}

async function verifyLive(attempt){
  const tasks=[];
  for(const [relative,target] of humanRoutes){
    const route=relative==='index.html'?'':relative.endsWith('/index.html')?relative.slice(0,-10):relative;
    tasks.push(async()=>{
      const {response,text}=await request(route,attempt);
      assert.equal(response.status,200,`Human bridge status drift ${route}: ${response.status}`);
      assert.match(response.headers.get('content-type')||'',/^text\/html\b/i,`Human bridge MIME drift ${route}`);
      verifyHumanHtml(text,target);
    });
  }
  for(const [relative,target] of machineRoutes){
    tasks.push(async()=>{
      const {response,text}=await request(relative,attempt);
      assert.equal(response.status,200,`Machine bridge status drift ${relative}: ${response.status}`);
      assert.match(response.headers.get('content-type')||'',/^application\/(?:json|ld\+json)\b/i,`Machine bridge MIME drift ${relative}`);
      verifyMachinePayload(text,target);
    });
  }
  tasks.push(async()=>{
    const {response,text}=await request('llms.txt',attempt);
    assert.equal(response.status,200);
    assert.ok(text.includes(`MOVED_TO: ${canonical}llms.txt`));
  });
  tasks.push(async()=>{
    const {response,text}=await request('nap.csv',attempt);
    assert.equal(response.status,200);
    assert.ok(text.includes(`${canonical}entity-facts.csv`));
  });
  tasks.push(async()=>{
    const {response,text}=await request('__legacy_missing_bridge_proof__',attempt);
    assert.equal(response.status,404,`Custom 404 status drift: ${response.status}`);
    verifyHumanHtml(text,canonical);
  });

  let cursor=0;
  const workers=Array.from({length:8},async()=>{
    while(cursor<tasks.length){
      const index=cursor++;
      await tasks[index]();
    }
  });
  await Promise.all(workers);
}

if(process.argv.includes('--self-test')){
  verifyHumanHtml(redirectHtml(`${canonical}#botox`,'بوتاکس'),`${canonical}#botox`);
  verifyMachinePayload(JSON.stringify({schemaVersion:1,status:'moved-permanently',deprecated:true,canonicalEntity:`${canonical}#dr-saeed-ghezelbash`,canonicalSite:canonical,movedTo:`${canonical}graph.jsonld`}),`${canonical}graph.jsonld`);
  console.log('GITHUB_PAGES_BRIDGE_VERIFIER_SELF_TEST_OK');
}else{
  let lastError;
  for(let attempt=1;attempt<=20;attempt++){
    try{
      await verifyLive(attempt);
      console.log(JSON.stringify({valid:true,publicBase:publicBase.href,cacheBypass:true,humanRedirectBridges:humanRoutes.length,machineDeprecationBridges:machineRoutes.length,auxiliaryMachineBridges:2,custom404:true,liveProbes:humanRoutes.length+machineRoutes.length+3},null,2));
      lastError=null;
      break;
    }catch(error){
      lastError=error;
      if(attempt===20)break;
      console.warn(`GITHUB_PAGES_PROPAGATION_WAIT attempt=${attempt} error=${error instanceof Error?error.message:String(error)}`);
      await sleep(3000);
    }
  }
  if(lastError)throw lastError;
}
