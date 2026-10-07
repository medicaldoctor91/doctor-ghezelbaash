import {SOURCE as canonicalSource} from '../src/canonical/source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {semanticFingerprint} from './lib/rdf.mjs';
import {chromium} from 'playwright-core';

const root=path.resolve(new URL('../',import.meta.url).pathname),distDir=path.resolve(process.argv[2]??path.join(root,'dist'));
const source=canonicalSource;
const htmlPaths=new Set(source.routes.resources.map(r=>r.path));
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');const logical=url.pathname;
  const rel=htmlPaths.has(logical)?(logical==='/'?'index.html':logical.slice(1)+'.html'):logical.slice(1);
  const file=path.resolve(distDir,rel);if(!file.startsWith(distDir+'/'))throw new Error('path');
  const bytes=await fs.readFile(file);const type={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.mp4':'video/mp4','.webm':'video/webm','.jsonld':'application/ld+json','.ttl':'text/turtle','.webp':'image/webp','.avif':'image/avif','.woff2':'font/woff2','.jpg':'image/jpeg','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream';
  res.setHeader('Content-Type',type);res.setHeader('Accept-Ranges','bytes');
  const range=/bytes=(\d+)-(\d*)/.exec(req.headers.range??'');
  if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':end-start+1});res.end(bytes.subarray(start,end+1));}else{res.setHeader('Content-Length',bytes.length);res.end(bytes);}
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const local='http://127.0.0.1:'+server.address().port;
const executable=process.env.PLAYWRIGHT_EXECUTABLE_PATH??(process.env.CI==='true'?chromium.executablePath():await fs.access('/usr/bin/chromium').then(()=>'/usr/bin/chromium',()=>'/usr/bin/google-chrome'));
const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try{
 const routes=source.routes.resources.map(r=>r.path);
 for(const route of routes){
  process.stderr.write('Testing reader '+route+'\n');
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Delay only the runtime so we can capture the original static primary state.
  let releaseRuntime;const hold=new Promise(resolve=>releaseRuntime=resolve);
  await page.route('**/assets/reader.*.js',async request=>{await hold;await request.continue();});
  await page.goto(local+route,{waitUntil:'commit'});
  await page.waitForSelector('article.medical-guide h1');
  const snapshot=()=>page.evaluate(()=>{const article=document.querySelector('article.medical-guide').cloneNode(true);for(const dynamic of article.querySelectorAll('[data-clinic-open-status],[data-guide-search-open],#guide-search'))dynamic.remove();return {title:document.title,canonical:document.querySelector('link[rel="canonical"]').href,h1:document.querySelector('h1').textContent,primary:article.textContent.replace(/\s+/g,' ').trim(),ld:document.querySelector('script[type="application/ld+json"]').textContent};});
  const before=await snapshot();releaseRuntime();
  if(route!=='/')await page.waitForSelector('[data-guide-reader] [data-guide-context="after"]',{state:'attached',timeout:30000});
  else await page.waitForFunction(()=>typeof window.syncGuidePageState==='function');
  const after=await snapshot();for(const key of Object.keys(before))assert.equal(key==='ld'?await semanticFingerprint(JSON.parse(after[key])):createHash('sha256').update(after[key]).digest('hex'),key==='ld'?await semanticFingerprint(JSON.parse(before[key])):createHash('sha256').update(before[key]).digest('hex'),'Semantic ownership '+key+' '+route);
  assert.equal(await page.locator('article.medical-guide').count(),1,'One primary article '+route);assert.equal(await page.locator('h1').count(),1,'One H1 '+route);
  assert.equal(await page.locator('script[type="application/ld+json"]').count(),1,'One route-specific graph '+route);
  if(route!=='/'){assert.equal(await page.locator('[data-guide-context]').count(),2,'Surrounding Home reader context '+route);assert((await page.locator('[data-guide-context]').allTextContents()).join('').length>1000,'Substantive surrounding context '+route);}
  assert.deepEqual(errors,[],'Browser errors '+route);
  const watch=source.discovery.sitemapPolicy.videoWatchPages.find(w=>w.path===route);
  if(watch){
   assert.equal(await page.locator('meta[property="og:image"]').getAttribute('content'),source.graph['@graph'].find(n=>n['@id']===watch.videoId).thumbnailUrl,'Watch-page social thumbnail');
   const video=source.graph['@graph'].find(n=>n['@id']===watch.videoId);const clip=source.graph['@graph'].find(n=>n['@id']===[video.hasPart].flat()[1]['@id']);
   await page.goto(local+route+'?t='+clip.startOffset,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(seconds=>{const video=document.querySelector('article.medical-guide video');return video?.readyState>=1&&Math.abs(video.currentTime-seconds)<0.25;},clip.startOffset,{timeout:30000});
   const duration=/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(video.duration);
   const declared=Number(duration[1]??0)*3600+Number(duration[2]??0)*60+Number(duration[3]??0);
   const playable=await page.locator('article.medical-guide video').evaluate(v=>v.duration);
   assert(Math.abs(playable-declared)<1,'Truthful rounded video duration '+route);
   for(const ref of [video.hasPart].flat()){const c=source.graph['@graph'].find(n=>n['@id']===ref['@id']);assert(c.startOffset<playable&&(c.endOffset===undefined||c.endOffset<=Math.ceil(playable)),'Clip within playable media '+route);}
  }
  results.push({route,ownership:'PASS',readerContext:route==='/'?'Home':'PASS',timestampSeek:watch?'PASS':undefined});await context.close();
 }
 console.log(JSON.stringify({localBrowserVerification:'PASS',edgeBehavior:'UNVERIFIED LIVE GATE',results},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
