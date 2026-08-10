import path from 'node:path';
import os from 'node:os';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { parse } from 'parse5';

const TOOL_NAME='search_saeed_ghezelbash_guide';
const TOOL_DESCRIPTION="Searches the headings of Dr. Saeed Ghezelbash's single-page aesthetic medicine guide in Kermanshah and returns exact section anchors for treatments, complications, diagnostic topics, and physician or clinic information.";
const PARAM_DESCRIPTION='Persian medical or aesthetic search query, or a Saeed Ghezelbash physician/entity alias.';
const fail=m=>{throw new Error(m)};
const args=process.argv.slice(2),runtime=args.includes('--runtime'),urlAt=args.indexOf('--url');
const liveUrl=urlAt>=0?args[urlAt+1]:null;
const distArg=args.find(x=>!x.startsWith('--')&&x!==liveUrl)||'dist';

const attrs=n=>Object.fromEntries((n.attrs||[]).map(x=>[x.name,x.value]));
function walk(n,out=[]){if(n?.tagName)out.push(n);for(const c of n?.childNodes||[])walk(c,out);return out}
function staticContract(html,label){
  const nodes=walk(parse(html)),forms=nodes.filter(n=>n.tagName==='form');
  if(forms.length!==1)fail(`${label}: expected exactly one semantic form, found ${forms.length}`);
  const form=forms[0],fa=attrs(form);
  if(fa.id!=='guide-search-form'||fa.toolname!==TOOL_NAME||fa.tooldescription!==TOOL_DESCRIPTION||!Object.hasOwn(fa,'toolautosubmit'))fail(`${label}: declarative WebMCP form contract drift`);
  const controls=walk(form,[]).filter(n=>['input','select','textarea'].includes(n.tagName)),named=controls.filter(n=>attrs(n).name);
  if(named.length!==1)fail(`${label}: expected one named WebMCP parameter, found ${named.length}`);
  const input=named[0],ia=attrs(input);
  if(input.tagName!=='input'||ia.id!=='guide-search-input'||ia.name!=='query'||ia.type!=='search'||!Object.hasOwn(ia,'required')||ia.toolparamdescription!==PARAM_DESCRIPTION)fail(`${label}: WebMCP query parameter/schema contract drift`);
  for(const f of forms){const a=attrs(f);if(!a.toolname||!a.tooldescription)fail(`${label}: form missing declarative WebMCP coverage`)}
  const scripts=nodes.filter(n=>n.tagName==='script'),site=scripts.find(n=>attrs(n).id==='site-runtime'),body=(site?.childNodes||[]).map(n=>n.value||'').join('');
  for(const token of ["addEventListener('submit'",'agentInvoked','respondWith(Promise.resolve(toolResult(x)))',"addEventListener('toolactivated'",'headingLevel:hit.level',"hash:'#'+hit.id",'url:u.href'])if(!body.includes(token))fail(`${label}: WebMCP runtime contract missing ${token}`);
  return {forms:forms.length,tool:TOOL_NAME,parameter:'query',autosubmit:true};
}

