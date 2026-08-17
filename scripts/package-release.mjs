import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createDeterministicZip,walkFiles} from './lib/deterministic-zip.mjs';

const root=process.cwd();
const mode=process.argv[2];
if(!['source','dist','complete'].includes(mode))throw new Error('Usage: node scripts/package-release.mjs <source|dist|complete>');
const release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8'));
const releaseDir=path.join(root,'release');
const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
const sourceFolder=`doctor-ghezelbaash-max-power-source-v${release.release}`;
const sourceName=`${sourceFolder}-production-clean-${release.dateModified}.zip`;
const distName=`doctor-ghezelbaash-max-power-dist-v${release.release.split('.')[0]}-${release.dateModified}.zip`;
const completeName=`doctor-ghezelbaash-max-power-complete-v${release.release}-${release.dateModified}.zip`;
await mkdir(releaseDir,{recursive:true});

async function packageSource(){
  const raw=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'buffer'}).toString('utf8');
  const names=raw.split('\0').filter(Boolean).sort((a,b)=>a.localeCompare(b));
  if(!names.length)throw new Error('Tracked-source inventory is empty');
  const entries=[];
  for(const name of names){
    const normalized=name.replaceAll('\\','/');
    if(normalized==='.git'||normalized.startsWith('.git/'))throw new Error(`Git internals leaked into tracked source inventory: ${normalized}`);
    if(normalized.startsWith('.release/runtime/')||normalized.startsWith('.release/huggingface/'))throw new Error(`Runtime external state leaked into source inventory: ${normalized}`);
    entries.push({name:`${sourceFolder}/${normalized}`,data:await readFile(path.join(root,name))});
  }
  const archive=createDeterministicZip(entries),output=path.join(releaseDir,sourceName);
  await writeFile(output,archive);
  return {output,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),inventory:'git-ls-files',files:entries.length,uncompressedBytes:entries.reduce((sum,file)=>sum+file.data.length,0),archiveBytes:archive.length,sha256:sha256(archive)};
}

async function packageDist(){
  const entries=await walkFiles(path.join(root,'dist'));
  if(!entries.length)throw new Error('DIST inventory is empty');
  const archive=createDeterministicZip(entries),output=path.join(releaseDir,distName);
  await writeFile(output,archive);
  return {output,files:entries.length,archiveBytes:archive.length,sha256:sha256(archive)};
}

async function packageComplete(){
  const source=await readFile(path.join(releaseDir,sourceName));
  const dist=await readFile(path.join(releaseDir,distName));
  const artifact=JSON.parse(await readFile(path.join(root,'dist/artifact-manifest.json'),'utf8'));
  const manifest={
    release:release.release,
    dateModified:release.dateModified,
    canonicalUrl:release.canonicalUrl,
    primaryEntity:release.primaryEntity.id,
    priceRange:release.clinic.priceRange,
    quality:{
      htmlBytes:artifact.invariants.htmlBytes,
      graphNodes:artifact.invariants.externalGraphNodeCount,
      rdfTriples:artifact.invariants.externalRdfTripleCount,
      ragPassages:artifact.invariants.ragPassageCount,
      renderChunks:artifact.invariants.renderChunkCount,
      captionTracks:artifact.video.captionTrackCount
    },
    artifacts:[
      {name:sourceName,bytes:source.length,sha256:sha256(source),role:'production-clean reproducible source'},
      {name:distName,bytes:dist.length,sha256:sha256(dist),role:'validated deploy-ready static distribution'}
    ]
  };
  const entries=[{name:sourceName,data:source},{name:distName,data:dist},{name:'release-manifest.json',data:Buffer.from(`${JSON.stringify(manifest,null,2)}\n`)}];
  const archive=createDeterministicZip(entries),output=path.join(releaseDir,completeName);
  await writeFile(output,archive);
  return {output,entries:entries.map(entry=>entry.name),archiveBytes:archive.length,sha256:sha256(archive)};
}

const result=mode==='source'?await packageSource():mode==='dist'?await packageDist():await packageComplete();
console.log(JSON.stringify({mode,...result},null,2));
