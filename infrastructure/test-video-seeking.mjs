import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {SOURCE,AUTHORED_BODY} from '../src/canonical/source.mjs';
import {generateHeaders} from './lib/headers.mjs';

// Exercise the actual bounded reader function with native media, not media-property mocks.
// The complete reader/route/history contracts are independently tested by test-reader-browser.
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const args=process.argv.slice(2),distArg=args.find(arg=>!arg.startsWith('--'));
const dist=distArg?path.resolve(distArg):null;
const headerlessDiagnostic=args.includes('--diagnostic-headerless');
const route='/video-saeed-ghezelbash-jalupro-vs-profhilo';
const mediaPath='/media/videos/education/saeed-ghezelbash-jalupro-vs-profhilo.mp4';
const media=await fs.readFile(path.join(dist??path.join(root,'public'),mediaPath.slice(1)));
const watchMarkup=dist?await fs.readFile(path.join(dist,route.slice(1)+'.html'),'utf8'):AUTHORED_BODY;
const authoredVideo=[...watchMarkup.matchAll(/<video\b[^>]*>[\s\S]*?<\/video>/g)].map(match=>match[0]).find(video=>video.includes('id="'+route.slice(1)+'"'));
assert(authoredVideo,'Actual authored watch video is available');
const authoredSourceTags=[...authoredVideo.matchAll(/<source\b[^>]*>/g)].map(match=>match[0]);
assert.equal(authoredSourceTags.length,2,'Actual watch has its authored WebM and MP4 alternatives');
const webmPath=/\bsrc="([^"]+)"/.exec(authoredSourceTags[0])?.[1];
assert(webmPath?.endsWith('.webm')&&authoredSourceTags[1].includes('src="'+mediaPath+'"'),'Preserve actual WebM-first and MP4-second source order');
const webm=await fs.readFile(path.join(dist??path.join(root,'public'),webmPath.slice(1)));
const mediaFiles=new Map([[mediaPath,{bytes:media,mime:'video/mp4'}],[webmPath,{bytes:webm,mime:'video/webm'}]]);
const emittedHeaders=dist?await fs.readFile(path.join(dist,'_headers'),'utf8'):generateHeaders({origin:SOURCE.canonicalOrigin,routes:SOURCE.routes.resources.map(resource=>resource.path),cssPath:'/assets/native-fixture.css',delivery:SOURCE.delivery,machineResources:SOURCE.machineResources});
const cachePolicyFor=resourcePath=>emittedHeaders.trim().split(/\n\s*\n/).map(block=>block.split('\n')).filter(([pattern])=>pattern===resourcePath||pattern.endsWith('/*')&&resourcePath.startsWith(pattern.slice(0,-1))).flatMap(([, ...lines])=>lines).filter(line=>/^\s+Cache-Control:/.test(line)).at(-1)?.replace(/^\s+Cache-Control:\s*/, '');
const mediaCacheControl=cachePolicyFor(mediaPath);
assert(mediaCacheControl,'Native fixture uses the actual media response cache policy');
for(const [resourcePath,resource]of mediaFiles){resource.cacheControl=cachePolicyFor(resourcePath);assert(resource.cacheControl,'Actual response cache policy for '+resourcePath);}
let runtime;
if(dist){
 const html=await fs.readFile(path.join(dist,route.slice(1)+'.html'),'utf8');
 const script=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(match=>match[1]).find(src=>/^\/assets\/reader\.[a-f0-9]+\.js$/.test(src));
 assert(script,'Final watch links its emitted fingerprinted reader runtime');
 runtime=await fs.readFile(path.join(dist,script.slice(1)),'utf8');
}else{
 const source=await fs.readFile(path.join(root,'src/pages/index.astro'),'utf8');
 const start=source.indexOf('export const READER_RUNTIME = ')+'export const READER_RUNTIME = '.length;
 const end=source.indexOf('export function compileCanonicalSource()',start);
 assert(start>= 'export const READER_RUNTIME = '.length&&end>start,'Actual authored reader runtime export');
 runtime=Function('return '+source.slice(start,end).trim())();
}
const parserStart=runtime.indexOf('const videoFromUrl = ');
const selectionStart=runtime.indexOf('let highlightedVideo',parserStart);
const selectionEnd=runtime.indexOf('let navigationTicket',selectionStart);
assert(parserStart>=0&&selectionStart>parserStart&&selectionEnd>selectionStart,'Actual reader timestamp selection boundary');
const nativeSelection=runtime.slice(parserStart,selectionEnd);
const fixtureRuntime=`
const d=document, video=d.querySelector('video[data-selected]');
const revealPoster=()=>{}, moveTo=()=>{}, focusTarget=()=>{};
const targetFromPath=pathname=>pathname===${JSON.stringify(route)}?video:null;
window.__native={events:[],seeked:[],seekEpochs:[],seekFrameObservations:[],seekFrames:[],playFrames:[],playRequests:[]};
const sample=event=>({event,at:performance.now(),time:video.currentTime,paused:video.paused,readyState:video.readyState,seeking:video.seeking,currentSrc:video.currentSrc,seekable:Array.from({length:video.seekable.length},(_,i)=>[video.seekable.start(i),video.seekable.end(i)])});
let seekEpochId=0,activeSeekEpoch;
const associateTerminalFrame=epoch=>{
 if(!epoch?.completion||!epoch.frames.length)return;
 const terminal={...epoch.frames.at(-1),completion:epoch.completion};
 const index=window.__native.seekFrames.findIndex(frame=>frame.epoch===epoch.id);
 if(index<0)window.__native.seekFrames.push(terminal);else window.__native.seekFrames[index]=terminal;
};
for(const name of ['loadedmetadata','loadeddata','progress','seeking','seeked','play','playing','pause','ended','error'])video.addEventListener(name,()=>{
 const observation=sample(name);window.__native.events.push(observation);
 if(name==='seeked'){
  window.__native.seeked.push(observation);
  if(activeSeekEpoch?.currentSrc===observation.currentSrc){activeSeekEpoch.completion=observation;associateTerminalFrame(activeSeekEpoch);}
 }
 if(name==='seeking'){
  const epoch={id:++seekEpochId,currentSrc:observation.currentSrc,start:observation,completion:null,frames:[]};activeSeekEpoch=epoch;window.__native.seekEpochs.push(epoch);
  const record=(now,metadata)=>{
   const frame={...sample('seek-frame'),epoch:epoch.id,mediaTime:metadata.mediaTime,presentedFrames:metadata.presentedFrames};window.__native.seekFrameObservations.push(frame);
   // Native presentation and seeked events can arrive in either order. Associate
   // the last actual decoded observation with its source and completed seek
   // epoch, retaining every initial frame; never filter by expected timestamp.
   if(frame.currentSrc===epoch.currentSrc){epoch.frames.push(frame);associateTerminalFrame(epoch);}
   if(activeSeekEpoch===epoch)video.requestVideoFrameCallback(record);
  };
  video.requestVideoFrameCallback(record);
 }
});
${nativeSelection}
window.__choose=seconds=>{
 const url=new URL(location.href);url.search=seconds===null?'':'?t='+seconds;history.replaceState(null,'',url.pathname+url.search);
 selectVideo(seconds===null?null:{video,seconds});
};
window.__observePlayback=()=>{
 const mark=performance.now();window.__native.playRequests.push(mark);
 const record=(now,metadata)=>{window.__native.playFrames.push({...sample('play-frame'),mediaTime:metadata.mediaTime,presentedFrames:metadata.presentedFrames,requestAt:mark});window.__frameHandle=video.requestVideoFrameCallback(record);};
 window.__frameHandle=video.requestVideoFrameCallback(record);
};
window.__stopPlaybackObservation=()=>{if(window.__frameHandle)video.cancelVideoFrameCallback(window.__frameHandle);};
window.__ready=true;
`;
const requests=[];
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname===route){
  const delivery=['progressive','headerless'].includes(url.searchParams.get('fixture'))?url.searchParams.get('fixture'):'range';
  const format=url.searchParams.get('format')??'mp4';
  const sources=format==='authored'?authoredSourceTags.map(tag=>tag.replace(/\bsrc="([^"]+)"/,(_,src)=>'src="'+src+'?delivery='+delivery+'"')).join(''):format==='webm'?`<source src="${webmPath}?delivery=${delivery}" type="video/webm">`:`<source src="${mediaPath}?delivery=${delivery}" type="video/mp4">`;
  const immediate=format==='authored';
  const script=immediate?`<script>${fixtureRuntime}\nwindow.__beforeImmediateSelect={readyState:video.readyState,currentSrc:video.currentSrc,preload:video.preload,sources:Array.from(video.querySelectorAll('source'),source=>({src:source.getAttribute('src'),type:source.getAttribute('type')}))};window.__choose(46);</script>`:'<script src="/native-fixture.js"></script>';
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end(`<!doctype html><html><head><title>Native reader timestamp regression fixture</title></head><body><article data-guide-primary><h1>Native timestamp selection</h1><figure><video id="${route.slice(1)}" data-selected controls playsinline muted preload="none" tabindex="0" width="480" height="270">${sources}</video></figure><button id="next-native-control" type="button">Next control</button><video data-unselected preload="none"><source src="${mediaPath}?delivery=${delivery}" type="video/mp4"></video></article>${script}</body></html>`);
  return;
 }
 if(url.pathname==='/native-fixture.js'){
  res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(fixtureRuntime);return;
 }
 const resource=mediaFiles.get(url.pathname);
 if(!resource){res.writeHead(404);res.end();return;}
 const bytes=resource.bytes;
 const headerless=url.searchParams.get('delivery')==='headerless',progressive=headerless||url.searchParams.get('delivery')==='progressive';
 const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range??'');
 const start=progressive?0:Number(range?.[1]??0),end=progressive||!range?.[2]?bytes.length-1:Math.min(Number(range[2]),bytes.length-1);
 const trace={mediaPath:url.pathname,mime:resource.mime,delivery:progressive?'legal-200-ignoring-Range':'valid-206',cacheControl:headerless?null:resource.cacheControl,requestRange:req.headers.range??null,status:range&&!progressive?206:200,bytesSent:0,finished:false};requests.push(trace);
 if(start>bytes.length-1||end<start){res.writeHead(416,{'Content-Range':'bytes */'+bytes.length});res.end();return;}
 const headers={'Content-Type':resource.mime,'Content-Length':end-start+1};
 if(!headerless)headers['Cache-Control']=resource.cacheControl;
 if(!progressive)headers['Accept-Ranges']='bytes';
 if(trace.status===206)headers['Content-Range']=`bytes ${start}-${end}/${bytes.length}`;
 res.writeHead(trace.status,headers);
 if(!progressive){trace.bytesSent=end-start+1;trace.finished=true;res.end(bytes.subarray(start,end+1));return;}
 let offset=0,timer;
 const send=()=>{
  if(res.destroyed)return;
  const next=Math.min(offset+65536,bytes.length);res.write(bytes.subarray(offset,next));trace.bytesSent+=next-offset;offset=next;
  if(offset===bytes.length){trace.finished=true;res.end();return;}
  timer=setTimeout(send,20);
 };
 res.on('close',()=>clearTimeout(timer));send();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const executable=process.env.PLAYWRIGHT_EXECUTABLE_PATH??(process.env.CI==='true'?chromium.executablePath():await fs.access('/usr/bin/chromium').then(()=>'/usr/bin/chromium',()=>'/usr/bin/google-chrome'));
