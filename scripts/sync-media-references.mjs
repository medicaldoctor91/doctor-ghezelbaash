import path from 'node:path';
import {readFile,readdir,writeFile} from 'node:fs/promises';

const root=process.cwd();
const mediaRoot=path.join(root,'public/media');
const rasterPattern=/\.(?:avif|webp|jpe?g|png)$/i;
const textPattern=/\.(?:astro|css|html|js|json|jsonld|md|mjs|ts|txt|vcf|xml|yaml|yml)$/i;
const fingerprintPattern=/\.([0-9a-f]{12})\.[^.]+$/;
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

async function walk(directory,{skip=[]}={}){
  const output=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    if(skip.includes(entry.name))continue;
    const absolute=path.join(directory,entry.name);
    if(entry.isDirectory())output.push(...await walk(absolute,{skip}));
    else output.push(absolute);
  }
  return output;
}

const rasters=(await walk(mediaRoot)).filter(file=>rasterPattern.test(file)).sort();
if(rasters.length!==49)throw new Error(`Expected 49 canonical raster assets, found ${rasters.length}`);
const canonical=[];
for(const file of rasters){
  const basename=path.basename(file),extension=path.extname(basename);
  if(!fingerprintPattern.test(basename))throw new Error(`Unfingerprinted raster ${file}`);
  const logicalBasename=basename.replace(fingerprintPattern,extension);
  canonical.push({basename,stem:logicalBasename.slice(0,-extension.length),extension});
}

const textual=(await walk(root,{skip:['node_modules','.python-deps','dist','release','.astro']}))
  .filter(file=>textPattern.test(file)&&!file.startsWith(mediaRoot+path.sep));
let changedFiles=0,replacements=0;
for(const file of textual){
  const original=await readFile(file,'utf8');
  let next=original;
  for(const item of canonical){
    const expression=new RegExp(`${escapeRegExp(item.stem)}\\.[0-9a-f]{12}${escapeRegExp(item.extension)}`,'g');
    next=next.replace(expression,match=>{if(match===item.basename)return match;replacements++;return item.basename;});
  }
  if(next!==original){await writeFile(file,next);changedFiles++;}
}

const stale=[];
for(const file of textual){
  const text=await readFile(file,'utf8');
  for(const item of canonical){
    const expression=new RegExp(`${escapeRegExp(item.stem)}\\.([0-9a-f]{12})${escapeRegExp(item.extension)}`,'g');
    for(const match of text.matchAll(expression))if(match[0]!==item.basename)stale.push(`${path.relative(root,file)}:${match[0]}`);
  }
}
if(stale.length)throw new Error(`Stale raster references remain:\n${stale.slice(0,20).join('\n')}`);
console.log(JSON.stringify({canonicalRasterAssets:canonical.length,textFilesScanned:textual.length,textFilesUpdated:changedFiles,replacements,staleReferences:0},null,2));
