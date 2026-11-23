#!/usr/bin/env node
/**
 * Browser-level read-only audit of all 72 sitemap pages.
 * Looks for runtime exceptions, failed same-origin assets, mobile overflow,
 * missing visible main content and keyboard/accessible-name issues.
 * The intentionally large homepage is NOT classified as a defect.
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const site = 'https://www.ghezelbaash.ir';
const xml=await (await fetch(site+'/sitemap.xml')).text();
const urls=[...new Set([...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/g)].map(x=>x[1].replaceAll('&amp;','&')))];
if(urls.length!==72) throw new Error('Unexpected sitemap URL count '+urls.length);
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const entries=[];
const globalFailures=[];
const out='/tmp/136-browser-audit';
fs.mkdirSync(out,{recursive:true});
for (const [mode,viewport] of [['mobile',{width:390,height:844}],['desktop',{width:1365,height:768}]]) {
  const context=await browser.newContext({viewport,deviceScaleFactor:1,isMobile:mode==='mobile',hasTouch:mode==='mobile',
    userAgent: mode==='mobile' ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'});
  let idx=0;
  async function worker() {
    for(;;){
      const i=idx++;if(i>=urls.length)return;
      const url=urls[i];let page=null;
      const rec={url,mode,errors:[],consoleErrors:[],httpErrors:[],requestFailures:[]};
      try{
        page=await context.newPage();
        page.on('pageerror',e=>rec.errors.push(String(e).slice(0,500)));
        page.on('console',msg=>{if(msg.type()==='error')rec.consoleErrors.push(msg.text().slice(0,420));});
        page.on('response',resp=>{
          if(resp.status()>=400 && resp.url().startsWith(site)){
            rec.httpErrors.push({status:resp.status(),url:resp.url()});
          }
        });
        page.on('requestfailed',req=>{
          if(req.url().startsWith(site))rec.requestFailures.push({url:req.url(),cause:req.failure()?.errorText});
        });
        const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
        rec.status=response?.status();
        await page.waitForTimeout(300);
        const data=await page.evaluate(()=>{
          const main=document.querySelector('main');
          const mainText=(main?.textContent||'').replace(/\s+/g,' ').trim();
          const scripts=[...document.querySelectorAll('script[type="application/ld+json"]')].map(n=>({id:n.id,insideHead:document.head.contains(n),textBytes:new TextEncoder().encode(n.textContent).length}));
          const invalidImages=[...document.images].filter(i=>i.complete && i.naturalWidth===0).slice(0,10).map(i=>i.currentSrc||i.src);
          const missingNames=[...document.querySelectorAll('button,a')].filter(el=>{
            if(el.hidden||getComputedStyle(el).display==='none'||getComputedStyle(el).visibility==='hidden')return false;
            return !(el.textContent||'').trim()&&!el.getAttribute('aria-label')&&!el.getAttribute('title')&&!el.querySelector('img[alt]');
          }).slice(0,10).map(el=>el.outerHTML.slice(0,200));
          const canvas=document.querySelector('html');
          return {
            title:document.title,
            readyState:document.readyState,
            mainTextLength:mainText.length,
            mainExists:!!main,
            docWidth:canvas.scrollWidth,
            viewportWidth:window.innerWidth,
            hasHorizontalOverflow:canvas.scrollWidth>window.innerWidth+8,
            brokenImages:invalidImages,
            noAccessibleNameControls:missingNames,
            jsonld:scripts,
            lang:document.documentElement.lang,
            hasViewportMeta:!!document.querySelector('meta[name="viewport"]'),
            hasBody:!!document.body,
            h1Count:document.querySelectorAll('h1').length,
            pageSource:document.location.href
          };
        });
        Object.assign(rec,data);
        rec.consoleErrors=[...new Set(rec.consoleErrors)].slice(0,8);
        rec.errors=[...new Set(rec.errors)].slice(0,8);
      }catch(e){rec.errors.push('NAVIGATION_AUDIT:'+String(e).slice(0,450));}
      finally{if(page)await page.close().catch(()=>{});entries.push(rec);}
      if((i+1)%24===0)console.log('Audited',mode,i+1,'pages');
    }
  }
  await Promise.all(Array.from({length:4},()=>worker()));
  await context.close();
}
await browser.close();
entries.sort((a,b)=>a.url.localeCompare(b.url)||a.mode.localeCompare(b.mode));
const issues=entries.flatMap(r=>{
  const result=[];
  for(const e of r.errors)result.push({url:r.url,mode:r.mode,kind:'PAGE_ERROR',detail:e});
  for(const e of r.consoleErrors)result.push({url:r.url,mode:r.mode,kind:'CONSOLE_ERROR',detail:e});
  for(const e of r.httpErrors)result.push({url:r.url,mode:r.mode,kind:'LOCAL_HTTP_ERROR',detail:e});
  for(const e of r.requestFailures)result.push({url:r.url,mode:r.mode,kind:'LOCAL_REQUEST_FAILED',detail:e});
  if(r.hasHorizontalOverflow)result.push({url:r.url,mode:r.mode,kind:'HORIZONTAL_OVERFLOW',detail:{scroll:r.docWidth,viewport:r.viewportWidth}});
  if(r.brokenImages?.length)result.push({url:r.url,mode:r.mode,kind:'BROKEN_IMAGE',detail:r.brokenImages});
  if(r.noAccessibleNameControls?.length)result.push({url:r.url,mode:r.mode,kind:'UNNAMED_CONTROL',detail:r.noAccessibleNameControls});
  if(!r.mainExists||r.mainTextLength<100)result.push({url:r.url,mode:r.mode,kind:'MISSING_MAIN_CONTENT',detail:r.mainTextLength});
  if(!r.hasViewportMeta)result.push({url:r.url,mode:r.mode,kind:'MISSING_VIEWPORT',detail:''});
  return result;
});
const summary={auditedUTC:new Date().toISOString(),pages:urls.length,deviceModes:2,
  totalRendered:entries.length,errors:issues.length,
  counts:Object.entries(issues.reduce((a,e)=>(a[e.kind]=(a[e.kind]||0)+1,a),{})).sort((a,b)=>b[1]-a[1]),
  sample:issues.slice(0,55),
  excludedFinding:'Homepage payload size is intentional and not flagged'};
fs.writeFileSync(out+'/summary.json',JSON.stringify(summary,null,2));
fs.writeFileSync(out+'/pages.json',JSON.stringify(entries,null,2));
fs.writeFileSync(out+'/issues.json',JSON.stringify(issues,null,2));
console.log(JSON.stringify(summary,null,2));
