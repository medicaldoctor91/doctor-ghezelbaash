import path from 'node:path';
import {createHash} from 'node:crypto';
import {assembleCssSource} from '../src/lib/css-source.mjs';
import {deriveCssDelivery} from '../src/lib/css-delivery.mjs';
import {readFile,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const [authoredCss,renderCalibrationRaw]=await Promise.all([readFile(path.join(root,'src/styles/global.css'),'utf8'),readFile(path.join(root,'src/data/render-calibration.json'),'utf8')]);
const {cssSource}=assembleCssSource(authoredCss,renderCalibrationRaw),{assetName:cssAssetName}=deriveCssDelivery(cssSource),cssAsset=`.generated/public/assets/${cssAssetName}`;
const files=[
  '.generated/content/home.md',
  '.generated/semantic/head-graph.json',
  '.generated/semantic/support-graph.json',
  '.generated/semantic/knowledge-graph.ttl',
  '.generated/semantic/rdf-lock.json',
  '.generated/projections/entity-facts.csv',
  '.generated/projections/answers.txt',
  '.generated/projections/knowledge.xml',
  '.generated/projections/index.md',
  '.generated/projections/llms-full.txt',
  '.generated/projections/llms.txt',
  '.generated/projections/provenance.jsonld',
  '.generated/projections/evidence-snapshot.json',
  '.generated/projections/datapackage.json',
  '.generated/projections/linkset.json',
  '.generated/projections/void.ttl',
  '.generated/projections/dcat.ttl',
  '.generated/projections/croissant.json',
  '.generated/projections/sitemap.xml',
  '.generated/projections/live-observations.jsonld',
  '.generated/projections/query-matrix.jsonl',
  '.generated/projections/current-release-matrix.json',
  '.generated/public/live-observations.jsonld',
  '.generated/public/query-matrix.jsonl',
  '.generated/public/doctor.vcf',
  '.generated/public/clinic.vcf',
  cssAsset
];
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const f of files)await access(path.join(root,f));
async function snap(){const out={};for(const f of files)out[f]=sha(await readFile(path.join(root,f)));return out}
const before=await snap();
const pipeline=['scripts/clean-generated-workspace.mjs','scripts/generate-rdf.mjs','scripts/generate-projections.mjs','scripts/generate-retrieval-projections.mjs','scripts/generate-descriptors.mjs'];
for(const script of pipeline){
  const run=spawnSync(process.execPath,[script],{cwd:root,encoding:'utf8'});
  if(run.status!==0)throw new Error(`Generated pipeline regeneration failed in ${script}:\n${run.stderr||run.stdout}`);
}
const after=await snap(),drift=files.filter(f=>before[f]!==after[f]);
if(drift.length)throw new Error(`Non-deterministic generated workspace drift: ${drift.join(', ')}`);
console.log(JSON.stringify({valid:true,files:files.length,deterministic:true,fullPipeline:true,generatedWorkspace:'.generated',sourceTreeMutation:false,pipeline,aggregateSha256:sha(Buffer.from(files.map(f=>`${f}:${after[f]}`).join('\n')))},null,2));
