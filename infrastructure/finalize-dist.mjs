import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeFileForPath, discoverCriticalAssets } from './lib/dist-html.mjs';
import { generateHeaders, generateSecurityTxt } from './lib/headers.mjs';
import { deriveRoutingRows, renderRedirects } from '../src/lib/delivery-output.mjs';

async function pathExists(file){try{await fs.access(file);return true;}catch{return false;}}

export function serializeJsonLdForHtml(value){
  return JSON.stringify(value)
    .replaceAll('<','\\u003c')
    .replaceAll('\u2028','\\u2028')
    .replaceAll('\u2029','\\u2029');
}

export function replaceHomeStructuredDataWithCanonicalGraph(homeHtml,graph){
  if(typeof homeHtml!=='string'||!homeHtml.includes('</head>'))throw new Error('Home HTML must contain a closing head');
  if(!graph||typeof graph!=='object'||!Array.isArray(graph['@graph']))throw new Error('Canonical graph.jsonld must contain an @graph array');
  const target=/<script\b(?=[^>]*\bid=["']schema-core-mainentity["'])(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi;
  const matches=[...homeHtml.matchAll(target)];
  if(matches.length!==1)throw new Error(`Home must contain exactly one schema-core-mainentity JSON-LD script before finalization; found ${matches.length}`);
  const payload=serializeJsonLdForHtml(graph);
  const script=`<script id="schema-core-mainentity" type="application/ld+json">${payload}</script>`;
  const html=homeHtml.replace(target,script);
  const allJsonLd=[...html.matchAll(/<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi)];
  if(allJsonLd.length!==1)throw new Error(`Home must contain exactly one JSON-LD script after canonical graph replacement; found ${allJsonLd.length}`);
  const scriptStart=html.indexOf('id="schema-core-mainentity"');
  const scriptEnd=html.indexOf('</script>',scriptStart)+'</script>'.length;
  return {html,graphNodes:graph['@graph'].length,graphScriptEndBytes:Buffer.byteLength(html.slice(0,scriptEnd),'utf8')};
}

export async function finalizeDist({distDir,routes,routingRows=[],sourceEdition,origin='https://www.ghezelbaash.ir',watchPosters=new Map(),securityEmail='doctor@ghezelbaash.ir',delivery=null,machineResources=[]}){
  if(!Array.isArray(routes)||routes.length!==72||new Set(routes).size!==72)throw new Error('Finalizer requires exactly 72 unique canonical routes');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(sourceEdition??''))throw new Error('Finalizer requires canonical source edition');
  for(const route of routes){const file=path.join(distDir,routeFileForPath(route));if(!(await pathExists(file)))throw new Error(`Missing canonical HTML: ${file}`);}
  const homeFile=path.join(distDir,'index.html');
  const graphFile=path.join(distDir,'graph.jsonld');
  if(!(await pathExists(graphFile)))throw new Error(`Missing canonical graph: ${graphFile}`);
  const home=await fs.readFile(homeFile,'utf8');
  const canonicalGraph=JSON.parse(await fs.readFile(graphFile,'utf8'));
  const replaced=replaceHomeStructuredDataWithCanonicalGraph(home,canonicalGraph);
  await fs.writeFile(homeFile,replaced.html);
  const critical=discoverCriticalAssets(replaced.html);if(critical.css.length!==1)throw new Error(`Expected one critical stylesheet, found ${critical.css.length}`);
  await fs.writeFile(path.join(distDir,'_headers'),generateHeaders({origin,routes,cssPath:critical.css[0],watchPosters,earlyHints:true,delivery,machineResources}));
  await fs.writeFile(path.join(distDir,'_redirects'),renderRedirects(routingRows));
  const wellKnown=path.join(distDir,'.well-known');await fs.mkdir(wellKnown,{recursive:true});
  const expiry=new Date(`${sourceEdition}T00:00:00Z`);expiry.setUTCDate(expiry.getUTCDate()+182);
  await fs.writeFile(path.join(wellKnown,'security.txt'),generateSecurityTxt({origin,email:securityEmail,expires:expiry.toISOString().replace('.000Z','Z')}));
  return {htmlDocuments:routes.length,sourceEdition,distDir,canonicalGraphInline:true,canonicalGraphNodes:replaced.graphNodes,canonicalGraphScriptEndBytes:replaced.graphScriptEndBytes,homeJsonLdScripts:1};
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
