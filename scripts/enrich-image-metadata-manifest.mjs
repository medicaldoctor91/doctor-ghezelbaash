import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {cp,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';

const root=process.cwd();
const mediaRoot=path.join(root,'public/media');
const inventoryPath=path.join(root,'src/data/media-dimensions.tsv');
const rasterPattern=/\.(?:avif|webp|jpe?g|png)$/i;
const textPattern=/\.(?:astro|css|html|js|json|jsonld|md|mjs|ts|tsv|txt|vcf|webmanifest|xml|yaml|yml)$/i;
const fingerprintPattern=/\.([0-9a-f]{12})(\.[^.]+)$/i;
const snapshotSkip=new Set(['node_modules','.python-deps','dist','release','.astro','.git']);
const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
const projectRelative=file=>path.relative(root,file).replaceAll('\\','/');
const compilerWritableConsumer=file=>{
  const relative=projectRelative(file);
  return relative.startsWith('src/')||(relative.startsWith('public/')&&!relative.startsWith('public/media/'));
};

async function walk(directory,{bounded=false}={}){
  const output=[];
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(bounded&&snapshotSkip.has(entry.name))continue;
    const absolute=path.join(directory,entry.name);
    if(entry.isDirectory())output.push(...await walk(absolute,{bounded}));
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

async function captureSnapshot(){
  const transactionRoot=await mkdtemp(path.join(tmpdir(),'ghezel-media-transaction-'));
  const mediaBackup=path.join(transactionRoot,'media');
  await cp(mediaRoot,mediaBackup,{recursive:true,preserveTimestamps:true});
  const writableTextFiles=(await walk(root,{bounded:true})).filter(file=>textPattern.test(file)&&compilerWritableConsumer(file)).sort();
  const textSnapshot=await Promise.all(writableTextFiles.map(async file=>({file,bytes:await readFile(file)})));
  return {transactionRoot,mediaBackup,textSnapshot};
}

async function restoreSnapshot(snapshot){
  const rollbackErrors=[];
  try{
    await rm(mediaRoot,{recursive:true,force:true});
    await cp(snapshot.mediaBackup,mediaRoot,{recursive:true,preserveTimestamps:true});
  }catch(error){rollbackErrors.push({surface:'public/media',message:error.message});}
  for(const entry of snapshot.textSnapshot){
    try{await writeFile(entry.file,entry.bytes);}catch(error){rollbackErrors.push({surface:projectRelative(entry.file),message:error.message});}
  }
  return rollbackErrors;
}

await inspectPhysicalInventory('PRE_ENRICHMENT');
const snapshot=await captureSnapshot();
let committed=false;
try{
  const worker=spawnSync(process.execPath,[path.join(root,'scripts/enrich-image-metadata.mjs')],{
    cwd:root,
    env:process.env,
    stdio:'inherit',
  });
  if(worker.error)throw worker.error;
  if(worker.status!==0)throw new Error(`Media metadata worker failed with exit code ${worker.status}`);
  await inspectPhysicalInventory('POST_ENRICHMENT');
  committed=true;
}catch(error){
  const rollbackErrors=await restoreSnapshot(snapshot);
  try{await inspectPhysicalInventory('POST_ROLLBACK');}catch(verificationError){rollbackErrors.push({surface:'rollback-verification',message:verificationError.message});}
  if(rollbackErrors.length)error.rollbackErrors=rollbackErrors;
  throw error;
}finally{
  await rm(snapshot.transactionRoot,{recursive:true,force:true}).catch(()=>{});
}

console.log(JSON.stringify({mediaEnrichmentBoundary:'MANIFEST_LOCKED',transaction:'MEDIA_ENRICHMENT_TRANSACTION',manifest:'src/data/media-dimensions.tsv',logicalRasterAssets:manifestSet.size,worker:'scripts/enrich-image-metadata.mjs',snapshotTraversal:'BOUNDED',preflight:'PASS',postflight:'PASS',rollback:'BYTE_SNAPSHOT',committed},null,2));
