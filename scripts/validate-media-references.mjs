import path from 'node:path';
import {readFile,readdir} from 'node:fs/promises';

const root=process.cwd();
const mediaRoot=path.join(root,'public/media');
const rasterPattern=/\.(?:avif|webp|jpe?g|png)$/i;
const publishedMediaPattern=/\.(?:avif|webp|jpe?g|png|mp4|webm|vtt)$/i;
const textPattern=/\.(?:astro|css|html|js|json|jsonld|md|mjs|ts|txt|vcf|webmanifest|xml|yaml|yml)$/i;
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

const published=(await walk(mediaRoot)).filter(file=>publishedMediaPattern.test(file)).sort();
const canonicalPublished=[];
for(const file of published){
  const basename=path.basename(file),extension=path.extname(basename);
  if(!fingerprintPattern.test(basename))throw new Error(`Unfingerprinted published media ${file}`);
  const logicalBasename=basename.replace(fingerprintPattern,extension);
  canonicalPublished.push({basename,stem:logicalBasename.slice(0,-extension.length),extension});
}

const textual=(await walk(root,{skip:['node_modules','.python-deps','dist','release','.astro']}))
  .filter(file=>textPattern.test(file)&&!file.startsWith(mediaRoot+path.sep));
const stale=[];
for(const file of textual){
  const text=await readFile(file,'utf8');
  for(const item of canonicalPublished){
    const expression=new RegExp(`${escapeRegExp(item.stem)}\\.([0-9a-f]{12})${escapeRegExp(item.extension)}`,'g');
    for(const match of text.matchAll(expression))if(match[0]!==item.basename)stale.push(`${path.relative(root,file)}:${match[0]} -> ${item.basename}`);
  }
}
if(stale.length)throw new Error(`Stale raster references detected; update canonical source instead of mutating it during build:\n${stale.slice(0,40).join('\n')}`);
console.log(JSON.stringify({canonicalRasterAssets:canonical.length,canonicalPublishedMediaAssets:canonicalPublished.length,textFilesScanned:textual.length,staleReferences:0,sourceMutation:false,integrity:'PASS'},null,2));
