import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parse,parseFragment,serializeOuter} from 'parse5';
import {chromium} from 'playwright-core';
import {SOURCE,AUTHORED_BODY} from '../src/canonical/source.mjs';
import {renderMedicalTrust} from '../src/lib/search-contract.mjs';

const root=new URL('../',import.meta.url);
const source=await fs.readFile(new URL('src/pages/index.astro',root),'utf8');
const start=source.indexOf('export const DESIGN = ')+'export const DESIGN = '.length;
const end=source.indexOf('export const READER_RUNTIME = ');
let css=Function('return '+source.slice(start,end).trim())();
let tree,assetRoot=path.resolve(new URL('public/',root).pathname);
if(process.argv[2]){
 const dist=path.resolve(process.argv[2]);
 const html=await fs.readFile(path.join(dist,'index.html'),'utf8');
 const stylesheet=html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/)?.[1];
 assert(stylesheet,'Final Home links its emitted stylesheet');
 css=await fs.readFile(path.join(dist,stylesheet.slice(1)),'utf8');
 tree=parse(html);assetRoot=dist;
}else{
 const home=SOURCE.graph['@graph'].find(node=>node['@id']===SOURCE.canonicalOrigin+'/webpage');
 assert(home,'Canonical Home page exists');
 tree=parseFragment(AUTHORED_BODY.replace('</h1>','</h1>'+renderMedicalTrust(home,SOURCE.graph,'fa-IR')));
}
const attr=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
let hero;function visit(node){if(node.tagName==='header'&&attr(node,'class')==='entity-hero')hero=node;for(const child of node.childNodes??[])visit(child);}visit(tree);
assert(hero,'The actual Home entity hero exists');
const strip=hero.childNodes.find(node=>attr(node,'class')==='hero-trust-strip');
assert(strip,'The actual late-parsed trust strip exists');
const text=node=>node.nodeName==='#text'?node.value:(node.childNodes??[]).map(text).join('');
const originalText=text(hero).replace(/\s+/g,' ').trim();
const late=serializeOuter(strip);
hero.childNodes=hero.childNodes.filter(node=>node!==strip);
const partial=serializeOuter(hero);
const viewports=[{width:360,height:800},{width:390,height:844},{width:393,height:852},{width:430,height:932},{width:768,height:1024},{width:1280,height:800},{width:1366,height:768},{width:1440,height:900},{width:1920,height:1080}];
const executable=process.env.PLAYWRIGHT_EXECUTABLE_PATH??(process.env.CI==='true'?chromium.executablePath():await fs.access('/usr/bin/chromium').then(()=>'/usr/bin/chromium',()=>'/usr/bin/google-chrome'));
const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
let cases=0;
try{
 for(const viewport of viewports){
  const page=await browser.newPage({viewport});
  try{
   await page.route('**/*',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    const file=path.resolve(assetRoot,pathname.slice(1));
    if(!file.startsWith(assetRoot+'/')){await route.abort();return;}
    try{await route.fulfill({body:await fs.readFile(file),contentType:{'.avif':'image/avif','.webp':'image/webp','.woff2':'font/woff2'}[path.extname(file)]??'application/octet-stream',headers:{'Access-Control-Allow-Origin':'*'}});}catch{await route.abort();}
   });
   // Reproduce the actual pre-DOMContentLoaded dependency: the header's final
   // named grid child arrives after the earlier hero has already been painted.
   await page.setContent('<!doctype html><html dir="rtl" lang="fa-IR"><head><base href="http://home-layout.invalid/"><style>'+css+'</style></head><body><main><article class="medical-guide medical-guide--entity-home">'+partial+'</article></main></body></html>',{waitUntil:'load'});
   await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
   const snapshot=()=>page.evaluate(()=>Object.fromEntries(['.medical-trust','.hero-title','.hero-figure','.hero-actions','.hero-lead','.hero-identity'].map(selector=>{const node=document.querySelector(selector),r=node.getBoundingClientRect();return [selector,{top:r.top,left:r.left,width:r.width,height:r.height,text:node.textContent}];})));
   const before=await snapshot();
   await page.locator('.entity-hero').evaluate((node,html)=>node.insertAdjacentHTML('beforeend',html),late);
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const after=await snapshot();
   for(const selector of Object.keys(before)){
    for(const dimension of ['top','left','width','height'])assert(Math.abs(before[selector][dimension]-after[selector][dimension])<.05,'Late trust strip preserves existing hero geometry: '+JSON.stringify({viewport,selector,dimension,before:before[selector],after:after[selector]}));
    assert.equal(after[selector].text,before[selector].text,'Existing hero text stays intact');
   }
   assert.equal(await page.locator('.entity-hero').evaluate(node=>node.textContent.replace(/\s+/g,' ').trim()),originalText,'The complete Home hero retains its original clinical and trust text');
   assert.equal(await page.locator('h1').count(),1,'Home retains its one clear entity heading');
   for(const selector of ['h1','.medical-trust'])assert(await page.locator(selector).evaluate(node=>{const r=node.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1;}),'Home heading and canonical review metadata remain visible: '+JSON.stringify({selector,viewport}));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'The streaming hero fits its viewport');
   cases++;
  }finally{await page.close();}
 }
}finally{await browser.close();}
console.log(JSON.stringify({homeLayout:'PASS',lateTrustStrip:'stable earlier hero geometry',canonicalReview:'visible after entity heading',text:'preserved',cases,finalDist:!!process.argv[2]},null,2));