const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[],diagnostics=[];
const near=(actual,expected,label)=>assert(Math.abs(actual-expected)<0.6,label+': '+actual+' vs '+expected);
async function waitSeekAndFrame(page,target){
 await page.waitForFunction(()=>window.__native.seeked.length>0,null,{timeout:15000});
 const first=await page.evaluate(()=>window.__native.seeked[0]);near(first.time,target,'First actual native seeked must reach requested clip, not 0');
 await page.waitForFunction(()=>{const video=document.querySelector('video[data-selected]'),completed=window.__native.seeked[0];return !video.seeking&&video.readyState>=2&&video.currentSrc===completed.currentSrc;},null,{timeout:15000});
 // Flush the presentation callbacks around completion. The final paused frame
 // need not be presented twice, and its RVFC may precede native seeked slightly.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await page.waitForFunction(()=>window.__native.seekFrames.length>0,null,{timeout:15000});
 const frame=await page.evaluate(()=>window.__native.seekFrames[0]);near(frame.mediaTime,first.time,'Terminal decoded frame must match its actual completed native seek');near(frame.mediaTime,target,'Completed native seek must present the requested clip');
}
async function nativePlay(page){
 await page.evaluate(()=>window.__observePlayback());await page.locator('video[data-selected]').focus();await page.keyboard.press('Space');
 await page.waitForFunction(()=>window.__native.playFrames.some(frame=>!frame.paused),null,{timeout:15000});
}
async function nativePause(page){
 if(!await page.locator('video[data-selected]').evaluate(v=>v.paused)){await page.locator('video[data-selected]').focus();await page.keyboard.press('Space');}
 await page.waitForFunction(()=>document.querySelector('video[data-selected]').paused);
 await page.evaluate(()=>window.__stopPlaybackObservation());
}
async function scenario(name,delivery,check,{format='mp4'}={}){
 const requestStart=requests.length,context=await browser.newContext({viewport:{width:800,height:600}}),page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const result={name,delivery,format,status:'FAIL'};
 try{
  await page.goto(origin+route+'?fixture='+delivery+'&format='+format,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__ready);
  assert(await page.locator('video[data-selected]').evaluate(v=>typeof v.requestVideoFrameCallback==='function'),'Native decoded-frame observation is available');
  await check(page);assert.deepEqual(errors,[],'No native runtime fixture error');result.status='PASS';
 }catch(error){result.error=error.message;}
 result.native=await page.evaluate(()=>window.__native).catch(()=>null);result.initialSelection=await page.evaluate(()=>window.__beforeImmediateSelect??null).catch(()=>null);result.errors=errors;await context.close();result.requests=requests.slice(requestStart);results.push(result);
 process.stderr.write(name+' '+result.status+(result.error?' '+result.error:'')+'\n');
}
try{
 for(const delivery of ['range','progressive'])await scenario('Paused requested clip presents46 before native Play',delivery,async page=>{
  await page.evaluate(()=>window.__choose(46));await waitSeekAndFrame(page,46);
  assert(await page.locator('video[data-selected]').evaluate(v=>v.paused),'Initial timestamp navigation must not autoplay');
  assert.equal(await page.evaluate(()=>window.__native.events.filter(event=>event.event==='play').length),0,'No play can manufacture natural-clock timestamp success');
  assert.equal(await page.locator('video[data-unselected]').getAttribute('preload'),'none','Nonselected video preload is unchanged');
  await nativePlay(page);const frame=await page.evaluate(()=>window.__native.playFrames.find(frame=>!frame.paused));near(frame.mediaTime,46,'First playing frame after paused seek');
  await page.waitForFunction(()=>window.__native.playFrames.some(frame=>!frame.paused&&frame.mediaTime>46.15));await nativePause(page);
 });
 await scenario('Native Play during pending progressive clip starts46', 'progressive',async page=>{
  await page.evaluate(()=>window.__choose(46));await nativePlay(page);
  const first=await page.evaluate(()=>window.__native.playFrames.find(frame=>!frame.paused));near(first.mediaTime,46,'First playing frame after early native Play must not start0');
  await page.waitForFunction(()=>window.__native.playFrames.some(frame=>!frame.paused&&frame.mediaTime>46.15));await nativePause(page);
 });
 await scenario('Unmuted native Play during pending progressive clip starts46', 'progressive',async page=>{
  await page.locator('video[data-selected]').evaluate(video=>{video.muted=false;});
  await page.evaluate(()=>window.__choose(46));await nativePlay(page);
  const first=await page.evaluate(()=>window.__native.playFrames.find(frame=>!frame.paused));near(first.mediaTime,46,'Restored unmuted user Play must begin at46 rather than0');
  assert.equal(await page.locator('video[data-selected]').evaluate(video=>video.muted),false,'Timestamp selection must not mute the user player to resume playback');
  await page.waitForFunction(()=>window.__native.playFrames.some(frame=>!frame.paused&&frame.mediaTime>46.15));await nativePause(page);
 });
 await scenario('New pending selection supersedes older46 clip', 'progressive',async page=>{
  await page.evaluate(()=>{window.__choose(46);window.__choose(6);});await waitSeekAndFrame(page,6);
  assert(!await page.evaluate(()=>window.__native.seeked.some(event=>Math.abs(event.time-46)<0.6)),'Canceled46 selection cannot land later');
  assert(await page.locator('video[data-selected]').evaluate(v=>v.paused),'Reselecting a pending clip does not autoplay');
 });
 await scenario('Explicit pending Play survives same-player reselection to6', 'progressive',async page=>{
  await page.evaluate(()=>{window.__choose(46);window.__observePlayback();});
  await page.locator('video[data-selected]').focus();await page.keyboard.press('Space');
  // Physical Space may be held as pending intent without emitting native Play.
  // Reselect after actual metadata, before the first clip can start playing.
  await page.waitForFunction(()=>window.__native.events.some(event=>event.event==='loadedmetadata'));
  assert(!await page.evaluate(()=>window.__native.playFrames.some(frame=>!frame.paused)),'Reselection fixture must still be pending before its new clip is chosen');
  await page.evaluate(()=>window.__choose(6));
  await page.waitForFunction(()=>window.__native.playFrames.some(frame=>!frame.paused),null,{timeout:15000});
  const first=await page.evaluate(()=>window.__native.playFrames.find(frame=>!frame.paused));near(first.mediaTime,6,'Held explicit Play must begin at the latest requested clip');
  await page.waitForFunction(()=>window.__native.playFrames.some(frame=>!frame.paused&&frame.mediaTime>6.15));await nativePause(page);
 });
 await scenario('Queued guarded Pause cannot erase same-player pending Play intent', 'progressive',async page=>{
  await page.evaluate(()=>{
   window.__choose(46);window.__observePlayback();
   const video=document.querySelector('video[data-selected]');
   video.addEventListener('play',()=>window.__choose(6),{once:true});
   video.play().catch(()=>{});
  });
  await waitSeekAndFrame(page,6);
  // This deliberately stresses queued-event ownership. A frame before the
  // once-play reselection is not a claim that the initial clip46 succeeded.
  await page.waitForFunction(()=>{const sought=window.__native.seeked.find(event=>Math.abs(event.time-6)<0.6);return sought&&window.__native.playFrames.some(frame=>!frame.paused&&frame.at>=sought.at&&frame.mediaTime>=6&&frame.mediaTime<6.6);},null,{timeout:15000});
  await page.waitForFunction(()=>window.__native.playFrames.some(frame=>!frame.paused&&frame.mediaTime>6.15&&frame.mediaTime<7));await nativePause(page);
 });
 await scenario('Two pending physical Space presses cancel held Play intent', 'progressive',async page=>{
  await page.evaluate(()=>{window.__choose(46);window.__observePlayback();});
  await page.locator('video[data-selected]').focus();await page.keyboard.press('Space');await page.keyboard.press('Space');
  await waitSeekAndFrame(page,46);
  assert(await page.locator('video[data-selected]').evaluate(video=>video.paused),'Second pending Space must cancel Play intent without canceling the requested clip');
  assert(!await page.evaluate(()=>window.__native.playFrames.some(frame=>!frame.paused)),'Canceled pending Play intent must not emit playing frames automatically');
  await page.evaluate(()=>window.__stopPlaybackObservation());
 });
 await scenario('Pending held Space release starts requested46 without a second toggle', 'progressive',async page=>{
  await page.evaluate(()=>{window.__choose(46);window.__observePlayback();});
  await page.locator('video[data-selected]').focus();await page.keyboard.down('Space');
  let held=true;
  try{
   await waitSeekAndFrame(page,46);
   assert(await page.locator('video[data-selected]').evaluate(video=>video.paused),'Requested clip must remain paused while the physical Space key is held');
   assert(!await page.evaluate(()=>window.__native.playFrames.some(frame=>!frame.paused)),'Held pending key must not start programmatic playback before its release');
   await page.keyboard.up('Space');held=false;
   await page.waitForFunction(()=>window.__native.playFrames.some(frame=>!frame.paused),null,{timeout:15000});
   const first=await page.evaluate(()=>window.__native.playFrames.find(frame=>!frame.paused));near(first.mediaTime,46,'Physical Space release must begin the requested clip rather than toggle it back to Pause');
   await page.waitForFunction(()=>window.__native.playFrames.some(frame=>!frame.paused&&frame.mediaTime>46.15));await nativePause(page);
  }finally{if(held)await page.keyboard.up('Space');}
 });
 await scenario('Moving focus during held Space releases pending playback ownership', 'progressive',async page=>{
  await page.evaluate(()=>{window.__choose(46);window.__observePlayback();});
  await page.locator('video[data-selected]').focus();await page.keyboard.down('Space');
  let held=true;
  try{
   for(let step=0;step<12&&!await page.locator('#next-native-control').evaluate(button=>document.activeElement===button);step++)await page.keyboard.press('Tab');
   assert(await page.locator('#next-native-control').evaluate(button=>document.activeElement===button),'Real Tab must move focus to the next control');
   await page.keyboard.up('Space');held=false;
   await waitSeekAndFrame(page,46);
   assert(await page.locator('video[data-selected]').evaluate(video=>video.paused),'Moving focus must not commit an abandoned held-key Play request');
   // Real native play(), rather than another video Space key, must work. A new
   // video key could clear stale held-key state and hide this ownership bug.
   await page.locator('video[data-selected]').evaluate(video=>{video.play().catch(()=>{});});
   await page.waitForFunction(()=>window.__native.playFrames.some(frame=>!frame.paused),null,{timeout:15000});
   const first=await page.evaluate(()=>window.__native.playFrames.find(frame=>!frame.paused));near(first.mediaTime,46,'Subsequent native Play after focus loss must start requested46');
   await page.waitForFunction(()=>window.__native.playFrames.some(frame=>!frame.paused&&frame.mediaTime>46.15),null,{timeout:15000});await nativePause(page);
  }finally{if(held)await page.keyboard.up('Space');}
 });
 await scenario('Null selection cancels pending clip and preserves subsequent native Play', 'progressive',async page=>{
  await page.evaluate(()=>window.__choose(46));
  await page.waitForFunction(()=>window.__native.events.some(event=>event.event==='loadedmetadata'));
  await page.evaluate(()=>window.__choose(null));await nativePlay(page);
  const first=await page.evaluate(()=>window.__native.playFrames.find(frame=>!frame.paused));near(first.mediaTime,0,'Canceled clip must leave ordinary native Play at0');
  await page.waitForFunction(()=>window.__native.playFrames.some(frame=>!frame.paused&&frame.mediaTime>1.5),null,{timeout:15000});
  assert(!await page.evaluate(()=>window.__native.seeked.some(event=>Math.abs(event.time-46)<0.6)),'Null selection must not produce a later stale timestamp seek');await nativePause(page);
 });
 await scenario('Actual authored two-source selection is bound after native metadata', 'progressive',async page=>{
  const initial=await page.evaluate(()=>window.__beforeImmediateSelect);
  assert.equal(initial.preload,'none','Actual alternatives start without eager preload');
  assert.equal(initial.readyState,0,'Requested46 is selected before native metadata');
  assert.equal(initial.currentSrc,'','Fixture does not guess the browser-selected alternative before native selection');
  assert.deepEqual(initial.sources.map(source=>source.type),['video/webm; codecs="av01, opus"','video/mp4'],'Actual authored source MIME attributes and order are preserved');
  await waitSeekAndFrame(page,46);
  const currentSrc=await page.locator('video[data-selected]').evaluate(video=>video.currentSrc);
  assert([webmPath,mediaPath].includes(new URL(currentSrc).pathname),'The native player selects one actual authored alternative');
  assert(await page.locator('video[data-selected]').evaluate(video=>video.paused),'Actual two-source requested clip must remain paused before Play');
  assert.equal(await page.evaluate(()=>window.__native.events.filter(event=>event.event==='play').length),0,'Real alternative selection must not manufacture46 by autoplay');
  await nativePlay(page);const first=await page.evaluate(()=>window.__native.playFrames.find(frame=>!frame.paused));near(first.mediaTime,46,'First playing frame after actual two-source seek');
  await page.waitForFunction(()=>window.__native.playFrames.some(frame=>!frame.paused&&frame.mediaTime>46.15));await nativePause(page);
 },{format:'authored'});
 // A native decoded-frame probe distinguishes actual WebM decoder coverage
 // from canPlayType hints. Unsupported decoding is recorded, never called PASS.
 const webmProbe={name:'Actual WebM decoded-frame capability',status:'NOT COVERED',mediaPath:webmPath},probeContext=await browser.newContext({viewport:{width:800,height:600}}),probePage=await probeContext.newPage();
 try{
  await probePage.goto(origin+route+'?fixture=range&format=webm',{waitUntil:'domcontentloaded'});await probePage.waitForFunction(()=>window.__ready);
  await probePage.evaluate(()=>{window.__observePlayback();document.querySelector('video[data-selected]').play().catch(error=>window.__probeError=error.message);});
  await probePage.waitForFunction(()=>window.__native.playFrames.some(frame=>!frame.paused&&frame.mediaTime>0.15),null,{timeout:5000});
  webmProbe.status='SUPPORTED';webmProbe.firstDecodedFrame=await probePage.evaluate(()=>window.__native.playFrames[0]);await nativePause(probePage);
 }catch(error){webmProbe.reason=error.message;webmProbe.nativeError=await probePage.evaluate(()=>window.__probeError??document.querySelector('video[data-selected]').error?.message??null).catch(()=>null);
 }finally{await probeContext.close();}
 diagnostics.push(webmProbe);
 if(webmProbe.status==='SUPPORTED')await scenario('Actual WebM progressive clip decodes46 before native Play', 'progressive',async page=>{
  await page.evaluate(()=>window.__choose(46));await waitSeekAndFrame(page,46);
  assert(await page.locator('video[data-selected]').evaluate(video=>video.paused),'Decoded WebM clip does not autoplay');
  assert.equal(new URL(await page.locator('video[data-selected]').evaluate(video=>video.currentSrc)).pathname,webmPath,'Actual WebM file is decoded without MP4 substitution');
  await nativePlay(page);const first=await page.evaluate(()=>window.__native.playFrames.find(frame=>!frame.paused));near(first.mediaTime,46,'First playing decoded WebM frame');
  await page.waitForFunction(()=>window.__native.playFrames.some(frame=>!frame.paused&&frame.mediaTime>46.15));await nativePause(page);
 },{format:'webm'});
 if(headerlessDiagnostic){
  // This deliberately differs from the site's actual cache policy. Record native
  // capability/safety without replacing the strict real-policy timestamp contracts.
  const requestStart=requests.length,context=await browser.newContext({viewport:{width:800,height:600}}),page=await context.newPage();
  try{
   await page.goto(origin+route+'?fixture=headerless',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__ready);
   await page.evaluate(()=>{window.__choose(46);window.__observePlayback();});await page.locator('video[data-selected]').focus();await page.keyboard.press('Space');
   await page.waitForTimeout(2200);
   const observation=await page.evaluate(()=>({native:window.__native,paused:document.querySelector('video[data-selected]').paused,seekable:Array.from({length:document.querySelector('video[data-selected]').seekable.length},(_,i)=>[document.querySelector('video[data-selected]').seekable.start(i),document.querySelector('video[data-selected]').seekable.end(i)])}));
   const requestedClipFramePresented=observation.native.seekFrames.some(frame=>Math.abs(frame.mediaTime-46)<0.6);
   const wrongClipPlayed=observation.native.playFrames.some(frame=>!frame.paused&&Math.abs(frame.mediaTime-46)>=0.6);
   const diagnostic={name:'Headerless progressive response native capability',scope:'OBSERVATION ONLY; not the actual site response policy or a substitute for timestamp success',requestedClipFramePresented,wrongClipPlayed,initialPendingPlay:observation};
   if(!requestedClipFramePresented&&observation.paused){
    // A second deliberate native Play checks that unsupported timestamp seeking
    // releases its gate. Ordinary playback from0 is not a successful clip seek.
    const frameStart=await page.evaluate(()=>window.__native.playFrames.length);
    await page.locator('video[data-selected]').focus();await page.keyboard.press('Space');
    await page.waitForFunction(start=>window.__native.playFrames.slice(start).some(frame=>!frame.paused),frameStart,{timeout:15000});
    const first=await page.evaluate(start=>window.__native.playFrames.slice(start).find(frame=>!frame.paused),frameStart);
    await page.waitForFunction(start=>window.__native.playFrames.slice(start).some(frame=>!frame.paused&&frame.mediaTime>0.15),frameStart,{timeout:15000});
    diagnostic.subsequentExplicitPlay={firstPlayingMediaTime:first.mediaTime,nativeOrdinaryPlaybackResumed:true,requestedClipSeekSuccess:false};
    await nativePause(page);
   }
   diagnostics.push(diagnostic);
  }catch(error){diagnostics.push({name:'Headerless progressive response native capability',scope:'OBSERVATION ONLY',error:error.message});
  }finally{await context.close();}
  diagnostics.at(-1).requests=requests.slice(requestStart);
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
const report={nativeVideoSeeking:results.every(result=>result.status==='PASS')?'PASS':'FAIL',mode:dist?'actual emitted dist runtime':'actual authored reader runtime',mediaPath,mediaCacheControl,mediaCacheControlSource:dist?'actual dist/_headers':'actual header generator with SOURCE delivery policy',mediaSha256:createHash('sha256').update(media).digest('hex'),selectionSha256:createHash('sha256').update(nativeSelection).digest('hex'),nativePropertiesMocked:false,completeReaderRouteTests:'Run separately; this fixture isolates native timestamp mechanics',results,diagnostics};
console.log(JSON.stringify(report,null,2));
if(report.nativeVideoSeeking!=='PASS')process.exitCode=1;
