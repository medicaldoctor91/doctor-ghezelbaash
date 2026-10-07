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
const videos=SOURCE.graph['@graph'].filter((n)=>types(n).includes('VideoObject')).map((n)=>({id:n['@id'],url:n.url,mainEntityOfPage:n.mainEntityOfPage}));
const policy=SOURCE.discovery?.sitemapPolicy?.videoWatchPages??[];
const routeEntries=SOURCE.routes?.resources?.filter((r)=>String(r.path).startsWith('/video-'))??[];
const snippetAround=(needle,before=3500,after=6500,max=5)=>{
  const out=[];
  for(let pos=text.indexOf(needle);pos>=0;pos=text.indexOf(needle,pos+1)){
    out.push({pos,snippet:text.slice(Math.max(0,pos-before),Math.min(text.length,pos+after))});
    if(out.length>=max)break;
  }
  return out;
};
const needles=['deriveIndependentPages','const records','records =','records=','pagePurpose:','pagePurpose =','route.pagePurpose','resource.pagePurpose','spec.pagePurpose'];
console.log(JSON.stringify({policy,routeEntries,videos},null,2));
for(const needle of needles){
  const snippets=snippetAround(needle);
  console.log(`\n===== NEEDLE ${JSON.stringify(needle)} (${snippets.length}) =====`);
  for(const [i,item] of snippets.entries())console.log(`\n--- ${i+1} @${item.pos} ---\n${item.snippet}`);
}
