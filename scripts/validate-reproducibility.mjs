import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const root=process.cwd();
const cssSource=await readFile(path.join(root,'src/styles/global.css'),'utf8'),cssMarker='/*DIST_CRITICAL_CSS_END*/',cssAt=cssSource.indexOf(cssMarker);if(cssAt<0)throw new Error('Critical CSS split marker missing');const externalCss=cssSource.slice(cssAt+cssMarker.length),cssHash=createHash('sha256').update(externalCss).digest('hex').slice(0,12),cssAsset=`public/assets/site.${cssHash}.css`;
const files=[
 'src/content/home.md',
 'src/data/semantic/head-graph.json','src/data/semantic/support-graph.json',
 'src/data/projections/entity-facts.csv','src/data/projections/answers.txt','src/data/projections/knowledge.xml',
 'src/data/projections/index.md','src/data/projections/llms-full.txt','src/data/projections/llms.txt',
 'src/data/projections/provenance.jsonld','src/data/projections/evidence-snapshot.json',
 'src/data/projections/datapackage.json','src/data/projections/linkset.json','src/data/projections/void.ttl','src/data/projections/dcat.ttl','src/data/projections/croissant.json','src/data/projections/sitemap.xml',
 'public/doctor.vcf','public/clinic.vcf',cssAsset
];
const sha=b=>createHash('sha256').update(b).digest('hex');
async function snap(){const out={};for(const f of files)out[f]=sha(await readFile(path.join(root,f)));return out;}
const before=await snap();
const run=spawnSync(process.execPath,['scripts/generate-projections.mjs'],{cwd:root,encoding:'utf8'});
if(run.status!==0)throw new Error(`Projection regeneration failed:\n${run.stderr||run.stdout}`);
const after=await snap();
const drift=files.filter(f=>before[f]!==after[f]);
if(drift.length)throw new Error(`Non-deterministic projection drift: ${drift.join(', ')}`);
console.log(JSON.stringify({valid:true,files:files.length,deterministic:true,aggregateSha256:sha(Buffer.from(files.map(f=>`${f}:${after[f]}`).join('\n')))},null,2));
