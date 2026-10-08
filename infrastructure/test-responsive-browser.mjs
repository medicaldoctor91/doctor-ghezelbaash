import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {parse} from 'parse5';
import {chromium} from 'playwright-core';
import {SOURCE} from '../src/canonical/source.mjs';

const distDir=path.resolve(process.argv[2]??'dist');
const quick=process.argv.includes('--quick');
const shardArg=process.argv.find(arg=>arg.startsWith('--shard='));
const shard=shardArg?shardArg.slice(8).split('/').map(Number):[1,1];
assert(shard.length===2&&shard.every(Number.isInteger)&&shard[0]>=1&&shard[0]<=shard[1],'Shard must be index/count');
const viewports=[[360,800],[390,844],[393,852],[430,932],[768,1024],[1280,800],[1366,768],[1440,900],[1920,1080]];
const critical=new Set(['/','/botox','/complications-aftercare-and-follow-up',...SOURCE.discovery.sitemapPolicy.videoWatchPages.map(r=>r.path)]);
const allRoutes=SOURCE.routes.resources.map(r=>r.path);
const routes=allRoutes.filter(r=>!quick||critical.has(r)).filter((_,i)=>i%shard[1]===shard[0]-1);
const canonicalPaths=new Set(SOURCE.routes.resources.map(r=>r.path));
const expected=new Map();
const hash=value=>createHash('sha256').update(value).digest('hex');
const attr=(n,key)=>n.attrs?.find(a=>a.name===key)?.value;
const text=n=>n.nodeName==='#text'?n.value:(n.childNodes??[]).map(text).join('');
for(const route of allRoutes){
 const html=await fs.readFile(path.join(distDir,route==='/'?'index.html':route.slice(1)+'.html'),'utf8');
 const nodes=[];function walk(n){nodes.push(n);for(const c of n.childNodes??[])walk(c);}walk(parse(html));
 expected.set(route,{title:text(nodes.find(n=>n.tagName==='title')),h1:text(nodes.find(n=>n.tagName==='h1')),canonical:attr(nodes.find(n=>n.tagName==='link'&&attr(n,'rel')==='canonical'),'href'),ld:hash(text(nodes.find(n=>n.tagName==='script'&&attr(n,'type')==='application/ld+json')))});
}
const csp=(await fs.readFile(path.join(distDir,'_headers'),'utf8')).match(/^\s+Content-Security-Policy: (.+)$/m)?.[1];
assert(csp,'Use final generated CSP for responsive tests');
const server=http.createServer(async(req,res)=>{
 try{
  const logical=new URL(req.url,'http://localhost').pathname;
  const rel=canonicalPaths.has(logical)?(logical==='/'?'index.html':logical.slice(1)+'.html'):logical.slice(1);
  const file=path.resolve(distDir,rel);if(!file.startsWith(distDir+'/'))throw new Error('path');
  const bytes=await fs.readFile(file),type={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.mp4':'video/mp4','.webm':'video/webm'}[path.extname(file)]??'application/octet-stream';
  res.setHeader('Content-Type',type);res.setHeader('Content-Security-Policy',csp);res.setHeader('Accept-Ranges','bytes');
  const range=/bytes=(\d+)-(\d*)/.exec(req.headers.range??'');
  if(range){const start=+range[1],end=range[2]?Math.min(+range[2],bytes.length-1):bytes.length-1;res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':end-start+1});res.end(bytes.subarray(start,end+1));}else res.end(bytes);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const executable=process.env.PLAYWRIGHT_EXECUTABLE_PATH??(process.env.CI==='true'?chromium.executablePath():'/usr/bin/chromium');
const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[],failures=[];
try{
 const context=await browser.newContext({viewport:{width:360,height:800},reducedMotion:'reduce'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 const page=await context.newPage();await page.addInitScript(()=>sessionStorage.clear());
 for(const route of routes){
  for(const [width,height] of viewports){
   process.stderr.write('Responsive '+route+' '+width+'x'+height+'\n');
   await page.setViewportSize({width,height});
   // Test entry on both smallest mobile and desktop for every route. Critical
   // pages enter at every viewport; other pages additionally exercise live resize.
   const entry=width===360||width===1440||critical.has(route);
   if(entry){await page.goto(origin+route,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>typeof window.syncGuidePageState==='function');if(route!=='/')await page.waitForSelector('[data-guide-context="after"]',{state:'attached'});}
   else await page.locator('h1').evaluate(h=>h.scrollIntoView({block:'start',behavior:'instant'}));
   await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   const m=await page.evaluate(()=>{
    const article=document.querySelector('article.medical-guide'),heading=article.querySelector('h1');
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
    const media=[...article.querySelectorAll('img,video')].filter(visible).map(e=>({tag:e.tagName,...rect(e)}));
    const overflow=[...article.querySelectorAll('*')].filter(e=>{if(!visible(e)||e.closest('table,.visually-hidden'))return false;const r=e.getBoundingClientRect();return r.left< -1||r.right>document.documentElement.clientWidth+1;}).slice(0,8).map(e=>({tag:e.tagName,id:e.id,...rect(e)}));
    const controls=[...document.querySelectorAll('.hero-action,.quick-actions__item,.quick-actions__top,article.medical-guide summary,[data-topic-navigation] a')].filter(visible).map(e=>({tag:e.tagName,...rect(e)}));
    const body=rect(document.body);
    const summaryMargins=[...document.querySelectorAll('.multilingual-collapsible-section > summary > h2')].map(e=>parseFloat(getComputedStyle(e).marginBlockStart));
    return {clientWidth:document.documentElement.clientWidth,layoutCenter:body.x+body.width/2,scrollWidth:document.documentElement.scrollWidth,primary:rect(article),heading:rect(heading),h1Font:parseFloat(getComputedStyle(heading).fontSize),bodyFont:parseFloat(getComputedStyle(article).fontSize),overflow,media,controls,summaryMargins,title:document.title,h1:heading.textContent,canonical:document.querySelector('link[rel="canonical"]').href,ld:document.querySelector('script[type="application/ld+json"]').textContent,articleCount:document.querySelectorAll('article.medical-guide').length,h1Count:document.querySelectorAll('h1').length};
   });
   const label=route+' '+width+'x'+height;
   const checks=[];const check=(ok,message)=>{if(!ok){failures.push(label+': '+message);checks.push(message);}};
   check(m.scrollWidth<=m.clientWidth+1,'No document horizontal overflow');check(m.overflow.length===0,'No primary content outside viewport '+JSON.stringify(m.overflow));
   check(m.heading.x>=-1&&m.heading.right<=m.clientWidth+1,'H1 fits horizontally');
   if(entry)check(m.heading.y>=-2&&m.heading.bottom<=height-60,'Entire H1 visible on entry');
   check(m.bodyFont>=15.9,'Readable body font');
   if(width<=430)check(m.primary.width>=width-68,'Mobile primary text measure is comfortable');
   if(width>=1280&&route!=='/'){check(m.primary.width<=800,'Bounded desktop article width');check(Math.abs(m.primary.x+m.primary.width/2-m.layoutCenter)<=2,'Centered desktop article');check(m.h1Font<=44,'Proportionate focused H1');}
   check(m.media.every(e=>e.width<=m.primary.width+1&&e.x>=m.primary.x-1&&e.right<=m.primary.right+1),'Responsive media contained in article');
   check(m.controls.every(e=>e.height>=43.5),'Tap controls at least 44px high');
   check(m.summaryMargins.every(margin=>margin===0),'No excess multilingual summary heading margin');
   const exp=expected.get(route);for(const k of ['title','h1','canonical'])check(m[k]===exp[k],'Unchanged '+k);check(hash(m.ld)===exp.ld,'Unchanged JSON-LD/mainEntity');check(m.articleCount===1&&m.h1Count===1,'Sole primary article/H1');
   results.push({route,viewport:{width,height},entry,primary:m.primary,heading:m.heading,h1Font:m.h1Font,bodyFont:m.bodyFont,scrollWidth:m.scrollWidth,failures:checks});
  }
 }
 // Actual in-reader navigation, keyboard focus and history restoration.
 for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
  await page.setViewportSize(viewport);await page.goto(origin+'/botox',{waitUntil:'domcontentloaded'});await page.waitForSelector('[data-guide-context="after"]',{state:'attached'});
  const link=page.locator('article.medical-guide [data-topic-navigation] a').first();await link.scrollIntoViewIfNeeded();await link.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  assert.equal(await link.evaluate(e=>document.activeElement===e),true,'Contextual links retain keyboard focus');
  const destination=await link.getAttribute('href');await link.click();await page.waitForFunction(url=>document.querySelector('link[rel="canonical"]')?.href===url,SOURCE.canonicalOrigin+destination);
  await page.goBack();await page.waitForFunction(url=>document.querySelector('link[rel="canonical"]')?.href===url,SOURCE.canonicalOrigin+'/botox');
  assert.equal(await page.locator('h1').textContent(),expected.get('/botox').h1,'Back restores focused H1');
  assert.equal(await page.locator('article.medical-guide').count(),1);assert.equal(await page.locator('[data-guide-context]').count(),2);
 }
 await context.close();console.log(JSON.stringify({responsiveBrowser:failures.length?'FAIL':'PASS',shard,routes:routes.length,viewports,checks:results.length,navigationBackKeyboard:'PASS',failures,results},null,2));
 assert.deepEqual(failures,[],'Responsive layout contracts');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
