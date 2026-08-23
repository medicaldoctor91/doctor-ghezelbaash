import path from 'node:path';
import {copyFile,mkdir,readFile,readdir} from 'node:fs/promises';
import {STATIC_ARTIFACTS} from './lib/static-artifacts.mjs';

const root=process.cwd();
const dist=path.resolve(root,process.argv[2]||'dist');
const pageSurface=(await readdir(path.join(root,'src/pages'),{withFileTypes:true})).map(entry=>entry.name).sort();
if(JSON.stringify(pageSurface)!==JSON.stringify(['404.astro','index.astro']))throw new Error(`Astro route surface must remain exactly index.astro + 404.astro; found: ${pageSurface.join(', ')}`);

const resolveInside=(base,relative,label)=>{
  const target=path.resolve(base,String(relative));
  const rel=path.relative(base,target);
  if(!relative||rel.startsWith('..')||path.isAbsolute(rel))throw new Error(`${label} escapes its root: ${relative}`);
  return target;
};
const destinations=new Set();
const copyExact=async(sourceRelative,destinationRelative)=>{
  if(destinations.has(destinationRelative))throw new Error(`Duplicate static artifact destination: ${destinationRelative}`);
  destinations.add(destinationRelative);
  const source=resolveInside(root,sourceRelative,'Static artifact source');
  const destination=resolveInside(dist,destinationRelative,'Static artifact destination');
  await mkdir(path.dirname(destination),{recursive:true});
  await copyFile(source,destination);
};

for(const artifact of STATIC_ARTIFACTS)await copyExact(artifact.source,artifact.path);

const generatedPublic=path.join(root,'.generated/public');
const materializeGeneratedPublic=async(directory,relative='')=>{
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const next=path.posix.join(relative,entry.name);
    const source=path.join(directory,entry.name);
    if(entry.isDirectory())await materializeGeneratedPublic(source,next);
    else if(entry.isFile())await copyExact(path.posix.join('.generated/public',next),next);
    else throw new Error(`Unsupported generated public entry: ${next}`);
  }
};
await materializeGeneratedPublic(generatedPublic);

const stableMedia=JSON.parse(await readFile(path.join(root,'src/data/stable-media-aliases.json'),'utf8'));
if(!Array.isArray(stableMedia.aliases)||stableMedia.aliases.length!==6)throw new Error(`Stable media alias inventory drift: ${stableMedia.aliases?.length??'invalid'}`);
for(const alias of stableMedia.aliases){
  if(!alias||typeof alias.path!=='string'||typeof alias.target!=='string')throw new Error('Invalid stable media alias entry');
  const source=resolveInside(path.join(root,'public'),alias.target,'Stable media source');
  const destination=resolveInside(dist,alias.path,'Stable media destination');
  if(destinations.has(alias.path))throw new Error(`Stable media destination collides with generated/static artifact: ${alias.path}`);
  destinations.add(alias.path);
  await mkdir(path.dirname(destination),{recursive:true});
  await copyFile(source,destination);
}

console.log(JSON.stringify({
  materialized:true,
  astroRoutes:pageSurface,
  machineArtifacts:STATIC_ARTIFACTS.length,
  generatedPublic:true,
  stableMediaAliases:stableMedia.aliases.length,
  destinations:destinations.size,
  routeWrappers:0,
},null,2));
