import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {readFile,readdir} from 'node:fs/promises';

const root=process.cwd();
const mediaRoot=path.join(root,'public/media');
const inventoryPath=path.join(root,'src/data/media-dimensions.tsv');
const rasterPattern=/\.(?:avif|webp|jpe?g|png)$/i;
const fingerprintPattern=/\.([0-9a-f]{12})(\.[^.]+)$/i;
const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
const projectRelative=file=>path.relative(root,file).replaceAll('\\','/');

async function walk(directory){
  const output=[];
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const absolute=path.join(directory,entry.name);
    if(entry.isDirectory())output.push(...await walk(absolute));
    else if(entry.isFile())output.push(absolute);
  }
  return output;
}

const inventoryRows=(await readFile(inventoryPath,'utf8')).trim().split(/\r?\n/).filter(Boolean).map((line,index)=>{
  const [logical,widthRaw,heightRaw,...rest]=line.split('|');
  const width=Number(widthRaw),height=Number(heightRaw);
  if(rest.length||!logical||!Number.isInteger(width)||width<=0||!Number.isInteger(height)||height<=0)throw new Error(`Invalid media manifest row ${index+1}: ${line}`);
  if(!logical.startsWith('public/media/')||!rasterPattern.test(logical))throw new Error(`Invalid logical raster path in media manifest: ${logical}`);
  return {logical,width,height};
});
const manifestPaths=inventoryRows.map(row=>row.logical);
const manifestSet=new Set(manifestPaths);
if(manifestSet.size!==manifestPaths.length)throw new Error('Duplicate logical raster path in media manifest');
if(manifestSet.size!==49)throw new Error(`Canonical media manifest must contain exactly 49 raster assets; found ${manifestSet.size}`);

async function inspectPhysicalInventory(stage){
  const rasters=(await walk(mediaRoot)).filter(file=>rasterPattern.test(file)).sort();
  const logicalToPhysical=new Map();
  for(const file of rasters){
    const relative=projectRelative(file);
    const match=relative.match(fingerprintPattern);
    if(!match)throw new Error(`${stage}: unfingerprinted raster outside compiler contract: ${relative}`);
    const logical=relative.replace(fingerprintPattern,'$2');
    if(logicalToPhysical.has(logical))throw new Error(`${stage}: duplicate physical raster for logical asset ${logical}`);
    const bytes=await readFile(file);
    if(sha256(bytes).slice(0,12)!==match[1].toLowerCase())throw new Error(`${stage}: fingerprint mismatch ${relative}`);
    logicalToPhysical.set(logical,relative);
  }
  const actualSet=new Set(logicalToPhysical.keys());
  const missing=manifestPaths.filter(logical=>!actualSet.has(logical));
  const unexpected=[...actualSet].filter(logical=>!manifestSet.has(logical)).sort();
  if(missing.length||unexpected.length)throw new Error(`${stage}: media manifest boundary violation; missing=${missing.join(', ')||'none'}; unexpected=${unexpected.join(', ')||'none'}`);
  if(rasters.length!==manifestSet.size)throw new Error(`${stage}: physical raster count ${rasters.length} does not match manifest ${manifestSet.size}`);
  return logicalToPhysical;
}

await inspectPhysicalInventory('PRE_ENRICHMENT');
const worker=spawnSync(process.execPath,[path.join(root,'scripts/enrich-image-metadata.mjs')],{
  cwd:root,
  env:process.env,
  stdio:'inherit',
});
if(worker.error)throw worker.error;
if(worker.status!==0)throw new Error(`Media metadata worker failed with exit code ${worker.status}`);
await inspectPhysicalInventory('POST_ENRICHMENT');

console.log(JSON.stringify({mediaEnrichmentBoundary:'MANIFEST_LOCKED',manifest:'src/data/media-dimensions.tsv',logicalRasterAssets:manifestSet.size,worker:'scripts/enrich-image-metadata.mjs',preflight:'PASS',postflight:'PASS'},null,2));
