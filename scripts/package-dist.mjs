import path from 'node:path';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createDeterministicZip,walkFiles} from './lib/deterministic-zip.mjs';
import {releaseArtifactNames} from './lib/release-artifacts.mjs';

const root=process.cwd();
const release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8'));
const source=path.join(root,'dist'),outputDir=path.join(root,'release'),names=releaseArtifactNames(release),output=path.join(outputDir,names.dist);
const entries=await walkFiles(source);
if(!entries.length)throw new Error('DIST inventory is empty');
const archive=createDeterministicZip(entries),sha256=createHash('sha256').update(archive).digest('hex');
await mkdir(outputDir,{recursive:true});
await writeFile(output,archive);
console.log(JSON.stringify({output,files:entries.length,uncompressedBytes:entries.reduce((sum,file)=>sum+file.data.length,0),archiveBytes:archive.length,sha256},null,2));
