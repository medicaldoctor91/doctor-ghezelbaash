import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {createReadStream,constants as fsConstants} from 'node:fs';
import {access,mkdtemp,rm,stat} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

const root=process.cwd(),dist=path.resolve(root,process.argv[2]||'dist');
const fail=message=>{throw new Error(`Browser CSS convergence gate: ${message}`)};
await access(path.join(dist,'index.html'));
const chromeCandidates=[process.env.CHROME_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
let chromePath;
for(const candidate of chromeCandidates)if(await access(candidate,fsConstants.X_OK).then(()=>true).catch(()=>false)){chromePath=candidate;break}
if(!chromePath)fail('Chrome/Chromium executable not found; set CHROME_PATH');

const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.jsonld':'application/ld+json; charset=utf-8','.xml':'application/xml; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.woff2':'font/woff2','.mp4':'video/mp4','.webm':'video/webm','.vtt':'text/vtt; charset=utf-8','.ttl':'text/turtle; charset=utf-8','.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8','.csv':'text/csv; charset=utf-8'};
const cssWaiters=[];let releaseCss=false;
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/','http://127.0.0.1');
    let rel=decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if(!rel)rel='index.html';
    let abs=path.resolve(dist,rel);
    if(abs!==dist&&!abs.startsWith(dist+path.sep))return res.writeHead(403).end('Forbidden');
    let s=await stat(abs).catch(()=>null);
    if(s?.isDirectory()){abs=path.join(abs,'index.html');s=await stat(abs).catch(()=>null)}
    if(!s?.isFile())return res.writeHead(404,{'Content-Type':'text/plain'}).end('Not found');
    if(/\/assets\/site\.[0-9a-f]{12}\.css$/i.test(url.pathname)&&!releaseCss)await new Promise(resolve=>cssWaiters.push(resolve));
    const ext=path.extname(abs).toLowerCase();
    res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Content-Length':s.size,'Cache-Control':'no-store'});
    createReadStream(abs).pipe(res);
  }catch(error){res.writeHead(500,{'Content-Type':'text/plain'}).end(String(error?.stack||error))}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const serverPort=server.address().port;
const freePort=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
const profile=await mkdtemp(path.join(os.tmpdir(),'ghezelbaash-css-gate-'));
const chrome=spawn(chromePath,[`--remote-debugging-port=${freePort}`,'--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--metrics-recording-only','about:blank'],{stdio:['ignore','ignore','pipe']});
let chromeErr='';chrome.stderr.on('data',d=>{chromeErr+=d.toString()});

async function json(url,options){const r=await fetch(url,options);if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json()}
let version;
for(let i=0;i<80;i++){try{version=await json(`http://127.0.0.1:${freePort}/json/version`);break}catch{await delay(100)}}
if(!version)fail(`Chrome DevTools endpoint did not start: ${chromeErr.slice(-1200)}`);

class Cdp{
  constructor(ws){this.ws=ws;this.seq=0;this.pending=new Map();this.waiters=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);return}const list=this.waiters.get(m.method)||[];this.waiters.delete(m.method);for(const r of list)r(m.params)}}
  send(method,params={}){const id=++this.seq;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}))})}
  wait(method,timeout=10000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`CDP timeout ${method}`)),timeout);const list=this.waiters.get(method)||[];list.push(params=>{clearTimeout(timer);resolve(params)});this.waiters.set(method,list)})}
}
async function openPage(){
  const target=await json(`http://127.0.0.1:${freePort}/json/new?${encodeURIComponent('about:blank')}`,{method:'PUT'});
  const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=()=>reject(new Error('CDP websocket open failed'))});
  return new Cdp(ws);
}
const evalValue=(cdp,expression)=>cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}).then(r=>r.result.value);
const snapshotExpression=`(()=>{const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{x:r.x,y:r.y,width:r.width,height:r.height,paddingTop:s.paddingTop,paddingRight:s.paddingRight,paddingBottom:s.paddingBottom,paddingLeft:s.paddingLeft,fontSize:s.fontSize,lineHeight:s.lineHeight}};const top=document.querySelector('.quick-actions__top'),item=document.querySelector('.quick-actions__item'),small=document.querySelector('.quick-actions__consultation-copy small');return{main:rect(document.querySelector('main')),h1:rect(document.querySelector('h1')),hero:rect(document.querySelector('.entity-hero')),heroFigure:rect(document.querySelector('.hero-figure')),top:rect(top),topBefore:top?getComputedStyle(top,'::before').inset:null,item:rect(item),itemFont:item?getComputedStyle(item).fontSize:null,smallFont:small?getComputedStyle(small).fontSize:null,scrollWidth:document.documentElement.scrollWidth,innerWidth:innerWidth,stylesheetRel:document.querySelector('link[data-deferred-stylesheet]')?.rel||null}})()`;
const num=v=>Number.parseFloat(String(v));
const close=(a,b,t=0.35)=>Math.abs(num(a)-num(b))<=t;
const compareRect=(name,a,b,props=['x','y','width','height','paddingTop','paddingRight','paddingBottom','paddingLeft'])=>{if(!a||!b)fail(`${name} missing from snapshot`);for(const p of props)if(!close(a[p],b[p]))fail(`${name}.${p} changed ${a[p]} -> ${b[p]}`)};

