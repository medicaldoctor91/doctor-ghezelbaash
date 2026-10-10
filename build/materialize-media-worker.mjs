import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {sha256Hex} from './lib/hash.mjs';

export async function renderMediaWorker({distDir,source}){
 const paths=[...new Set(source.graph['@graph'].flatMap(node=>{
  if(![].concat(node['@type']??[]).includes('MediaObject')||typeof node.contentUrl!=='string')return [];
  const url=new URL(node.contentUrl);
  return url.origin===source.canonicalOrigin&&/^\/media\/videos\/.+\.(?:mp4|webm)$/.test(url.pathname)?[url.pathname]:[];
 }))].sort();
 assert.equal(paths.length,8,'Exactly the eight canonical video encodings use the range Worker');
 const media={};
 for(const name of paths){const bytes=await fs.readFile(path.join(distDir,name.slice(1)));media[name]={bytes:bytes.length,sha256:sha256Hex(bytes),mediaType:name.endsWith('.mp4')?'video/mp4':'video/webm'};}
 const blocks=(await fs.readFile(path.join(distDir,'_headers'),'utf8')).trim().split(/\n\s*\n/).map(block=>block.split('\n'));
 const global=blocks.find(([pattern])=>pattern==='/*');assert(global,'The video Worker requires the finalized global header policy');
 const headers=Object.fromEntries(global.slice(1).map(line=>{const colon=line.indexOf(':');assert(colon>0,'Malformed global header');return [line.slice(0,colon).trim(),line.slice(colon+1).trim()];}));
 const runtime=await fs.readFile(new URL('./lib/media-range-worker.mjs',import.meta.url),'utf8');
 return {worker:runtime+`\nexport default createMediaRangeWorker(${JSON.stringify(media)},${JSON.stringify({headers})});\n`,routes:JSON.stringify({version:1,include:paths,exclude:[]},null,2)+'\n',media};
}
export async function materializeMediaWorker(options){
 const output=await renderMediaWorker(options);
 await fs.writeFile(path.join(options.distDir,'_worker.js'),output.worker);
 await fs.writeFile(path.join(options.distDir,'_routes.json'),output.routes);
 return {nativeVideoRangeFiles:Object.keys(output.media).length};
}
export async function verifyMediaWorker(options){
 const expected=await renderMediaWorker(options);
 assert.equal(await fs.readFile(path.join(options.distDir,'_worker.js'),'utf8'),expected.worker,'Sealed range Worker uses exactly the current video bytes');
 assert.equal(await fs.readFile(path.join(options.distDir,'_routes.json'),'utf8'),expected.routes,'Only canonical video files invoke the range Worker');
 return {nativeVideoRangeFiles:Object.keys(expected.media).length};
}
