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
const emittedHeaders=await fs.readFile(path.join(distDir,'_headers'),'utf8');
const csp=emittedHeaders.match(/^\s+Content-Security-Policy: (.+)$/m)?.[1];
assert(csp&&!csp.includes("'unsafe-inline'"),'Browser verifies final emitted hardened CSP');
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');const logical=url.pathname;
  const rel=htmlPaths.has(logical)?(logical==='/'?'index.html':logical.slice(1)+'.html'):logical.slice(1);
  const file=path.resolve(distDir,rel);if(!file.startsWith(distDir+'/'))throw new Error('path');
  const bytes=await fs.readFile(file);const type={'.html':'text/html; charset=utf-8','.json':'application/json','.vtt':'text/vtt','.js':'text/javascript','.css':'text/css','.mp4':'video/mp4','.webm':'video/webm','.jsonld':'application/ld+json','.ttl':'text/turtle','.webp':'image/webp','.avif':'image/avif','.woff2':'font/woff2','.jpg':'image/jpeg','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream';
  res.setHeader('Content-Type',type);res.setHeader('Accept-Ranges','bytes');
  res.setHeader('Content-Security-Policy',csp);
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
  await context.addInitScript(()=>{window.cspViolations=[];document.addEventListener('securitypolicyviolation',event=>window.cspViolations.push({directive:event.effectiveDirective,blocked:event.blockedURI}));});
  const page=await context.newPage();const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>requests.push(new URL(request.url()).pathname));
  // Delay only the runtime so we can capture the original static primary state.
  let releaseRuntime;const hold=new Promise(resolve=>releaseRuntime=resolve);
  await page.route('**/assets/reader.*.js',async request=>{await hold;await request.continue();});
  await page.goto(local+route,{waitUntil:'commit'});
  await page.waitForSelector('article.medical-guide h1');
  const snapshot=()=>page.evaluate(()=>{const article=document.querySelector('article.medical-guide').cloneNode(true);for(const dynamic of article.querySelectorAll('[data-clinic-open-status],[data-guide-search-open],#guide-search'))dynamic.remove();return {title:document.title,canonical:document.querySelector('link[rel="canonical"]').href,h1:document.querySelector('h1').textContent,primary:article.textContent.replace(/\s+/g,' ').trim(),social:JSON.stringify([...document.head.querySelectorAll('meta[name="description"],meta[name="author"],meta[property^="og:"],meta[property^="profile:"],meta[name^="twitter:"]')].map(node=>node.outerHTML)),ld:document.querySelector('script[type="application/ld+json"]').textContent};});
  const before=await snapshot();releaseRuntime();
  if(route!=='/')await page.waitForSelector('[data-guide-reader] [data-guide-context="after"]',{state:'attached',timeout:30000});
  else await page.waitForFunction(()=>typeof window.syncGuidePageState==='function');
  const after=await snapshot();for(const key of Object.keys(before))assert.equal(key==='ld'?await semanticFingerprint(JSON.parse(after[key])):createHash('sha256').update(after[key]).digest('hex'),key==='ld'?await semanticFingerprint(JSON.parse(before[key])):createHash('sha256').update(before[key]).digest('hex'),'Semantic ownership '+key+' '+route);
  assert.equal(await page.locator('article.medical-guide').count(),1,'One primary article '+route);assert.equal(await page.locator('h1').count(),1,'One H1 '+route);
  assert.equal(await page.locator('script[type="application/ld+json"]').count(),1,'One route-specific graph '+route);
  if(route!=='/'){assert.equal(await page.locator('[data-guide-context]').count(),2,'Surrounding Home reader context '+route);assert((await page.locator('[data-guide-context]').allTextContents()).join('').length>1000,'Substantive surrounding context '+route);}
  assert.deepEqual(errors,[],'Browser errors '+route);
  if(route!=='/'){
   assert.equal(requests.filter(p=>/^\/assets\/guide\.[a-f0-9]{12}\.json$/.test(p)).length,1,'One shared content payload '+route);
   assert(!requests.includes('/'),'Internal entry does not fetch full Home '+route);
   assert(!requests.some(p=>p.startsWith('/assets/guide-meta.')),'Home graph stays deferred '+route);
  }
  assert.deepEqual(await page.evaluate(()=>window.cspViolations),[],'Reader and external styles load without CSP violations '+route);
  if(route==='/botox'){
   await page.evaluate(()=>{const script=document.createElement('script');script.textContent='window.inlineBreakoutExecuted=true';document.body.append(script);});
   await page.waitForFunction(()=>window.cspViolations.some(v=>v.directive==='script-src-elem'&&v.blocked==='inline'));
   assert.equal(await page.evaluate(()=>window.inlineBreakoutExecuted),undefined,'Actual CSP blocks injected inline executable script');
   const navigation=page.locator('article.medical-guide nav[data-topic-navigation] a').first();
   const destination=await navigation.getAttribute('href');
   assert(htmlPaths.has(destination)&&destination!==route,'Contextual link targets another canonical route');
   await navigation.click();await page.waitForURL(local+destination);
   await page.waitForFunction(url=>document.querySelector('link[rel="canonical"]')?.href===url,source.canonicalOrigin+destination);
   assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),source.canonicalOrigin+destination,'Contextual navigation retains destination ownership');
   assert.equal(await page.locator('article.medical-guide').count(),1);
  }
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
   const chapters=page.locator('article.medical-guide #'+route.slice(1)+'-chapters');
   if(!await chapters.evaluate(node=>node.open))await chapters.locator('summary').click();
   const lastClip=source.graph['@graph'].find(n=>n['@id']===[video.hasPart].flat().at(-1)['@id']);
   const chapterLink=chapters.locator('a[href]').last();
   assert.equal(new URL(await chapterLink.getAttribute('href'),source.canonicalOrigin).href,lastClip.url,'Visible chapter uses the canonical Clip URL '+route);
   await chapterLink.click();
   await page.waitForURL(local+route+'?t='+lastClip.startOffset);
   await page.waitForFunction(seconds=>{const v=document.querySelector('article.medical-guide video');return v?.readyState>=1&&Math.abs(v.currentTime-seconds)<0.25;},lastClip.startOffset,{timeout:30000});
   const afterChapter=await snapshot();
   for(const key of ['title','canonical','h1','ld'])assert.equal(afterChapter[key],before[key],'Chapter navigation preserves route identity '+key+' '+route);
   await page.goto(local+route+'?video='+route.slice('/video-saeed-ghezelbash-'.length)+'&t='+clip.startOffset,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(seconds=>{const v=document.querySelector('article.medical-guide video');return v?.readyState>=1&&Math.abs(v.currentTime-seconds)<0.25;},clip.startOffset,{timeout:30000});
   assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),source.canonicalOrigin+route,'Previously published timestamp URLs remain supported '+route);
   if(video.caption){
    const captions=page.locator('article.medical-guide track[kind="captions"]');
    await page.waitForFunction(()=>document.querySelector('article.medical-guide track[kind="captions"]')?.readyState===2);
    assert.equal(await captions.evaluate(track=>track.track.mode),'showing','Speech captions are available without opening a menu '+route);
    assert(await captions.evaluate(track=>track.track.cues.length)>0,'Native player loads actual WebVTT cues '+route);
    const transcript=page.locator('article.medical-guide [data-video-transcript]');
    if(!await transcript.evaluate(node=>node.open))await transcript.locator('summary').click();
    const last=transcript.locator('a[href]').last(),timestamp=Number(new URL(await last.getAttribute('href'),source.canonicalOrigin).searchParams.get('t'));
    await last.click();await page.waitForURL(local+route+'?t='+timestamp);
    await page.waitForFunction(seconds=>Math.abs(document.querySelector('article.medical-guide video')?.currentTime-seconds)<.25,timestamp);
    await page.waitForFunction(href=>document.querySelector('article.medical-guide [data-video-transcript] a[aria-current="true"]')?.getAttribute('href')===href,await last.getAttribute('href'));
    assert.equal(await transcript.locator('a[aria-current="true"]').getAttribute('href'),await last.getAttribute('href'),'Speech highlight follows the selected sentence '+route);
   }
  }
  if(route==='/'){
   const destination=source.discovery.sitemapPolicy.videoWatchPages.find(w=>w.path==='/video-saeed-ghezelbash-subcision-technique');
   const video=source.graph['@graph'].find(n=>n['@id']===destination.videoId);
   const clip=source.graph['@graph'].find(n=>n['@id']===[video.hasPart].flat()[2]['@id']);
   const chapters=page.locator('#'+destination.path.slice(1)+'-chapters');
   for(const detail of await chapters.locator('xpath=ancestor-or-self::details').all()){
    if(!await detail.evaluate(node=>node.open))await detail.locator(':scope > summary').click();
   }
   await chapters.locator('a[href]').nth(2).click();
   await page.waitForURL(local+destination.path+'?t='+clip.startOffset);
   await page.waitForFunction(url=>document.querySelector('link[rel="canonical"]')?.href===url,source.canonicalOrigin+destination.path);
   await page.waitForFunction(seconds=>{const v=document.querySelector('article.medical-guide video');return v?.readyState>=1&&Math.abs(v.currentTime-seconds)<0.25;},clip.startOffset,{timeout:30000});
   assert.equal(await page.locator('article.medical-guide').count(),1,'Home chapter navigation has one focused primary article');
   const focusedLd=JSON.parse((await snapshot()).ld);
   const focusedPage=focusedLd['@graph'].find(n=>n['@id']===source.canonicalOrigin+destination.path+'#webpage');
   assert.equal(focusedPage.mainEntity['@id'],destination.videoId,'Home chapter navigation retains watch mainEntity');
   await page.goBack();await page.waitForURL(local+'/');
   await page.waitForFunction(url=>document.querySelector('link[rel="canonical"]')?.href===url,source.canonicalOrigin+'/');
   const restored=await snapshot();
   for(const key of Object.keys(before))assert.equal(key==='ld'?await semanticFingerprint(JSON.parse(restored[key])):restored[key],key==='ld'?await semanticFingerprint(JSON.parse(before[key])):before[key],'Chapter Back restores Home '+key);
  }
  results.push({route,ownership:'PASS',csp:'PASS',readerContext:route==='/'?'Home':'PASS',contextualNavigation:route==='/botox'?'PASS':undefined,timestampSeek:watch?'PASS':undefined,chapterNavigation:watch?'PASS':undefined,legacyTimestampSeek:watch?'PASS':undefined,homeChapterAndBack:route==='/'?'PASS':undefined});await context.close();
 }
 // A cold internal entry must still restore the full Home graph on navigation,
 // then restore its own semantic ownership on Back without reloading the guide.
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage(),requests=[];
 page.on('request',request=>requests.push(new URL(request.url()).pathname));
 await page.goto(local+'/botox');
 await page.waitForFunction(()=>document.documentElement.classList.contains('js')&&document.querySelectorAll('[data-guide-context]').length===2);
 assert(!requests.includes('/'),'Cold internal entry skips Home document');
 assert(!requests.some(p=>p.startsWith('/assets/guide-meta.')),'Cold internal entry skips Home graph');
 await page.evaluate(()=>{const a=document.createElement('a');a.href='/';a.id='reader-home-test';a.textContent='Home';document.querySelector('main article').prepend(a);});
 await page.locator('#reader-home-test').click();await page.waitForURL(local+'/');
 await page.waitForFunction(url=>document.querySelector('link[rel="canonical"]')?.href===url,source.canonicalOrigin+'/');
 const restoredGraph=await page.locator('script[type="application/ld+json"]').textContent();
 assert.equal(await semanticFingerprint(JSON.parse(restoredGraph)),await semanticFingerprint(source.graph),'Internal-to-Home restores complete canonical graph');
 assert.equal(requests.filter(p=>p.startsWith('/assets/guide-meta.')).length,1,'Home metadata loads once when needed');
 assert(!requests.includes('/'),'Internal-to-Home uses the shared article without full-document refetch');
 await page.goBack();await page.waitForURL(local+'/botox');
 await page.waitForFunction(url=>document.querySelector('link[rel="canonical"]')?.href===url,source.canonicalOrigin+'/botox');
 assert.equal(await page.locator('h1').count(),1,'Back restores one focused primary heading');
 assert.equal(await page.locator('[data-guide-context]').count(),2,'Back restores surrounding complete guide');
 await page.locator('#guide-search-input').fill('بوتاکس');
 assert(await page.locator('#guide-search-results a').count()>0,'Complete-guide search works after Home and Back');
 await context.close();
 // A late Home graph must never overwrite a newer Back/route navigation.
 const racing=await browser.newContext({viewport:{width:390,height:844}}),race=await racing.newPage();
 let releaseMetadata,metadataRequested;
 const heldMetadata=new Promise(resolve=>releaseMetadata=resolve),requestedMetadata=new Promise(resolve=>metadataRequested=resolve);
 await race.route('**/assets/guide-meta.*.json',async request=>{metadataRequested();await heldMetadata;await request.continue();});
 await race.goto(local+'/botox');
 await race.waitForFunction(()=>document.documentElement.classList.contains('js')&&document.querySelectorAll('[data-guide-context]').length===2);
 const raceDestination=await race.locator('article.medical-guide nav[data-topic-navigation] a').first().getAttribute('href');
 assert(htmlPaths.has(raceDestination)&&raceDestination!=='/'&&raceDestination!=='/botox');
 await race.evaluate(destination=>{
  const sync=window.syncGuidePageState;window.readerHomeSyncComplete=false;
  window.syncGuidePageState=path=>{const pending=sync(path);if(path==='/')pending.finally(()=>window.readerHomeSyncComplete=true);return pending;};
  for(const [id,href] of [['reader-race-home','/'],['reader-race-next',destination]]){const a=document.createElement('a');a.id=id;a.href=href;a.textContent=id;document.querySelector('main article').prepend(a);}
 },raceDestination);
 await race.locator('#reader-race-home').click();await requestedMetadata;
 await race.waitForURL(local+'/');
 await race.goBack();await race.waitForURL(local+'/botox');
 await race.locator('#reader-race-next').click();await race.waitForURL(local+raceDestination);
 await race.waitForFunction(url=>document.querySelector('link[rel="canonical"]')?.href===url,source.canonicalOrigin+raceDestination);
 releaseMetadata();await race.waitForFunction(()=>window.readerHomeSyncComplete);
 assert.equal(new URL(race.url()).pathname,raceDestination,'Late Home metadata keeps newer navigation URL');
 assert.equal(await race.locator('link[rel="canonical"]').getAttribute('href'),source.canonicalOrigin+raceDestination,'Late Home metadata cannot replace newer ownership');
 assert.equal(await race.locator('h1').count(),1,'Overlapping navigation retains one primary H1');
 assert.equal(await race.locator('[data-guide-context]').count(),2,'Overlapping navigation retains complete surrounding context');
 await racing.close();
 const fallback=await browser.newPage();
 await fallback.route('**/assets/guide.*.json',request=>request.abort());
 await fallback.goto(local+'/botox');
 await fallback.waitForFunction(()=>document.querySelectorAll('[data-guide-context]').length===2);
 assert.equal(await fallback.locator('link[rel="canonical"]').getAttribute('href'),source.canonicalOrigin+'/botox','Unavailable payload preserves native Home fallback and focused identity');
 await fallback.close();
 console.log(JSON.stringify({localBrowserVerification:'PASS',edgeBehavior:'UNVERIFIED LIVE GATE',results},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
