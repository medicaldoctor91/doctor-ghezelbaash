import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createDeterministicZip,walkFiles} from './lib/deterministic-zip.mjs';
import {releaseArtifactNames} from './lib/release-artifacts.mjs';

const root=process.cwd();
const release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8'));
const names=releaseArtifactNames(release),releaseDir=path.join(root,'release');
const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');
const action=process.argv[2]||'dist';

if(action==='dist'){
  const entries=await walkFiles(path.join(root,'dist'));
  if(!entries.length)throw new Error('DIST inventory is empty');
  const archive=createDeterministicZip(entries),output=path.join(releaseDir,names.dist);
  await mkdir(releaseDir,{recursive:true});
  await writeFile(output,archive);
  console.log(JSON.stringify({output,files:entries.length,uncompressedBytes:entries.reduce((sum,file)=>sum+file.data.length,0),archiveBytes:archive.length,sha256:sha256(archive)},null,2));
}else if(action==='source'){
  const raw=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'buffer'}).toString('utf8');
  const tracked=raw.split('\0').filter(Boolean).sort((a,b)=>a.localeCompare(b));
  if(!tracked.length)throw new Error('Tracked-source inventory is empty');
  for(const name of tracked){
    if(name==='.git'||name.startsWith('.git/'))throw new Error(`Git internals leaked into tracked source inventory: ${name}`);
    if(name.startsWith('.release/runtime/')||name.startsWith('.release/huggingface/'))throw new Error(`Runtime external state leaked into source inventory: ${name}`);
  }
  const entries=[];
  for(const name of tracked)entries.push({name:`${names.sourceFolder}/${name.replaceAll('\\','/')}`,data:await readFile(path.join(root,name))});
  const archive=createDeterministicZip(entries),output=path.join(releaseDir,names.source);
  await mkdir(releaseDir,{recursive:true});
  await writeFile(output,archive);
  console.log(JSON.stringify({output,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),inventory:'git-ls-files',files:entries.length,uncompressedBytes:entries.reduce((sum,file)=>sum+file.data.length,0),archiveBytes:archive.length,sha256:sha256(archive)},null,2));
}else if(action==='complete'){
  const artifact=JSON.parse(await readFile(path.join(root,'dist/artifact-manifest.json'),'utf8'));
  const dist=await readFile(path.join(releaseDir,names.dist)),source=await readFile(path.join(releaseDir,names.source));
  const manifest={release:release.release,dateModified:release.dateModified,canonicalUrl:release.canonicalUrl,primaryEntity:release.primaryEntity.id,priceRange:release.clinic.priceRange,quality:{htmlBytes:artifact.invariants.htmlBytes,graphNodes:artifact.invariants.externalGraphNodeCount,rdfTriples:artifact.invariants.externalRdfTripleCount,ragPassages:artifact.invariants.ragPassageCount,renderChunks:artifact.invariants.renderChunkCount,captionTracks:artifact.video.captionTrackCount},artifacts:[{name:names.source,bytes:source.length,sha256:sha256(source),role:'production-clean reproducible source'},{name:names.dist,bytes:dist.length,sha256:sha256(dist),role:'validated deploy-ready static distribution'}]};
  const manifestBytes=Buffer.from(`${JSON.stringify(manifest,null,2)}\n`),entries=[{name:names.source,data:source},{name:names.dist,data:dist},{name:'release-manifest.json',data:manifestBytes}];
  const archive=createDeterministicZip(entries),output=path.join(releaseDir,names.complete);
  await writeFile(output,archive);
  console.log(JSON.stringify({output,entries:entries.map(entry=>entry.name),archiveBytes:archive.length,sha256:sha256(archive)},null,2));
}else{
  throw new Error('Usage: node scripts/package-dist.mjs [dist|source|complete]');
}
