import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createDeterministicZip} from './lib/deterministic-zip.mjs';

const root=process.cwd(),release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8'));
const outputDir=path.join(root,'release'),folder=`doctor-ghezelbaash-max-power-source-v${release.release}`;
const output=path.join(outputDir,`${folder}-production-clean-${release.dateModified}.zip`);
const raw=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'buffer'}).toString('utf8');
const names=raw.split('\0').filter(Boolean).sort((a,b)=>a.localeCompare(b));
if(!names.length)throw new Error('Tracked-source inventory is empty');
const forbiddenCurrentControl=new Set(['.release/release-attestation.json','.release/release-request.json','.release/zenodo-published.json']);
for(const name of names){
  if(name==='.git'||name.startsWith('.git/'))throw new Error(`Git internals leaked into tracked source inventory: ${name}`);
  if(name.startsWith('.release/runtime/')||name.startsWith('.release/huggingface/'))throw new Error(`Runtime external state leaked into source inventory: ${name}`);
  if(forbiddenCurrentControl.has(name))throw new Error(`Historical release-control file remains current-root tracked: ${name}`);
}
const entries=[];
for(const name of names)entries.push({name:`${folder}/${name.replaceAll('\\','/')}`,data:await readFile(path.join(root,name))});
const archive=createDeterministicZip(entries),sha256=createHash('sha256').update(archive).digest('hex');
await mkdir(outputDir,{recursive:true});await writeFile(output,archive);
console.log(JSON.stringify({output,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),inventory:'git-ls-files',files:entries.length,uncompressedBytes:entries.reduce((sum,file)=>sum+file.data.length,0),archiveBytes:archive.length,sha256},null,2));