const widths=[320,360,390,430];
try{
  for(const width of widths){
    releaseCss=false;
    const cdp=await openPage();await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:true});
    const domReady=cdp.wait('Page.domContentEventFired',20000);await cdp.send('Page.navigate',{url:`http://127.0.0.1:${serverPort}/?gate=${width}`});await domReady;
    await evalValue(cdp,'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const before=await evalValue(cdp,snapshotExpression);
    await evalValue(cdp,`(()=>{window.__gateCls=0;new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput)window.__gateCls+=e.value}).observe({type:'layout-shift'});return true})()`);
    if(before.stylesheetRel!=='preload')fail(`${width}px deferred stylesheet activated before initial snapshot`);
    if(before.scrollWidth>before.innerWidth+1)fail(`${width}px horizontal overflow before deferred CSS: ${before.scrollWidth}/${before.innerWidth}`);
    releaseCss=true;while(cssWaiters.length)cssWaiters.shift()();
    for(let i=0;i<100;i++){const active=await evalValue(cdp,`document.querySelector('link[data-deferred-stylesheet]')?.rel==='stylesheet'&&[...document.styleSheets].some(s=>/\/assets\/site\.[0-9a-f]{12}\.css$/.test(s.href||''))`);if(active)break;if(i===99)fail(`${width}px deferred stylesheet did not activate`);await delay(50)}
    await evalValue(cdp,'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const after=await evalValue(cdp,snapshotExpression),cls=await evalValue(cdp,'window.__gateCls||0');
    compareRect(`${width}px main`,before.main,after.main,['x','y','width','paddingTop','paddingRight','paddingBottom','paddingLeft']);
    compareRect(`${width}px h1`,before.h1,after.h1,['x','y','width','height','fontSize','lineHeight']);
    compareRect(`${width}px hero`,before.hero,after.hero);
    compareRect(`${width}px heroFigure`,before.heroFigure,after.heroFigure);
    compareRect(`${width}px quick-actions top`,before.top,after.top);
    compareRect(`${width}px quick-actions item`,before.item,after.item,['width','height','paddingRight','paddingLeft']);
    if(before.topBefore!==after.topBefore)fail(`${width}px quick-actions ::before inset changed ${before.topBefore} -> ${after.topBefore}`);
    if(!close(before.itemFont,after.itemFont,.05))fail(`${width}px dock item font changed ${before.itemFont} -> ${after.itemFont}`);
    if(!close(before.smallFont,after.smallFont,.05))fail(`${width}px dock small font changed ${before.smallFont} -> ${after.smallFont}`);
    if(after.scrollWidth>after.innerWidth+1)fail(`${width}px horizontal overflow after deferred CSS: ${after.scrollWidth}/${after.innerWidth}`);
    if(cls>0.001)fail(`${width}px delayed CSS CLS ${cls}`);
    cdp.ws.close();
    console.log(`CSS_CONVERGENCE width=${width} cls=${cls.toFixed(6)} main=${before.main.width.toFixed(2)} dockTop=${before.top.width.toFixed(2)}`);
  }
  console.log('Browser CSS convergence validated at 320/360/390/430px with deferred stylesheet held until after initial geometry capture.');
}finally{
  releaseCss=true;while(cssWaiters.length)cssWaiters.shift()();
  server.close();chrome.kill('SIGTERM');await delay(150).catch(()=>{});await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
