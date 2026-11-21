#!/usr/bin/env node
/** Real-browser WCAG 2.0/2.1 AA axe-core audit across all 72 live site pages. */
import fs from 'node:fs';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const root='https://www.ghezelbaash.ir';
const xml=await (await fetch(root+'/sitemap.xml')).text();
const urls=[...new Set([...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/g)].map(x=>x[1]))];
if(urls.length!==72)throw new Error('Expected exactly 72 sitemap HTML URLs');
const dir='/tmp/136-wcag-audit';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
const reports=[];let cursor=0;
async function run(){
  while(cursor<urls.length){
    const url=urls[cursor++],entry={url,violations:[],incompleteCount:0,exception:null};
    let page;
    try{
      page=await context.newPage();
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
      const findings=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).run();
      entry.violations=findings.violations.map(v=>({
        id:v.id,impact:v.impact,description:v.description,helpUrl:v.helpUrl,
        affectedCount:v.nodes.length,
        nodes:v.nodes.slice(0,5).map(n=>({target:n.target,html:n.html.slice(0,350),failureSummary:n.failureSummary?.slice(0,600)}))
      }));
      entry.incompleteCount=findings.incomplete.length;
    }catch(e){entry.exception=String(e).slice(0,550)}
    finally{if(page)await page.close().catch(()=>{});reports.push(entry);}
  }
}
await Promise.all(Array.from({length:3},()=>run()));
await context.close();await browser.close();
reports.sort((a,b)=>a.url.localeCompare(b.url));
const counts={};for(const row of reports)for(const v of row.violations){const k=v.id+'|'+v.impact;counts[k]=(counts[k]||0)+v.affectedCount;}
const summary={date:new Date().toISOString(),site:root,pages:urls.length,audited:reports.length,
  pagesWithViolations:reports.filter(r=>r.violations.length).length,
  totalViolations:reports.reduce((a,r)=>a+r.violations.length,0),
  pagesWithExceptions:reports.filter(r=>r.exception).map(r=>({url:r.url,error:r.exception})),
  counts:Object.entries(counts).sort((a,b)=>b[1]-a[1]),
  firstFindings:reports.filter(r=>r.violations.length).slice(0,20)
};
fs.writeFileSync(dir+'/summary.json',JSON.stringify(summary,null,2));
fs.writeFileSync(dir+'/pages.json',JSON.stringify(reports,null,2));
console.log(JSON.stringify({date:summary.date,pages:summary.pages,audited:summary.audited,pagesWithViolations:summary.pagesWithViolations,totalViolations:summary.totalViolations,counts:summary.counts.slice(0,20),exceptions:summary.pagesWithExceptions},null,2));
