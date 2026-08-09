import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {createReadStream,constants as fsConstants} from 'node:fs';
import {access,mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

const root=process.cwd(),dist=path.resolve(root,process.argv[2]||'dist');
const fail=message=>{throw new Error(`Browser release gate: ${message}`)};
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.jsonld':'application/ld+json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.xml':'application/xml; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.woff2':'font/woff2','.mp4':'video/mp4','.webm':'video/webm','.vtt':'text/vtt; charset=utf-8','.vcf':'text/vcard; charset=utf-8','.ttl':'text/turtle; charset=utf-8','.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8','.csv':'text/csv; charset=utf-8'};
const chromeCandidates=[process.env.CHROME_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser',path.resolve(root,'../../browser-runtime/chromium')].filter(Boolean);
let chromePath;
for(const candidate of chromeCandidates)if(await access(candidate,fsConstants.X_OK).then(()=>true).catch(()=>false)){chromePath=candidate;break}
if(!chromePath)fail('Chrome/Chromium executable not found; set CHROME_PATH');
await access(path.join(dist,'index.html'));

const rangeRequests=[];
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/','http://127.0.0.1');
    let relative=decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if(!relative)relative='index.html';
    const absolute=path.resolve(dist,relative);
    if(absolute!==dist&&!absolute.startsWith(dist+path.sep))return res.writeHead(403).end('Forbidden');
    const fileStat=await stat(absolute);
    if(!fileStat.isFile())throw new Error('Not a file');
    const extension=path.extname(absolute).toLowerCase(),type=mime[extension]||'application/octet-stream',range=req.headers.range;
    if(range){
      const match=String(range).match(/^bytes=(\d*)-(\d*)$/);
      if(!match)return res.writeHead(416,{'Content-Range':`bytes */${fileStat.size}`}).end();
      const start=match[1]?Number(match[1]):0,end=match[2]?Math.min(Number(match[2]),fileStat.size-1):fileStat.size-1;
      if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||start>=fileStat.size)return res.writeHead(416,{'Content-Range':`bytes */${fileStat.size}`}).end();
      rangeRequests.push({path:url.pathname,range:String(range),start,end});
      res.writeHead(206,{'Content-Type':type,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${fileStat.size}`,'Accept-Ranges':'bytes','Cache-Control':'no-store'});
      return createReadStream(absolute,{start,end}).pipe(res);
    }
    let body=await readFile(absolute);
    if(relative==='index.html'&&url.searchParams.has('__gate_delayed'))body=Buffer.from(body.toString('utf8').replaceAll(/(\/assets\/site\.[0-9a-f]{12}\.css)/g,'$1?__gate_css_delay=1'));
    if(extension==='.css'&&url.searchParams.has('__gate_css_delay'))await delay(4500);
    res.writeHead(200,{'Content-Type':type,'Content-Length':body.length,'Accept-Ranges':'bytes','Cache-Control':'no-store'}).end(body);
  }catch{
    res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}).end('Not found');
  }
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
const origin=`http://127.0.0.1:${server.address().port}`;

const profile=await mkdtemp(path.join(os.tmpdir(),'ghezelbaash-browser-gate-'));
let stderr='';
const chrome=spawn(chromePath,['--headless=new','--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-features=Translate,BackForwardCache','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
chrome.stderr.on('data',chunk=>{if(stderr.length<12000)stderr+=chunk.toString()});
const portFile=path.join(profile,'DevToolsActivePort');
let debugPort;
for(let i=0;i<200;i++){
  if(chrome.exitCode!==null)fail(`Chromium exited before DevTools became ready (${chrome.exitCode}): ${stderr.slice(-2000)}`);
  const raw=await readFile(portFile,'utf8').catch(()=>null);
  if(raw){debugPort=Number(raw.split(/\r?\n/)[0]);break}
  await delay(50);
}
if(!debugPort)fail(`DevTools port did not become ready: ${stderr.slice(-2000)}`);
const debugOrigin=`http://127.0.0.1:${debugPort}`;

class CdpPage{
  constructor(target,ws){this.target=target;this.ws=ws;this.id=0;this.pending=new Map();this.waiters=new Map();this.events=[];}
  static async open(){
    const response=await fetch(`${debugOrigin}/json/new?${encodeURIComponent('about:blank')}`,{method:'PUT'});
    if(!response.ok)fail(`Cannot create Chromium target: HTTP ${response.status}`);
    const target=await response.json(),page=new CdpPage(target,new WebSocket(target.webSocketDebuggerUrl));
    await new Promise((resolve,reject)=>{page.ws.addEventListener('open',resolve,{once:true});page.ws.addEventListener('error',reject,{once:true})});
    page.ws.addEventListener('message',event=>page.onMessage(event.data));
    await Promise.all(['Page.enable','Runtime.enable','Log.enable','Network.enable'].map(method=>page.send(method)));
    await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{window.__releaseGate={cls:0,shifts:[],errors:[]};addEventListener('error',e=>window.__releaseGate.errors.push(String(e.message||e.error||'window error')));addEventListener('unhandledrejection',e=>window.__releaseGate.errors.push(String(e.reason||'unhandled rejection')));try{new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput){window.__releaseGate.cls+=e.value;window.__releaseGate.shifts.push({value:e.value,sources:(e.sources||[]).map(s=>s.node?.id||s.node?.className||s.node?.tagName||'unknown')})}}).observe({type:'layout-shift',buffered:true})}catch(e){window.__releaseGate.errors.push('layout observer: '+e)}})();`});
    return page;
  }
  onMessage(data){
    const message=JSON.parse(typeof data==='string'?data:Buffer.from(data).toString());
    if(message.id){const pending=this.pending.get(message.id);if(!pending)return;this.pending.delete(message.id);message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result);return}
    this.events.push(message);
    const waiters=this.waiters.get(message.method)||[];this.waiters.delete(message.method);for(const waiter of waiters)waiter.resolve(message.params);
  }
  send(method,params={}){
    const id=++this.id;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`CDP timeout: ${method}`))},30000);this.pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});this.ws.send(JSON.stringify({id,method,params}))});
  }
  waitEvent(method,timeout=30000){
    const existingIndex=this.events.findIndex(event=>event.method===method);
    if(existingIndex>=0)return Promise.resolve(this.events.splice(existingIndex,1)[0].params);
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`CDP event timeout: ${method}`)),timeout),waiter={resolve:value=>{clearTimeout(timer);resolve(value)}};this.waiters.set(method,[...(this.waiters.get(method)||[]),waiter])});
  }
  async evaluate(expression){
    const result=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text||'Runtime.evaluate failed');
    return result.result?.value;
  }
  async viewport(width,height=900){await this.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true,screenWidth:width,screenHeight:height});}
  async navigate(url,{domOnly=false}={}){
    this.events.length=0;
    const event=this.waitEvent(domOnly?'Page.domContentEventFired':'Page.loadEventFired',45000);
    await this.send('Page.navigate',{url});
    await event;
  }
  async close(){try{await this.send('Page.close')}catch{}this.ws.close()}
}

async function waitUntil(page,expression,{timeout=25000,interval=100}={}){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){const value=await page.evaluate(expression).catch(()=>false);if(value)return value;await delay(interval)}
  fail(`Timed out waiting for browser condition: ${expression.slice(0,120)}`);
}
const consoleFailures=page=>page.events.filter(event=>event.method==='Runtime.exceptionThrown'||event.method==='Log.entryAdded'&&['error','assert'].includes(event.params?.entry?.level)).map(event=>event.method==='Runtime.exceptionThrown'?(event.params?.exceptionDetails?.exception?.description||event.params?.exceptionDetails?.text):event.params?.entry?.text).filter(Boolean);

async function delayedGeometry(width){
  const page=await CdpPage.open();
  try{
    await page.viewport(width,844);
    await page.navigate(`${origin}/?__gate_delayed=1`,{domOnly:true});
    const initialHeight=await page.evaluate('document.documentElement.scrollHeight');
    await waitUntil(page,`document.querySelector('link[data-deferred-stylesheet]')?.rel==='stylesheet'`,{timeout:20000});
    await page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const finalHeight=await page.evaluate('document.documentElement.scrollHeight'),telemetry=await page.evaluate('window.__releaseGate');
    const heightDeltaRatio=Math.abs(finalHeight-initialHeight)/Math.max(finalHeight,1),errors=[...consoleFailures(page),...(telemetry?.errors||[])];
    if(heightDeltaRatio>0.01)fail(`${width}px initial/final height delta ${(heightDeltaRatio*100).toFixed(3)}% (${initialHeight}/${finalHeight})`);
    if(Number(telemetry?.cls||0)>0.001)fail(`${width}px delayed-CSS CLS ${telemetry.cls}`);
    if(errors.length)fail(`${width}px console errors: ${errors.join(' | ')}`);
    return {width,initialHeight,finalHeight,heightDeltaRatio,cls:Number(telemetry?.cls||0)};
  }finally{await page.close()}
}

async function responsiveUi(width){
  const page=await CdpPage.open();
  try{
    await page.viewport(width,844);
    await page.navigate(`${origin}/`);
    await page.evaluate('document.fonts?.ready||Promise.resolve()');
    const ui=await page.evaluate(`(()=>{const selectors=['.hero-action[href^="tel:"]','.quick-actions__bar','.quick-actions__item--phone','.quick-actions__item--consultation','.quick-actions__item--address'];const rows=selectors.flatMap(selector=>[...document.querySelectorAll(selector)].map(node=>{const r=node.getBoundingClientRect();return{selector,clientWidth:node.clientWidth,scrollWidth:node.scrollWidth,left:r.left,right:r.right,viewport:innerWidth}}));return{rows,documentClientWidth:document.documentElement.clientWidth,documentScrollWidth:document.documentElement.scrollWidth}})()`);
    const clipped=ui.rows.filter(row=>row.scrollWidth>row.clientWidth+1||row.left<-.5||row.right>row.viewport+.5);
    if(clipped.length)fail(`${width}px clipped UI: ${JSON.stringify(clipped)}`);
    if(ui.documentScrollWidth>ui.documentClientWidth+1)fail(`${width}px document horizontal overflow ${ui.documentScrollWidth}/${ui.documentClientWidth}`);
    let navigation,search;
    if(width===390){
      navigation=await page.evaluate(`(()=>{const links=[...document.querySelectorAll('#aesthetic-medicine-table-of-contents a[href^="#"]')];return{count:links.length,missing:links.map(a=>a.getAttribute('href')).filter(h=>!document.getElementById(decodeURIComponent(h.slice(1))))}})()`);
      if(navigation.count!==15||navigation.missing.length)fail(`TOC target contract ${JSON.stringify(navigation)}`);
      search=await page.evaluate(`(()=>{const input=document.getElementById('guide-search-input'),results=document.getElementById('guide-search-results');input.value='بوتاکس میگرن';input.dispatchEvent(new Event('input',{bubbles:true}));return[...results.querySelectorAll('a')].map(a=>{const href=a.getAttribute('href');return{href,text:a.textContent.trim(),targetExists:Boolean(href&&document.getElementById(decodeURIComponent(href.slice(1))))}})})()`);
      if(search.length!==2||search.some(row=>!row.targetExists))fail(`Guide search migraine-Botox contract ${JSON.stringify(search)}`);
    }
    const errors=consoleFailures(page);if(errors.length)fail(`${width}px console errors: ${errors.join(' | ')}`);
    return {width,ui,navigation,search};
  }finally{await page.close()}
}

const videoCases=[
  {slug:'thread-lift-workshop',id:'video-saeed-ghezelbash-thread-lift-workshop',time:8},
  {slug:'jalupro-vs-profhilo',id:'video-saeed-ghezelbash-jalupro-vs-profhilo',time:6},
  {slug:'subcision-technique',id:'video-saeed-ghezelbash-subcision-technique',time:7},
  {slug:'kurdish-patient-review',id:'video-saeed-ghezelbash-kurdish-patient-review',time:4},
];
async function videoDeepLink(test){
  const page=await CdpPage.open(),rangeStart=rangeRequests.length;
  try{
    await page.viewport(390,844);
    await page.navigate(`${origin}/?video=${encodeURIComponent(test.slug)}&t=${test.time}#${test.id}`);
    const state=await waitUntil(page,`(()=>{const v=document.getElementById(${JSON.stringify(test.id)});return v&&v.readyState>=1&&Math.abs(v.currentTime-${test.time})<=0.75?{readyState:v.readyState,currentTime:v.currentTime,src:v.currentSrc}:false})()`,{timeout:30000,interval:150});
    const requests=rangeRequests.slice(rangeStart).filter(row=>row.path.includes(test.slug));
    if(!requests.length)fail(`${test.slug} metadata/deep-link load did not use an HTTP Range request`);
    const errors=consoleFailures(page);if(errors.length)fail(`${test.slug} console errors: ${errors.join(' | ')}`);
    return {...test,state,rangeRequests:requests.length};
  }finally{await page.close()}
}

function localPath(raw){
  try{const url=new URL(raw,'https://www.ghezelbaash.ir/');if(!['www.ghezelbaash.ir','127.0.0.1'].includes(url.hostname))return null;return `${url.pathname}${url.search}`}catch{return null}
}
async function crawlMachineSurface(){
  const html=await readFile(path.join(dist,'index.html'),'utf8'),manifest=JSON.parse(await readFile(path.join(dist,'site.webmanifest'),'utf8'));
  const paths=new Set(['/','/404.html','/site.webmanifest','/graph.jsonld','/graph.ttl','/entity-facts.csv','/answers.txt','/knowledge.xml','/llms.txt','/llms-full.txt','/index.md','/datapackage.json','/linkset.json','/void.ttl','/dcat.ttl','/croissant.json','/provenance.jsonld','/evidence-snapshot.json','/shapes.ttl','/sitemap.xml','/doctor.vcf','/clinic.vcf']);
  const allowed=new Set(['.html','.css','.json','.jsonld','.webmanifest','.xml','.vcf','.ttl','.txt','.md','.csv']);
  for(const match of html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)){const candidate=localPath(match[1]);if(candidate&&allowed.has(path.extname(new URL(candidate,origin).pathname)))paths.add(candidate)}
  for(const icon of [...(manifest.icons||[]),...(manifest.shortcuts||[]).flatMap(shortcut=>shortcut.icons||[])])if(icon?.src)paths.add(icon.src);
  const failures=[];
  for(const pathname of [...paths].sort()){
    const response=await fetch(origin+pathname,{headers:{'User-Agent':'Ghezelbash-Browser-Release-Gate/1.0'}});
    if(response.status!==200)failures.push({pathname,status:response.status});
    await response.body?.cancel();
  }
  const missing=await fetch(`${origin}/__release_gate_missing__`);if(missing.status!==404)failures.push({pathname:'/__release_gate_missing__',status:missing.status,expected:404});await missing.body?.cancel();
  if(failures.length)fail(`internal crawl failures: ${JSON.stringify(failures)}`);
  return {checked:paths.size,real404:true};
}

let result;
try{
  const delayed=[];for(const width of [320,390,430])delayed.push(await delayedGeometry(width));
  const responsive=[];for(const width of [320,360,390,430])responsive.push(await responsiveUi(width));
  const videos=[];for(const test of videoCases)videos.push(await videoDeepLink(test));
  const crawl=await crawlMachineSurface();
  result={valid:true,chromePath,delayed,responsive:responsive.map(row=>({width:row.width,maxOverflow:Math.max(0,...row.ui.rows.map(item=>item.scrollWidth-item.clientWidth)),toc:row.navigation?.count,searchResults:row.search?.length})),videos,crawl};
  console.log(JSON.stringify(result,null,2));
}finally{
  chrome.kill('SIGTERM');
  await Promise.race([new Promise(resolve=>chrome.once('exit',resolve)),delay(3000)]);
  if(chrome.exitCode===null)chrome.kill('SIGKILL');
  await new Promise(resolve=>server.close(resolve));
  await rm(profile,{recursive:true,force:true});
}
