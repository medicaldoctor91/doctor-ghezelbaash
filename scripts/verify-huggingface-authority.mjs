import {readFile} from 'node:fs/promises';
const release=JSON.parse(await readFile('src/data/release.json','utf8')),authority=JSON.parse(await readFile('.release/policy/authority-surface-contract.json','utf8')),hf=authority.surfaces.huggingFace;
const mode=process.argv.includes('--profile')?'profile':process.argv.includes('--viewer')?'viewer':'full';
const datasetUrl=release.dataset.huggingFace.dataset,repo=datasetUrl.replace(/^https:\/\/huggingface\.co\/datasets\//,''),nonce=()=>String(Date.now())+Math.random().toString(16).slice(2);
const get=async url=>{const r=await fetch(url,{headers:{'cache-control':'no-cache','user-agent':'ghezelbaash-hf-authority-verifier/2.0'},signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error(`HF HTTP ${r.status} ${url}`);return r};
const text=async url=>(await get(url)).text(),json=async url=>(await get(url)).json();
const meta=await json(`https://huggingface.co/api/datasets/${repo}?full=true&blobs=false&_=${nonce()}`);if(meta.private||![false,null,undefined,'false','auto'].includes(meta.gated))throw new Error('HF Dataset unexpectedly private/gated');
const tags=new Set(meta.tags||[]);for(const language of hf.languages)if(!tags.has(`language:${language}`))throw new Error(`HF language tag missing ${language}`);for(const task of hf.taskCategories)if(!tags.has(`task_categories:${task}`))throw new Error(`HF task tag missing ${task}`);
const readme=await text(`${datasetUrl}/resolve/main/README.md?download=true&_=${nonce()}`);
const requiredTokens=[release.primaryEntity.name,release.primaryEntity.wikidata,release.primaryEntity.googleKnowledgeGraphId,release.primaryEntity.orcid,release.primaryEntity.irimc,release.dataset.supportingClinicWikidata,release.dataset.wikidata,release.dataset.id,release.dataset.zenodo.conceptDoi,release.dataset.zenodo.versionDoi,hf.retrievalPriority,hf.positioningMode,...hf.taskCategories,...hf.configs];for(const token of requiredTokens)if(!readme.includes(String(token)))throw new Error(`HF README authority token missing ${token}`);
const requiredFiles=[...authority.surfaces.website.requiredMachineSurfaces.filter(x=>!['live-observations.jsonld'].includes(x))];for(const file of requiredFiles){await get(`${datasetUrl}/resolve/main/${file}?download=true&_=${nonce()}`)}
if(mode!=='viewer'){
  const org=await text(`https://huggingface.co/${hf.organization}/raw/main/README.md?_=${nonce()}`);for(const token of [release.primaryEntity.wikidata,release.dataset.supportingClinicWikidata])if(!org.includes(token))throw new Error(`HF organization authority token missing ${token}`);
}
if(mode!=='profile'){
  const base='https://datasets-server.huggingface.co',params=extra=>new URLSearchParams({dataset:repo,...extra,_:nonce()});
  const valid=await json(`${base}/is-valid?${params({})}`);for(const key of ['viewer','preview','search','filter','statistics'])if(valid[key]!==true)throw new Error(`Dataset Server unhealthy ${key}`);
  const splits=await json(`${base}/splits?${params({})}`),pairs=new Set((splits.splits||[]).map(x=>`${x.config}|${x.split}`));for(const config of hf.configs)if(!pairs.has(`${config}|train`))throw new Error(`HF Dataset Server config missing ${config}`);
}
console.log(JSON.stringify({hfAuthority:'PASS',mode,repo,primaryEntity:release.primaryEntity.wikidata,datasetEntity:release.dataset.wikidata,conceptDoi:release.dataset.zenodo.conceptDoi,versionDoi:release.dataset.zenodo.versionDoi,tasks:hf.taskCategories,languages:hf.languages,configs:hf.configs},null,2));
