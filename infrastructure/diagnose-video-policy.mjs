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
const routes=SOURCE.routes?.resources?.filter((r)=>String(r.path).startsWith('/video-')).map((r)=>r.path)??[];
const needle='Invalid watch-page video sitemap policy';
const at=text.indexOf(needle);
const validatorSnippet=at>=0?text.slice(Math.max(0,at-5000),Math.min(text.length,at+5000)):'NOT FOUND';
const target='https://www.ghezelbaash.ir/#video-jalupro-vs-profhilo';
const occurrences=[];
for(let pos=text.indexOf(target);pos>=0;pos=text.indexOf(target,pos+1)){
  occurrences.push({pos,snippet:text.slice(Math.max(0,pos-1200),Math.min(text.length,pos+2200))});
  if(occurrences.length>=20)break;
}
console.log(JSON.stringify({policy,routes,videos,targetOccurrences:occurrences.length},null,2));
console.log('\n--- VALIDATOR SNIPPET ---\n'+validatorSnippet);
for(const [i,item] of occurrences.entries())console.log(`\n--- TARGET OCCURRENCE ${i+1} @${item.pos} ---\n${item.snippet}`);