async function findChrome(){
  const env=process.env.CHROME_PATH?.trim();if(env&&await access(env).then(()=>true).catch(()=>false))return env;
  for(const p of ['/usr/bin/google-chrome-stable','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser','/opt/google/chrome/google-chrome'])if(await access(p).then(()=>true).catch(()=>false))return p;
  for(const name of ['google-chrome-stable','google-chrome','chromium','chromium-browser']){const x=spawnSync('which',[name],{encoding:'utf8'});if(x.status===0&&x.stdout.trim())return x.stdout.trim()}
  return null;
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function jsonEndpoint(port){for(let i=0;i<60;i++){try{return await (await fetch(`http://127.0.0.1:${port}/json`,{cache:'no-store'})).json()}catch{await delay(250)}}fail('Chrome DevTools endpoint did not become ready')}
async function cdpSession(wsUrl){
  const ws=new WebSocket(wsUrl),pending=new Map(),events=[];let id=0;
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  ws.addEventListener('message',e=>{const m=JSON.parse(String(e.data));if(m.id&&pending.has(m.id)){const {resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(new Error(m.error.message||'CDP error')):resolve(m.result)}else if(m.method)events.push(m)});
  const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
  return {call,events,close:()=>ws.close()};
}
async function waitForEvent(cdp,method,predicate=()=>true,timeoutMs=6000){
  const started=Date.now();
  while(Date.now()-started<timeoutMs){const hit=cdp.events.find(e=>e.method===method&&predicate(e.params||{}));if(hit)return hit.params;await delay(50)}
  fail(`Timed out waiting for Chrome DevTools ${method}`);
}
async function chromeContract(target){
  const chrome=await findChrome();if(!chrome)fail('Chrome executable unavailable for required WebMCP runtime verification');
  const profile=await mkdtemp(path.join(os.tmpdir(),'ghezelbash-webmcp-')),port=9337;
  const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--remote-allow-origins=*',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--enable-experimental-web-platform-features',target],{stdio:'ignore'});
  try{
    const pages=await jsonEndpoint(port),targetUrl=new URL(target).href,page=pages.find(x=>x.type==='page'&&x.url===targetUrl)||pages.find(x=>x.type==='page'&&x.url?.startsWith(targetUrl))||pages.find(x=>x.type==='page');
    if(!page?.webSocketDebuggerUrl)fail('Chrome page DevTools target unavailable');
    const cdp=await cdpSession(page.webSocketDebuggerUrl);
    try{
      for(let i=0;i<40;i++){const r=await cdp.call('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});if(r.result?.value==='complete')break;await delay(250)}
      await delay(250);
      await cdp.call('WebMCP.enable');
      const added=await waitForEvent(cdp,'WebMCP.toolsAdded',p=>Array.isArray(p.tools)&&p.tools.some(t=>t.name===TOOL_NAME));
      const tools=cdp.events.filter(e=>e.method==='WebMCP.toolsAdded').flatMap(e=>e.params?.tools||[]),matching=tools.filter(t=>t.name===TOOL_NAME);
      if(matching.length!==1)fail(`Chrome registered ${matching.length} instances of ${TOOL_NAME}; expected exactly one`);
      const tool=matching[0],schema=tool.inputSchema,query=schema?.properties?.query;
      if(tool.description!==TOOL_DESCRIPTION)fail('Chrome registered tool description drift');
      if(schema?.type!=='object'||query?.type!=='string'||query?.description!==PARAM_DESCRIPTION||!Array.isArray(schema.required)||!schema.required.includes('query'))fail('Chrome-generated WebMCP inputSchema drift');
      if(tool.annotations?.autosubmit!==true)fail('Chrome declarative WebMCP autosubmit annotation missing');
      if(!Number.isInteger(tool.backendNodeId)||tool.backendNodeId<1)fail('Chrome did not expose a declarative WebMCP backendNodeId');
      const frameTree=await cdp.call('Page.getFrameTree'),frameId=tool.frameId||frameTree.frameTree?.frame?.id;if(!frameId)fail('Chrome WebMCP main frame id unavailable');
      const invocation=await cdp.call('WebMCP.invokeTool',{frameId,toolName:TOOL_NAME,input:{query:'بوتاکس'}});if(!invocation?.invocationId)fail('Chrome WebMCP invocation id unavailable');
      const responded=await waitForEvent(cdp,'WebMCP.toolResponded',p=>p.invocationId===invocation.invocationId);
      if(responded.status!=='Completed')fail(`Chrome WebMCP invocation failed with status ${responded.status}: ${responded.errorText||''}`);
      const output=responded.output;if(output?.query!=='بوتاکس'||!Number.isInteger(output?.count)||output.count<1||!Array.isArray(output.results)||output.results.length!==output.count)fail('Chrome WebMCP structured search output drift');
      for(const hit of output.results){if(!hit?.title||!hit?.id||![2,3,4].includes(hit.headingLevel)||hit.hash!==`#${hit.id}`||!String(hit.url||'').includes(`#${hit.id}`))fail('Chrome WebMCP result anchor contract drift')}
      const dialog=await cdp.call('Runtime.evaluate',{expression:"document.getElementById('guide-search')?.open===true",returnByValue:true});if(dialog.result?.value!==true)fail('Chrome WebMCP invocation did not expose the existing guide-search UI');
      return {chrome,tool:TOOL_NAME,count:output.count,schema,autosubmit:true,declarative:true,dialogOpened:true};
    }finally{cdp.close()}
  }finally{child.kill('SIGTERM');await delay(200).catch(()=>{});await rm(profile,{recursive:true,force:true}).catch(()=>{})}
}

let html,label;
if(liveUrl){const r=await fetch(liveUrl,{cache:'no-store',headers:{'cache-control':'no-cache, no-store, max-age=0','pragma':'no-cache','user-agent':'Ghezelbash-WebMCP-Verifier/1.0'}});if(!r.ok)fail(`Live WebMCP page fetch failed ${r.status}`);html=await r.text();label=liveUrl}else{const file=path.resolve(process.cwd(),distArg,'index.html');html=await readFile(file,'utf8');label=file}
const staticResult=staticContract(html,label),runtimeResult=runtime?(liveUrl?await chromeContract(liveUrl):fail('--runtime requires --url')):null;
console.log(JSON.stringify({valid:true,static:staticResult,runtime:runtimeResult},null,2));
