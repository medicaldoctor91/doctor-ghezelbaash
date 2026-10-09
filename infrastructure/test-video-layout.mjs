import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseFragment} from 'parse5';
import {chromium} from 'playwright-core';
import {AUTHORED_BODY} from '../src/canonical/source.mjs';

const root=new URL('../',import.meta.url);
const source=await fs.readFile(new URL('src/pages/index.astro',root),'utf8');
const designStart=source.indexOf('export const DESIGN = ')+'export const DESIGN = '.length;
const runtimeStart=source.indexOf('export const READER_RUNTIME = ');
let css=Function('return '+source.slice(designStart,runtimeStart).trim())();
if(process.argv[2]){
 const dist=path.resolve(process.argv[2]);
 const html=await fs.readFile(path.join(dist,'index.html'),'utf8');
 const stylesheet=html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/)?.[1]??html.match(/<link\b[^>]*href="([^"]+)"[^>]*rel="stylesheet"/)?.[1];
 assert(stylesheet,'Final Home links its emitted stylesheet');
 css=await fs.readFile(path.join(dist,stylesheet.replace(/^\//,'')),'utf8');
}
const attr=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
const videos=[];
function walk(node){
 if(node.tagName==='video')videos.push({id:attr(node,'id'),width:Number(attr(node,'width')),height:Number(attr(node,'height')),poster:attr(node,'data-poster')??attr(node,'poster')});
 for(const child of node.childNodes??[])walk(child);
}
walk(parseFragment(AUTHORED_BODY));
assert(videos.length,'The authored corpus contains its watch media');
const viewports=[{width:360,height:800},{width:390,height:844},{width:393,height:852},{width:430,height:932},{width:768,height:1024},{width:1280,height:800},{width:1366,height:768},{width:1440,height:900},{width:1920,height:1080}];
const executable=process.env.PLAYWRIGHT_EXECUTABLE_PATH??(process.env.CI==='true'?chromium.executablePath():await fs.access('/usr/bin/chromium').then(()=>'/usr/bin/chromium',()=>'/usr/bin/google-chrome'));
const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
let cases=0;
try{
 for(const video of videos){
  assert(video.width>0&&video.height>0&&video.poster,'Authored watch dimensions and poster exist: '+video.id);
  const poster=await fs.readFile(new URL('public'+video.poster,root));
  for(const viewport of viewports){
   const page=await browser.newPage({viewport});
   let release;const held=new Promise(resolve=>release=resolve);
   const url='http://video-layout.invalid/poster.webp';
   try{
    await page.route(url,async route=>{await held;await route.fulfill({contentType:'image/webp',body:poster});});
    const response=page.waitForResponse(url);
    await page.setContent(`<style>${css}</style><main><article class="medical-guide" data-guide-primary><h1>Watch page</h1><figure><video width="${video.width}" height="${video.height}" controls preload="none" poster="${url}"></video><figcaption>Preserved watch caption</figcaption></figure></article></main>`,{waitUntil:'domcontentloaded'});
    const geometry=()=>page.locator('video').evaluate(node=>{const r=node.getBoundingClientRect();return {width:r.width,height:r.height};});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const before=await geometry();
    release();await response;
    await page.evaluate(async url=>{const poster=new Image();poster.src=url;await poster.decode();},url);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const after=await geometry();
    assert(before.width>0&&before.height>0,'Watch media reserves space before poster delivery: '+JSON.stringify({id:video.id,viewport,before,after}));
    assert(Math.abs(before.width-after.width)<.05&&Math.abs(before.height-after.height)<.05,'Poster decode preserves the authored video geometry: '+JSON.stringify({id:video.id,viewport,before,after}));
    assert(Math.abs(before.width/before.height-video.width/video.height)<.002,'Reserved geometry follows this authored video aspect ratio');
    assert(after.width<=viewport.width&&after.height<=Math.min(viewport.height*.52,448)+.05,'Watch media respects the existing responsive height cap');
    assert(await page.locator('h1').evaluate(node=>{const r=node.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight;}),'The primary watch title remains visible');
    assert.equal(await page.locator('figcaption').textContent(),'Preserved watch caption','Media sizing does not remove supporting content');
    cases++;
   }finally{release();await page.close();}
  }
 }
}finally{await browser.close();}
console.log(JSON.stringify({videoLayout:'PASS',delayedPoster:'stable reserved geometry',authoredDimensions:videos.map(({id,width,height})=>({id,width,height})),viewports:viewports.length,cases},null,2));
