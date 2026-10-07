import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSourceObject } from './finalize-dist.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const sourceFile=path.join(here,'../src/pages/index.astro');
const text=await fs.readFile(sourceFile,'utf8');
const SOURCE=await extractSourceObject(sourceFile);
const values=(v)=>Array.isArray(v)?v:v==null?[]:[v];
const types=(n)=>values(n?.['@type']);
const videos=SOURCE.graph['@graph'].filter((n)=>types(n).includes('VideoObject')).map((n)=>({
  id:n['@id'],url:n.url,mainEntityOfPage:n.mainEntityOfPage,contentUrl:n.contentUrl,thumbnailUrl:n.thumbnailUrl,
}));
const policy=SOURCE.discovery?.sitemapPolicy?.videoWatchPages??[];
const routeEntries=SOURCE.routes?.resources?.filter((r)=>String(r.path).startsWith('/video-'))??[];
const snippetAround=(needle,before=2200,after=4200)=>{
  const out=[];
  for(let pos=text.indexOf(needle);pos>=0;pos=text.indexOf(needle,pos+1)){
    out.push({pos,snippet:text.slice(Math.max(0,pos-before),Math.min(text.length,pos+after))});
    if(out.length>=12)break;
  }
  return out;
};
const validator=snippetAround('Invalid watch-page video sitemap policy',5000,5000)[0]?.snippet??'NOT FOUND';
const pagePurposeSnippets=snippetAround('pagePurpose',1800,3200);
const targetSnippets=snippetAround('https://www.ghezelbaash.ir/video-jalupro-vs-profhilo',1200,2200);
console.log(JSON.stringify({policy,routeEntries,videos,pagePurposeOccurrences:pagePurposeSnippets.length,targetOccurrences:targetSnippets.length},null,2));
console.log('\n--- VALIDATOR SNIPPET ---\n'+validator);
for(const [i,item] of pagePurposeSnippets.entries())console.log(`\n--- PAGE PURPOSE OCCURRENCE ${i+1} @${item.pos} ---\n${item.snippet}`);
for(const [i,item] of targetSnippets.entries())console.log(`\n--- VIDEO TARGET OCCURRENCE ${i+1} @${item.pos} ---\n${item.snippet}`);
