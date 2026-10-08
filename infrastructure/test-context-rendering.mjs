import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';

const root=new URL('../',import.meta.url);
const source=await fs.readFile(new URL('src/pages/index.astro',root),'utf8');
const designStart=source.indexOf('export const DESIGN = ')+ 'export const DESIGN = '.length;
const runtimeStart=source.indexOf('export const READER_RUNTIME = ');
const design=Function('return '+source.slice(designStart,runtimeStart).trim())();
const runtime=Function('return '+source.slice(runtimeStart+'export const READER_RUNTIME = '.length,source.indexOf('\nexport function compileCanonicalSource',runtimeStart)).trim())();

// Exercise the emitted runtime function, keeping media and scrolling observable.
const selectionStart=runtime.indexOf('  let highlightedVideo,waitingVideo,waitingSeek;');
const selectionEnd=runtime.indexOf('  let navigationTicket',selectionStart);
assert(selectionStart>=0&&selectionEnd>selectionStart,'Video selection runtime exists');
function selection(pathname){
 const calls=[],heading={id:'watch-heading'};
 const video={readyState:1,duration:20,currentTime:0,closest(selector){return selector==='article[data-guide-primary]'?{querySelector:()=>heading}:{classList:{add(){},remove(){}}};},scrollIntoView(options){calls.push(['center',options]);}};
 const select=Function('location','moveTo','revealPoster','focusTarget',runtime.slice(selectionStart,selectionEnd)+'\nreturn selectVideo;')(
  {pathname},node=>calls.push(['move',node]),()=>{},node=>calls.push(['focus',node]));
 select({video,seconds:4},{scroll:true,focus:true});
 assert.equal(video.currentTime,4,'Timestamp selection still seeks the playable media');
 return {calls,heading,video};
}
const focused=selection('/video-saeed-ghezelbash-kurdish-patient-review');
assert.equal(focused.calls.find(c=>c[0]==='move')?.[1],focused.heading,'Focused watch positions its own page heading');
assert(!focused.calls.some(c=>c[0]==='center'),'Focused watch does not apply a second competing scroll');
const home=selection('/');
assert.equal(home.calls.find(c=>c[0]==='move')?.[1],home.video,'Home video deep links still position the video');
assert.deepEqual(home.calls.find(c=>c[0]==='center')?.[1],{block:'center'},'Home video centering remains available');

let css=design;
if(process.argv[2]){
 const dist=path.resolve(process.argv[2]);
 const html=await fs.readFile(path.join(dist,'index.html'),'utf8');
 const stylesheet=html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/)?.[1]??html.match(/<link\b[^>]*href="([^"]+)"[^>]*rel="stylesheet"/)?.[1];
 assert(stylesheet,'Final Home links its emitted stylesheet');
 css=await fs.readFile(path.join(dist,stylesheet.replace(/^\//,'')),'utf8');
}
const executable=process.env.PLAYWRIGHT_EXECUTABLE_PATH??(process.env.CI==='true'?chromium.executablePath():await fs.access('/usr/bin/chromium').then(()=>'/usr/bin/chromium',()=>'/usr/bin/google-chrome'));
const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.setContent(`<style>${css}</style><main><article class="medical-guide medical-guide--entity-home"><h1>Home</h1><div class="render-chunk" id="home"><p>Canonical Home text</p></div></article></main>`);
 assert.equal(await page.locator('#home').evaluate(n=>getComputedStyle(n).contentVisibility),'visible','Canonical Home corpus remains non-deferred');
 await page.setContent(`<style>${css}</style><div class="guide-reader"><aside class="medical-guide guide-context" data-guide-context="before"><div class="render-chunk" id="before"><h2>Earlier context</h2></div></aside><main><article class="medical-guide" data-guide-primary><h1>Focused page</h1><div class="render-chunk" id="primary"><p>Primary clinical text</p></div></article></main><aside class="medical-guide guide-context" data-guide-context="after"><div class="render-chunk" id="after"><h2 id="context-target">Later context</h2><p>Complete surrounding reader text</p></div></aside></div>`);
 for(const id of ['before','after'])assert.equal(await page.locator('#'+id).evaluate(n=>getComputedStyle(n).contentVisibility),'auto','Only surrounding context uses deferred rendering: '+id);
 const primary=await page.locator('#primary').evaluate(n=>({visibility:getComputedStyle(n).contentVisibility,contain:getComputedStyle(n).contain,text:n.textContent}));
 assert.equal(primary.visibility,'visible','Focused primary article is always rendered');
 assert.equal(primary.contain,'none','Focused primary article retains its ordinary layout');
 assert.equal(primary.text,'Primary clinical text','Rendering policy preserves primary text');
 assert.equal(await page.locator('#after').textContent(),'Later contextComplete surrounding reader text','Deferred context remains in the DOM');
 await page.locator('#after').evaluate(n=>n.classList.add('is-target-chunk'));
 assert.equal(await page.locator('#after').evaluate(n=>getComputedStyle(n).contentVisibility),'visible','Fragment navigation materializes its surrounding chunk');
 await page.locator('#context-target').evaluate(n=>n.scrollIntoView({block:'start'}));
 assert(await page.locator('#context-target').evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight;}),'Revealed context target is visible');
 assert.equal(await page.locator('article.medical-guide').count(),1,'One focused primary article');
 assert.equal(await page.locator('h1').count(),1,'One focused page title');
}finally{await browser.close();}
console.log(JSON.stringify({contextRendering:'PASS',primaryAndHome:'non-deferred',focusedWatchHeading:'PASS',homeVideoCentering:'PASS',timestampSeek:'PASS'},null,2));
