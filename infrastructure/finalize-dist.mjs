import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeFileForPath, discoverCriticalAssets } from './lib/dist-html.mjs';
import { generateHeaders, generateSecurityTxt } from './lib/headers.mjs';
import { deriveRoutingRows, renderRedirects } from '../src/lib/delivery-output.mjs';

async function pathExists(file){try{await fs.access(file);return true;}catch{return false;}}

export async function finalizeDist({distDir,routes,routingRows=[],sourceEdition,origin='https://www.ghezelbaash.ir',watchPosters=new Map(),securityEmail='doctor@ghezelbaash.ir',delivery=null,machineResources=[]}){
  if(!Array.isArray(routes)||routes.length!==72||new Set(routes).size!==72)throw new Error('Finalizer requires exactly 72 unique canonical routes');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(sourceEdition??''))throw new Error('Finalizer requires canonical source edition');
  for(const route of routes){const file=path.join(distDir,routeFileForPath(route));if(!(await pathExists(file)))throw new Error(`Missing canonical HTML: ${file}`);}
  const home=await fs.readFile(path.join(distDir,'index.html'),'utf8');
  const critical=discoverCriticalAssets(home);if(critical.css.length!==1)throw new Error(`Expected one critical stylesheet, found ${critical.css.length}`);
  await fs.writeFile(path.join(distDir,'_headers'),generateHeaders({origin,routes,cssPath:critical.css[0],watchPosters,earlyHints:true,delivery,machineResources}));
  await fs.writeFile(path.join(distDir,'_redirects'),renderRedirects(routingRows));
  const wellKnown=path.join(distDir,'.well-known');await fs.mkdir(wellKnown,{recursive:true});
  const expiry=new Date(`${sourceEdition}T00:00:00Z`);expiry.setUTCDate(expiry.getUTCDate()+182);
  await fs.writeFile(path.join(wellKnown,'security.txt'),generateSecurityTxt({origin,email:securityEmail,expires:expiry.toISOString().replace('.000Z','Z')}));
  return {htmlDocuments:routes.length,sourceEdition,distDir};
}

export async function extractSourceObject(sourceFile){
  const source=await fs.readFile(sourceFile,'utf8'),marker='export const SOURCE = ',at=source.indexOf(marker);if(at<0)throw new Error('SOURCE marker missing');
  const start=source.indexOf('{',at+marker.length);let depth=0,quoted=false,escaped=false,end=-1;
  for(let i=start;i<source.length;i++){const c=source[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){end=i+1;break;}}
  if(end<0)throw new Error('SOURCE object unclosed');return JSON.parse(source.slice(start,end));
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),distDir=path.resolve(process.argv[2]??path.join(root,'dist'));
  const SOURCE=await extractSourceObject(path.join(root,'src/pages/index.astro')),routes=SOURCE.routes.resources.map(entry=>entry.path),byId=new Map(SOURCE.graph['@graph'].map(node=>[node['@id'],node]));
  const watchPosters=new Map(SOURCE.discovery.sitemapPolicy.videoWatchPages.map(entry=>{const url=byId.get(entry.videoId)?.thumbnailUrl;if(typeof url!=='string')throw new Error('Video thumbnail missing: '+entry.videoId);const parsed=new URL(url);if(parsed.origin!==SOURCE.canonicalOrigin)throw new Error('Cross-origin video poster: '+entry.videoId);return[entry.path,parsed.pathname];}));
  const graph=JSON.parse(await fs.readFile(path.join(distDir,'graph.jsonld'),'utf8')),routingRows=deriveRoutingRows(SOURCE,graph);
  console.log(JSON.stringify(await finalizeDist({distDir,routes,routingRows,sourceEdition:SOURCE.edition,origin:SOURCE.canonicalOrigin,watchPosters,delivery:SOURCE.delivery,machineResources:SOURCE.machineResources}),null,2));
}
