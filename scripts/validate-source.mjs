import path from 'node:path';
import {readFile,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';

const root=process.cwd(),data=path.join(root,'src/data');
const readJson=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const fail=message=>{throw new Error(message)};
const arr=value=>Array.isArray(value)?value:(value==null?[]:[value]);
const id=value=>typeof value==='string'?value:value?.['@id'];

const release=await readJson('src/data/release.json');
const graph=await readJson('src/data/semantic/knowledge-graph.jsonld');
const visible=await readJson('src/data/visible-contract.json');
const services=await readJson('src/data/service-registry.json');
const answers=await readJson('src/data/answer-registry.json');
const hf=await readJson('.release/policy/hf-authority-contract.json');

const requiredSource=[
  'CITATION.cff','codemeta.json','src/content-source/page.md','src/layouts/BaseLayout.astro',
  'src/data/release.json','src/data/release-invariants.json','src/data/service-registry.json','src/data/answer-registry.json',
  'src/data/semantic/knowledge-graph.jsonld','src/data/semantic/head-ids.json','src/data/semantic/support-ids.json','src/data/semantic/shapes.ttl',
  'src/data/evidence-registry.json','src/data/evidence-snapshot.json','src/data/volatile-facts.json','src/data/render-calibration.json',
  'src/data/templates/headers.template','src/data/visible-contract.json','.release/policy/hf-authority-contract.json','public/robots.txt','public/_redirects'
];
for(const file of requiredSource)await access(path.join(root,file));

if(!release.medicalReviewedAt)fail('Explicit medicalReviewedAt missing');
if(release.dataset.zenodo.conceptDoi===release.dataset.zenodo.versionDoi)fail('Concept DOI and current Version DOI must remain distinct');

const nodes=graph['@graph']||[];
const byId=new Map(nodes.filter(node=>node?.['@id']).map(node=>[node['@id'],node]));
const person=byId.get(release.primaryEntity.id),clinic=byId.get(release.clinic.id),dataset=byId.get(release.dataset.id);
if(!person||!clinic||!dataset)fail('Person/Clinic/Dataset graph constitution broken');
if(id(dataset.creator)!==release.primaryEntity.id||id(dataset.publisher)!==release.primaryEntity.id)fail('Dataset creator/publisher must resolve to the physician');
const datasetSameAs=arr(dataset.sameAs).map(id);
if(datasetSameAs.length!==1||datasetSameAs[0]!==`https://www.wikidata.org/entity/${release.dataset.wikidata}`)fail('Dataset sameAs must contain only its reconciliation identity');

const graphIds=new Set(byId.keys());
for(const file of ['src/data/semantic/head-ids.json','src/data/semantic/support-ids.json'])for(const ref of await readJson(file))if(!graphIds.has(ref))fail(`${file} references missing graph node ${ref}`);

const offered=new Set([...arr(person.availableService).map(id),...arr(clinic.availableService).map(id)].filter(Boolean));
const registered=new Set(services.services.filter(item=>item.publishable).map(item=>item.id));
if(registered.size<100)fail('Service registry unexpectedly sparse');
for(const serviceId of registered)if(!offered.has(serviceId))fail(`Registry service not projected: ${serviceId}`);
for(const serviceId of offered)if(!registered.has(serviceId))fail(`Projected service missing from registry: ${serviceId}`);
if(![...registered].some(serviceId=>serviceId.includes('botulinum-toxin-chronic-migraine')))fail('Migraine Botox offered-service identity missing');

for(const row of answers.answers){
  const question=byId.get(row.questionId),answer=byId.get(row.answerId);
  if(!question||!answer||id(question.acceptedAnswer)!==row.answerId)fail(`Answer Registry drift ${row.questionId}`);
}

const assembled=await assembleCanonicalContent({root,graph});
const home=await readFile(path.join(root,'src/content/home.md'),'utf8');
if(assembled.content!==home)fail('Generated home.md differs from canonical content assembly');

const contentFiles=(await readdir(path.join(root,'src/content-source'))).filter(name=>/\.(html|md)$/i.test(name)).sort();
let source='';
for(const file of contentFiles)source+=await readFile(path.join(root,'src/content-source',file),'utf8')+'\n';
if(!source.includes(`id="${visible.protected.h1Id}"`))fail('Protected H1 missing');
for(const heading of visible.protected.aggressiveHeadings||[])if(heading.id&&!source.includes(`id="${heading.id}"`))fail(`Required aggressive heading missing: ${heading.id}`);
for(const heading of visible.protected.instagramHeadingLinks||[])if(heading.id&&!source.includes(`id="${heading.id}"`))fail(`Required Instagram heading association missing: ${heading.id}`);
if(!source.includes('google-maps-clinic-reputation-current'))fail('Visible reputation slot missing');

const robots=await readFile(path.join(root,'public/robots.txt'),'utf8');
if(!robots.includes('Content-Signal: search=yes, ai-input=yes, ai-train=yes, use=full'))fail('Maximum Content-Signal policy drift');
for(const bot of ['Google-Extended','GPTBot','OAI-SearchBot','ChatGPT-User','ClaudeBot','PerplexityBot','Applebot-Extended'])if(!robots.includes(`User-agent: ${bot}\nAllow: /`))fail(`AI/search crawler contract drift: ${bot}`);
const headers=await readFile(path.join(data,'templates/headers.template'),'utf8');
if(!headers.includes('Content-Signal: search=yes, ai-input=yes, ai-train=yes, use=full'))fail('Headers Content-Signal contract drift');

for(const task of ['question-answering','text-retrieval','text-generation'])if(!hf.taskCategories.includes(task))fail(`HF task contract missing ${task}`);
for(const language of ['fa','en','ar','ckb'])if(!hf.languages.includes(language))fail(`HF language contract missing ${language}`);

const redirects=await readFile(path.join(root,'public/_redirects'),'utf8'),redirectSources=new Set();
for(const line of redirects.split(/\r?\n/).map(value=>value.trim()).filter(Boolean)){
  const [from,to,code]=line.split(/\s+/);
  if(!from||!to||code!=='301')fail(`Malformed redirect: ${line}`);
  if(redirectSources.has(from))fail(`Duplicate redirect source: ${from}`);
  redirectSources.add(from);
  if(to.includes('#')){
    const fragment=decodeURIComponent(to.split('#')[1]||'');
    if(fragment&&!source.includes(`id="${fragment}"`)&&!source.includes(`id='${fragment}'`))fail(`Redirect fragment target missing: ${line}`);
  }
}

const calibration=await readJson('src/data/render-calibration.json'),widths=[360,390,430,768,1024,1440],base=calibration['360']?.chunks||[];
if(!base.length)fail('Render calibration baseline empty');
const chunkIds=base.map(row=>row.id);
for(const width of widths){
  const rows=calibration[String(width)]?.chunks||[];
  if(rows.length!==chunkIds.length||rows.some((row,index)=>row.id!==chunkIds[index]||!Number.isFinite(Number(row.h))||Number(row.h)<=0))fail(`Render calibration identity drift ${width}`);
}
const calibrationSha=createHash('sha256').update(await readFile(path.join(root,'src/data/render-calibration.json'))).digest('hex');
const css=await readFile(path.join(root,'src/styles/global.css'),'utf8');
if(!css.includes(`DIST_CHUNK_CALIBRATION_SHA256:${calibrationSha}`))fail('CSS/render calibration hash drift');

console.log(JSON.stringify({
  stage:'SOURCE_SEMANTIC_CONTRACT',
  release:release.release,
  services:registered.size,
  answers:answers.answers.length,
  protectedAggressiveHeadings:visible.protected.aggressiveHeadings.length,
  protectedInstagramHeadings:visible.protected.instagramHeadingLinks.length,
  renderChunks:chunkIds.length,
  canonicalInputs:requiredSource.length,
  integrity:'PASS'
},null,2));
