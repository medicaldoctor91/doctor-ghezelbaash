import path from 'node:path';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createDeterministicZip,walkFiles} from './lib/deterministic-zip.mjs';

const root=process.cwd(),release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8'));
const outputDir=path.join(root,'release'),folder=`doctor-ghezelbaash-max-power-source-v${release.release}`;
const output=path.join(outputDir,`${folder}-production-clean-${release.dateModified}.zip`);
const excludedPrefixes=['node_modules/','.python-deps/','.astro/','dist/','release/','src/data/projections/'];
const excludedExact=new Set(['src/content/home.md','src/data/semantic/head-graph.json','src/data/semantic/support-graph.json','src/data/semantic/knowledge-graph.ttl','src/data/semantic/rdf-lock.json','public/doctor.vcf','public/clinic.vcf','.release/zenodo-reservation.json']);
const filter=(relative,entry)=>{
  const normalized=relative.replaceAll('\\','/'),candidate=entry.isDirectory()?`${normalized}/`:normalized;
  if(excludedPrefixes.some(prefix=>candidate.startsWith(prefix)))return false;
  if(excludedExact.has(normalized)||/^public\/assets\/site\.[0-9a-f]{12}\.css$/.test(normalized)||normalized.endsWith('_exiftool_tmp')||normalized.endsWith('.log'))return false;
  return true;
};
const files=await walkFiles(root,{filter}),entries=files.map(file=>({name:`${folder}/${file.name}`,data:file.data}));
const archive=createDeterministicZip(entries),sha256=createHash('sha256').update(archive).digest('hex');
await mkdir(outputDir,{recursive:true});await writeFile(output,archive);
console.log(JSON.stringify({output,files:entries.length,uncompressedBytes:entries.reduce((sum,file)=>sum+file.data.length,0),archiveBytes:archive.length,sha256},null,2));
