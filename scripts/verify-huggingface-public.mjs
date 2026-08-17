import {readFile} from 'node:fs/promises';

const release=JSON.parse(await readFile('src/data/release.json','utf8'));
const policy=JSON.parse(await readFile('.release/policy/hf-authority-contract.json','utf8'));
const datasetUrl=release.dataset.huggingFace.dataset;
const prefix='https://huggingface.co/datasets/';
if(!datasetUrl.startsWith(prefix))throw new Error(`Unsupported Hugging Face Dataset URL: ${datasetUrl}`);
const repo=datasetUrl.slice(prefix.length),organization=repo.split('/')[0];
if(!organization||!repo.includes('/'))throw new Error(`Invalid Hugging Face Dataset repository: ${repo}`);

const getText=async url=>{
  const separator=url.includes('?')?'&':'?';
  const response=await fetch(`${url}${separator}_=${Date.now()}-${Math.random()}`,{headers:{'Cache-Control':'no-cache','User-Agent':'ghezelbaash-hf-public-verifier/3.0'}});
  if(!response.ok)throw new Error(`Hugging Face fetch failed ${response.status}: ${url}`);
  return response.text();
};
const getJson=async url=>JSON.parse(await getText(url));
const requireTokens=(text,tokens,label)=>{for(const token of tokens)if(!text.includes(String(token)))throw new Error(`${label} missing ${token}`)};

const meta=await getJson(`https://huggingface.co/api/datasets/${repo}?full=true&blobs=false`);
if(meta.private)throw new Error('Hugging Face Dataset unexpectedly private');
if(![false,null,undefined,'false','auto'].includes(meta.gated))throw new Error(`Hugging Face Dataset unexpectedly gated: ${meta.gated}`);
const tags=new Set(meta.tags||[]);
for(const language of policy.languages||[])if(!tags.has(`language:${language}`))throw new Error(`Hugging Face metadata missing language:${language}`);
for(const task of policy.taskCategories||[])if(!tags.has(`task_categories:${task}`))throw new Error(`Hugging Face metadata missing task_categories:${task}`);

const readme=await getText(`https://huggingface.co/datasets/${repo}/resolve/main/README.md?download=true`);
requireTokens(readme,[
  'Dr. Saeed Ghezelbash Public Knowledge Graph',release.primaryEntity.wikidata,release.dataset.supportingClinicWikidata,release.dataset.wikidata,
  release.primaryEntity.googleKnowledgeGraphId,release.dataset.creatorOrcid,release.dataset.zenodo.conceptDoi,release.dataset.zenodo.versionDoi,
  'AI/retrieval distribution','query_matrix','live_observations','text-retrieval','text-generation'
],'Hugging Face Dataset card');

const org=await getText(`https://huggingface.co/${organization}/raw/main/README.md`);
requireTokens(org,[
  'Dr. Saeed Ghezelbash','دکتر سعید قزلباش',release.primaryEntity.wikidata,release.dataset.supportingClinicWikidata,release.dataset.wikidata,
  release.primaryEntity.googleKnowledgeGraphId,release.dataset.creatorOrcid,release.canonicalUrl,release.dataset.zenodo.conceptDoi,release.dataset.zenodo.versionDoi,
  'graph.jsonld','llms-full.txt','query-matrix.jsonl','croissant.json','dcat.ttl','provenance.jsonld',repo
],'Hugging Face organization card');

const server='https://datasets-server.huggingface.co';
const api=async(path,params={})=>{
  const query=new URLSearchParams({...params,dataset:repo});
  return getJson(`${server}${path}?${query}`);
};
const valid=await api('/is-valid');
for(const feature of ['viewer','preview','search','filter','statistics'])if(valid[feature]!==true)throw new Error(`Dataset Server feature unhealthy: ${feature}`);
const splits=await api('/splits');
const pairs=new Set((splits.splits||[]).map(row=>`${row.config}|${row.split}`));
for(const config of ['entity_facts','query_matrix','positioning_instructions','live_observations'])if(!pairs.has(`${config}|train`))throw new Error(`Dataset Viewer config missing ${config}`);

console.log(JSON.stringify({
  huggingFacePublicIntegrity:'PASS',
  dataset:repo,
  organization,
  release:release.release,
  tasks:policy.taskCategories,
  languages:policy.languages,
  viewerConfigs:[...pairs].sort()
},null,2));
