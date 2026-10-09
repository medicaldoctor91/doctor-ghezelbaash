import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
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
const complete=serializeOuter(hero);
const late=serializeOuter(strip);
hero.childNodes=hero.childNodes.filter(node=>node!==strip);
const partial=serializeOuter(hero);
const viewports=[{width:360,height:800},{width:390,height:844},{width:393,height:852},{width:430,height:932},{width:768,height:1024},{width:1280,height:800},{width:1366,height:768},{width:1440,height:900},{width:1920,height:1080}];
const executable=process.env.PLAYWRIGHT_EXECUTABLE_PATH??(process.env.CI==='true'?chromium.executablePath():await fs.access('/usr/bin/chromium').then(()=>'/usr/bin/chromium',()=>'/usr/bin/google-chrome'));
const browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
// Deliver real HTML token prefixes over one open HTTP response. Fragment insertion
// closes pending figure/details tags and cannot reproduce the streaming parser.
const streamedTree=parseFragment(complete,{sourceCodeLocationInfo:true});
const streamedHero=streamedTree.childNodes.find(node=>node.tagName==='header');
const boundaries=[];
for(const child of streamedHero.childNodes??[]){
 if(!child.tagName)continue;
 if(child.tagName==='figure'){
  const descendants=[];const collect=node=>{descendants.push(node);for(const nested of node.childNodes??[])collect(nested);};collect(child);
  const picture=descendants.find(node=>node.tagName==='picture');
  const summary=descendants.find(node=>node.tagName==='summary');
  assert(picture&&summary,'The real Home portrait and collapsed identity caption exist');
  boundaries.push({name:'portrait opening and identity metadata',offset:picture.sourceCodeLocation.startTag.startOffset},
   {name:'portrait image markup',offset:picture.sourceCodeLocation.endTag.endOffset},
   {name:'portrait caption summary',offset:summary.sourceCodeLocation.endTag.endOffset});
 }
 boundaries.push({name:attr(child,'class')??child.tagName,offset:child.sourceCodeLocation.endTag?.endOffset??child.sourceCodeLocation.endOffset});
}
const selectors=['.hero-title','.medical-trust','.hero-subtitle','.hero-search-launch','.hero-figure','.hero-actions','.hero-lead','.hero-identity'];
let streamingResponse;
const server=http.createServer((request,response)=>{
 if(request.url==='/stream-home'){response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});response.flushHeaders();streamingResponse?.(response);return;}
 response.writeHead(404);response.end();
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const streamUrl='http://127.0.0.1:'+server.address().port+'/stream-home';
let cases=0,streamingCases=0,streamingStages=0;const completedHeroes=[];
try{
 for(const viewport of viewports){
  const page=await browser.newPage({viewport});
  try{
   await page.route('**/*',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/stream-home'){await route.continue();return;}
    const file=path.resolve(assetRoot,pathname.slice(1));
    if(!file.startsWith(assetRoot+'/')){await route.abort();return;}
    try{await route.fulfill({body:await fs.readFile(file),contentType:{'.avif':'image/avif','.webp':'image/webp','.woff2':'font/woff2'}[path.extname(file)]??'application/octet-stream',headers:{'Access-Control-Allow-Origin':'*'}});}catch{await route.abort();}
   });
   const received=new Promise(resolve=>streamingResponse=resolve);
   const navigation=page.goto(streamUrl,{waitUntil:'load'});
   const response=await received;
   response.write('<!doctype html><html dir="rtl" lang="fa-IR"><head><base href="http://home-layout.invalid/"><style>'+css+'</style></head><body><main><article class="medical-guide medical-guide--entity-home">');
   let offset=0,previous={};
   try{
    for(const [step,boundary] of boundaries.entries()){
     response.write(complete.slice(offset,boundary.offset)+'<script data-stream-marker>document.documentElement.dataset.streamStep="'+step+'"</script>');offset=boundary.offset;
     await page.waitForFunction(step=>document.documentElement.dataset.streamStep===String(step),step);
     await page.evaluate(async()=>{await document.fonts.load('16px Vazirmatn');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
     const current=await page.evaluate(selectors=>Object.fromEntries(selectors.flatMap(selector=>{
      const node=document.querySelector(selector);if(!node)return[];const rect=node.getBoundingClientRect(),style=getComputedStyle(node);
      return [[selector,{top:rect.top,left:rect.left,width:rect.width,height:rect.height,painted:style.visibility==='visible'&&style.display!=='none'&&rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight}]];
     })),selectors);
     assert(current['.hero-title']?.painted,'The entity heading paints throughout the real HTML stream: '+JSON.stringify({viewport,boundary}));
     for(const [selector,before] of Object.entries(previous)){
      if(!before.painted)continue;
      const after=current[selector];
      for(const dimension of ['top','left','width','height'])assert(Math.abs(before[dimension]-after[dimension])<.05,'Later Home markup preserves already-painted geometry: '+JSON.stringify({viewport,boundary:boundary.name,selector,dimension,before,after}));
     }
     previous=current;streamingStages++;
    }
    response.end(complete.slice(offset)+'</article></main></body></html>');await navigation;
    await page.locator('[data-stream-marker]').evaluateAll(nodes=>nodes.forEach(node=>node.remove()));
    assert.equal(await page.locator('.entity-hero').evaluate(node=>node.textContent.replace(/\s+/g,' ').trim()),originalText,'Real streamed Home preserves every complete hero text value');
    for(const selector of selectors)assert(await page.locator(selector).evaluate(node=>getComputedStyle(node).visibility==='visible'),'Completed HTML exposes all hero content without reader JavaScript: '+JSON.stringify({viewport,selector}));
    const portrait=await page.locator('.hero-figure').evaluate(node=>{
     const box=element=>{const r=element.getBoundingClientRect();return {top:r.top,width:r.width,height:r.height};};
     const image=node.querySelector('img'),caption=node.querySelector('figcaption'),details=node.querySelector('details'),hiddenDetails=node.querySelector('.hero-physician-identity-details');
     return {figure:box(node),image:box(image),caption:box(caption),authoredRatio:Number(image.getAttribute('width'))/Number(image.getAttribute('height')),detailsOpen:details.open,hiddenDetailsVisible:hiddenDetails.checkVisibility({checkVisibilityCSS:true,contentVisibilityAuto:true})};
    });
    assert(Math.abs(portrait.image.width/portrait.image.height-portrait.authoredRatio)<.002,'The actual parser retains the authored portrait aspect ratio: '+JSON.stringify({viewport,portrait}));
    assert(!portrait.detailsOpen&&!portrait.hiddenDetailsVisible,'The original identity caption remains a collapsed accessible disclosure: '+JSON.stringify({viewport,portrait}));
    assert(Math.abs(portrait.figure.height-portrait.image.height-portrait.caption.height)<.05,'The complete streaming fixture uses the actual image and collapsed caption geometry: '+JSON.stringify({viewport,portrait}));
    completedHeroes.push({viewport,portrait});
    streamingCases++;
   }finally{response.end();await navigation.catch(()=>{});}
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
   const dates=await page.locator('.medical-trust time[datetime]').evaluateAll(nodes=>nodes.map(node=>{
    const glyphs=(start,end)=>{
     const range=document.createRange();range.setStart(node.firstChild,start);range.setEnd(node.firstChild,end);
     return [...range.getClientRects()].map(rect=>({left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height}));
    };
    return {text:node.textContent,datetime:node.getAttribute('datetime'),year:glyphs(0,4),month:glyphs(5,7),day:glyphs(8,10)};
   }));
   assert(dates.length,'The actual Home medical review date is rendered');
   for(const date of dates){
    assert.equal(date.text,date.datetime,'Visible date text preserves its exact canonical datetime value');
    assert.match(date.text,/^\d{4}-\d{2}-\d{2}$/,'The Home canonical date uses its unchanged ISO year-month-day text');
    for(const group of ['year','month','day'])assert(date[group].length===1&&date[group][0].width>0&&date[group][0].height>0,'Each ISO date component has one visible glyph range: '+JSON.stringify({viewport,date,group}));
    const [year,month,day]=[date.year[0],date.month[0],date.day[0]];
    assert(year.right<=month.left+.05&&month.right<=day.left+.05,'ISO date glyphs read physically from year to month to day, left to right: '+JSON.stringify({viewport,date}));
    assert(Math.abs(year.top-month.top)<.05&&Math.abs(month.top-day.top)<.05,'ISO year/month/day glyphs stay on the same line: '+JSON.stringify({viewport,date}));
   }
   for(const selector of ['h1','.medical-trust'])assert(await page.locator(selector).evaluate(node=>{const r=node.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1;}),'Home heading and canonical review metadata remain visible: '+JSON.stringify({selector,viewport}));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'The streaming hero fits its viewport');
   cases++;
  }finally{await page.close();}
 }
}finally{await browser.close();server.close();await once(server,'close');}
console.log(JSON.stringify({homeLayout:'PASS',lateTrustStrip:'stable earlier hero geometry',canonicalReview:'visible after entity heading',isoDateGlyphs:'year/month/day LTR, same line, text equals datetime',text:'preserved',cases,streamingCases,streamingStages,completedHeroes,realHtmlStream:'stable already-painted geometry, complete content visible without reader JS',finalDist:!!process.argv[2]},null,2));
