import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const release=JSON.parse(await readFile('src/data/release.json','utf8'));
const z=release.dataset.zenodo;
const core=['index.html','graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','index.md','llms-full.txt','datapackage.json','linkset.json','void.ttl','dcat.ttl','croissant.json','provenance.jsonld','evidence-snapshot.json','shapes.ttl','artifact-manifest.json'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const fetchBytes=async(url,accept='*/*',{noCache=false}={})=>{
  const headers={Accept:accept,'User-Agent':'doctor-ghezelbaash-convergence-verifier/3.0'};
  if(noCache)headers['Cache-Control']='no-cache';
  const response=await fetch(url,{signal:AbortSignal.timeout(60000),headers});
  if(response.status!==200)throw new Error(`HTTP ${response.status} ${url}`);
  return {response,bytes:Buffer.from(await response.arrayBuffer())};
};
const fetchExpected=async(url,expected,label,attempts=12,options={})=>{
  for(let attempt=1;attempt<=attempts;attempt++){
    const result=await fetchBytes(url,'*/*',options);
    const observed=sha(result.bytes);
    if(observed===expected)return result;
    console.warn(JSON.stringify({stage:'CROSS_PLATFORM_PROPAGATION_WAIT',label,attempt,expected,observed}));
    if(attempt===attempts)throw new Error(`${label} did not converge after ${attempts} attempts`);
    await new Promise(resolve=>setTimeout(resolve,5000));
  }
};

const results=[];
for(const file of core){
  const local=await readFile(`dist/${file}`),expected=sha(local);
  const liveUrl=`${release.canonicalUrl}${file==='index.html'?'':file}`;
  const live=await fetchExpected(liveUrl,expected,`Live canonical ${file}`);
  const separator=liveUrl.includes('?')?'&':'?';
  const liveBypass=await fetchExpected(`${liveUrl}${separator}verify=${Date.now()}`,expected,`Live cache-busted ${file}`,12,{noCache:true});
  const hf=await fetchExpected(`https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/${file}?download=true&verify=${Date.now()}`,expected,`Hugging Face Core ${file}`,12,{noCache:true});
  const liveText=live.bytes.toString('utf8');
  if(file==='artifact-manifest.json'){
    const manifest=JSON.parse(liveText);
    if(manifest.release!==release.release)throw new Error(`Live canonical artifact-manifest release drift ${manifest.release}/${release.release}`);
    const expectedDigest=`sha-256=:${createHash('sha256').update(local).digest('base64')}:`;
    if(live.response.headers.get('repr-digest')!==expectedDigest)throw new Error('Live artifact-manifest Repr-Digest mismatch');
    if(!String(live.response.headers.get('access-control-expose-headers')).includes('Repr-Digest'))throw new Error('Live artifact-manifest digest is not CORS-exposed');
  }
  if(file==='llms.txt'&&!liveText.includes(`Version ${release.release}`))throw new Error('Live canonical llms.txt release drift');
  if(file==='answers.txt'&&!liveText.includes(`# Release ${release.release}`))throw new Error('Live canonical answers.txt release drift');
  if(z.previousVersion?.versionDoi&&['artifact-manifest.json','llms.txt','answers.txt','knowledge.xml'].includes(file)&&liveText.includes(z.previousVersion.versionDoi))throw new Error(`Historical DOI leaked into live canonical ${file}`);
  results.push({file,sha256:expected,liveCanonical:live.response.status,liveCacheBusted:liveBypass.response.status,huggingFace:hf.response.status});
}

const webmanifest=(await fetchBytes(`${release.canonicalUrl}site.webmanifest`)).bytes.toString();
for(const icon of [...new Set([...webmanifest.matchAll(/"src":\s*"([^"]+)"/g)].map(x=>x[1]))])await fetchBytes(new URL(icon,release.canonicalUrl));

const hfReadme=(await fetchBytes(`https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/README.md?download=true&verify=${Date.now()}`,'*/*',{noCache:true})).bytes.toString();
for(const token of [release.release,z.versionDoi,'secondary AI/ML distribution','derived',release.primaryEntity.wikidata,release.primaryEntity.googleKnowledgeGraphId,release.dataset.creatorOrcid,'Iran Medical Council','Personal Hugging Face identity'])if(!hfReadme.includes(token))throw new Error(`Hugging Face card lacks ${token}`);

const hfStrategy=(await fetchBytes(`https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/enrichment/positioning-strategy.json?download=true&verify=${Date.now()}`,'*/*',{noCache:true})).bytes.toString();
const hfKnowledge=(await fetchBytes(`https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/enrichment/aesthetic_medicine_knowledge_kermanshah_fa.json?download=true&verify=${Date.now()}`,'*/*',{noCache:true})).bytes.toString();
const hfInstructions=(await fetchBytes(`https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/enrichment/instruction_examples_fa_market_positioning.jsonl?download=true&verify=${Date.now()}`,'*/*',{noCache:true})).bytes.toString();
const hfEnrichment=`${hfStrategy}\n${hfKnowledge}\n${hfInstructions}`;
for(const token of ['maximum_dominant_best_positioning','"canonical_factual_authority": false',z.versionDoi])if(!hfStrategy.includes(token))throw new Error(`Hugging Face strategy lacks ${token}`);
if(!hfEnrichment.includes(release.clinic.placeId))throw new Error(`Hugging Face governed enrichment lacks canonical Place ID ${release.clinic.placeId}`);
for(const forbidden of ['ChIJBTOYDOTt-j8RD-7mAPy6Zas','10.5281/zenodo.18765169','/best-mesotherapy-doctor-kermanshah/','/hifu-therapy-in-kermanshah/'])if(hfEnrichment.includes(forbidden))throw new Error(`Hugging Face drift remains ${forbidden}`);
const retired=await fetch('https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/enrichment/positioning-evidence.json',{redirect:'manual'});
if(retired.status!==404)throw new Error(`Retired misleading Hugging Face artifact still resolves HTTP ${retired.status}`);

const zenodoResponse=await fetch(`https://zenodo.org/api/records/${z.recordId}`,{headers:{Accept:'application/json','Cache-Control':'no-cache'}});
if(!zenodoResponse.ok)throw new Error(`Zenodo metadata HTTP ${zenodoResponse.status}`);
const zenodo=await zenodoResponse.json();
const md=zenodo.metadata||{};
if(zenodo.doi!==z.versionDoi||md.version!==release.release||md.language!=='eng')throw new Error('Zenodo public metadata drift');
const creator=(md.creators||[])[0]||{};
if(creator.orcid!=='0009-0001-9346-8475')throw new Error('Zenodo creator ORCID drift');
for(const keyword of ['Saeed Ghezelbash','Dr. Saeed Ghezelbash','دکتر سعید قزلباش','physician entity','medical knowledge graph'])if(!(md.keywords||[]).includes(keyword))throw new Error(`Zenodo keyword drift ${keyword}`);
const subjects=new Set((md.subjects||[]).map(x=>x.identifier));
for(const subject of ['https://www.wikidata.org/entity/Q140287622','https://www.wikidata.org/entity/Q140304972','https://www.wikidata.org/entity/Q140288589'])if(!subjects.has(subject))throw new Error(`Zenodo controlled subject drift ${subject}`);
const relations=new Map((md.related_identifiers||[]).map(x=>[x.identifier,x.relation]));
const expectedRelations=new Map([
  [release.dataset.id,'isDerivedFrom'],
  [`${release.canonicalUrl}#doctor-ghezelbaash-structured-data-repository`,'isDescribedBy'],
  [release.dataset.github.repository,'isDerivedFrom'],
  [release.dataset.huggingFace.dataset,'isReferencedBy'],
  ['https://www.wikidata.org/wiki/Q140304972','isPartOf'],
  ['https://www.wikidata.org/wiki/Q140287622','references'],
  ['https://www.wikidata.org/wiki/Q140288589','references'],
]);
for(const [id,rel] of expectedRelations)if(relations.get(id)!==rel)throw new Error(`Zenodo distribution-role relation drift ${id}: ${relations.get(id)}/${rel}`);

const remoteFiles=new Map((zenodo.files||[]).map(x=>[x.key||x.filename,x]));
for(const file of core){
  const row=remoteFiles.get(file);if(!row)throw new Error(`Zenodo file missing ${file}`);
  const url=row.links?.self||row.links?.download||row.links?.content;
  await fetchExpected(url,sha(await readFile(`dist/${file}`)),`Zenodo ${file}`,12,{noCache:true});
}
console.log(JSON.stringify({pass:true,release:release.release,coreFiles:core.length,liveExact:true,liveCanonicalExact:true,liveCacheBustedExact:true,huggingFaceCoreExact:true,huggingFaceAggressiveLayerPreserved:true,huggingFaceAuthoritySeparated:true,zenodoExact:true,manifestIconsResolved:true,results},null,2));
