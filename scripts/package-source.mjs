import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createDeterministicZip} from './lib/deterministic-zip.mjs';
import {releaseArtifactNames} from './lib/release-artifacts.mjs';

const root=process.cwd(),release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8')),names=releaseArtifactNames(release);
const outputDir=path.join(root,'release'),folder=names.sourceFolder,output=path.join(outputDir,names.source);
const raw=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'buffer'}).toString('utf8');
const tracked=raw.split('\0').filter(Boolean).sort((a,b)=>a.localeCompare(b));
if(!tracked.length)throw new Error('Tracked-source inventory is empty');
for(const name of tracked){
  if(name==='.git'||name.startsWith('.git/'))throw new Error(`Git internals leaked into tracked source inventory: ${name}`);
  if(name.startsWith('.release/runtime/')||name.startsWith('.release/huggingface/'))throw new Error(`Runtime external state leaked into source inventory: ${name}`);
}
const entries=[];
for(const name of tracked)entries.push({name:`${folder}/${name.replaceAll('\\','/')}`,data:await readFile(path.join(root,name))});
const archive=createDeterministicZip(entries),sha256=createHash('sha256').update(archive).digest('hex');
await mkdir(outputDir,{recursive:true});await writeFile(output,archive);
console.log(JSON.stringify({output,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),inventory:'git-ls-files',files:entries.length,uncompressedBytes:entries.reduce((sum,file)=>sum+file.data.length,0),archiveBytes:archive.length,sha256},null,2));
