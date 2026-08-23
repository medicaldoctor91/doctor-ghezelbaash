import {access,cp,mkdir,readdir,rename,rm} from 'node:fs/promises';
import path from 'node:path';

const WORKSPACE='.generated';
const NEXT='.generated.next';
const BACKUP='.generated.prev';
const required=[
  'content/home.md',
  'semantic/head-graph.json',
  'semantic/support-graph.json',
  'semantic/knowledge-graph.ttl',
  'projections/llms.txt',
  'projections/query-matrix.jsonl',
  'public/doctor.vcf',
  'public/clinic.vcf'
];
const semanticFiles=['head-graph.json','support-graph.json','service-index.csv','knowledge-graph.ttl','rdf-lock.json'];
const publicFiles=['doctor.vcf','clinic.vcf','query-matrix.jsonl','live-observations.jsonld'];

const exists=async target=>{try{await access(target);return true}catch{return false}};
const copyIfPresent=async(source,target)=>{if(!(await exists(source)))return false;await mkdir(path.dirname(target),{recursive:true});await cp(source,target,{recursive:true});return true};
const removeIfPresent=async target=>{if(await exists(target))await rm(target,{recursive:true,force:true})};

await removeIfPresent(NEXT);
await mkdir(NEXT,{recursive:true});

await copyIfPresent('src/content/home.md',path.join(NEXT,'content/home.md'));
await copyIfPresent('src/data/projections',path.join(NEXT,'projections'));
for(const file of semanticFiles)await copyIfPresent(path.join('src/data/semantic',file),path.join(NEXT,'semantic',file));
await copyIfPresent('src/data/semantic/settings',path.join(NEXT,'semantic/settings'));
for(const file of publicFiles)await copyIfPresent(path.join('public',file),path.join(NEXT,'public',file));

const assetsDir='public/assets';
if(await exists(assetsDir)){
  const names=await readdir(assetsDir);
  const generatedCss=names.filter(name=>/^site\.[a-f0-9]+\.css$/i.test(name));
  if(generatedCss.length!==1)throw new Error(`Expected exactly one generated site CSS asset, found ${generatedCss.length}`);
  await copyIfPresent(path.join(assetsDir,generatedCss[0]),path.join(NEXT,'public/assets',generatedCss[0]));
}

for(const relative of required)if(!(await exists(path.join(NEXT,relative))))throw new Error(`Generated workspace missing required artifact: ${relative}`);
const cssNames=await readdir(path.join(NEXT,'public/assets'));
if(cssNames.filter(name=>/^site\.[a-f0-9]+\.css$/i.test(name)).length!==1)throw new Error('Generated workspace CSS contract drift');

await removeIfPresent(BACKUP);
if(await exists(WORKSPACE))await rename(WORKSPACE,BACKUP);
try{
  await rename(NEXT,WORKSPACE);
  await removeIfPresent(BACKUP);
}catch(error){
  if(await exists(BACKUP))await rename(BACKUP,WORKSPACE);
  throw error;
}

await removeIfPresent('src/content');
await removeIfPresent('src/data/projections');
for(const file of semanticFiles)await removeIfPresent(path.join('src/data/semantic',file));
await removeIfPresent('src/data/semantic/settings');
for(const file of publicFiles)await removeIfPresent(path.join('public',file));
if(await exists(assetsDir)){
  for(const name of await readdir(assetsDir))if(/^site\.[a-f0-9]+\.css$/i.test(name))await rm(path.join(assetsDir,name),{force:true});
}

for(const legacy of ['src/content/home.md','src/data/projections','src/data/semantic/head-graph.json','src/data/semantic/support-graph.json','src/data/semantic/knowledge-graph.ttl','public/doctor.vcf','public/clinic.vcf','public/query-matrix.jsonl'])if(await exists(legacy))throw new Error(`Legacy generated staging residue remains: ${legacy}`);

console.log(JSON.stringify({
  stage:'GENERATED_WORKSPACE_PROMOTION',
  workspace:WORKSPACE,
  requiredArtifacts:required.length,
  legacyStagingResidue:0,
  promotion:'ATOMIC',
  integrity:'PASS'
},null,2));
