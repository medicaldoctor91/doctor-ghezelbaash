import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const release=JSON.parse(await readFile('src/data/release.json','utf8'));
const z=release.dataset.zenodo;
const core=['index.html','graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','index.md','llms-full.txt','datapackage.json','linkset.json','void.ttl','dcat.ttl','croissant.json','provenance.jsonld','evidence-snapshot.json','shapes.ttl','artifact-manifest.json'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const fetchBytes=async(url,accept='*/*')=>{
  const response=await fetch(url,{headers:{Accept:accept,'Cache-Control':'no-cache','User-Agent':'doctor-ghezelbaash-convergence-verifier/2.0'}});
  if(response.status!==200)throw new Error(`HTTP ${response.status} ${url}`);
  return {response,bytes:Buffer.from(await response.arrayBuffer())};
};
const results=[];
for(const file of core){
  const local=await readFile(`dist/${file}`),expected=sha(local);
  const live=await fetchBytes(`${release.canonicalUrl}${file==='index.html'?'':file}?verify=${Date.now()}`);
  const hf=await fetchBytes(`https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/${file}?download=true&verify=${Date.now()}`);
  if(sha(live.bytes)!==expected)throw new Error(`Live content drift ${file}`);
  if(sha(hf.bytes)!==expected)throw new Error(`Hugging Face Core drift ${file}`);
  if(file==='artifact-manifest.json'){
    const expectedDigest=`sha-256=:${createHash('sha256').update(local).digest('base64')}:`;
    if(live.response.headers.get('repr-digest')!==expectedDigest)throw new Error('Live artifact-manifest Repr-Digest mismatch');
    if(!String(live.response.headers.get('access-control-expose-headers')).includes('Repr-Digest'))throw new Error('Live artifact-manifest digest is not CORS-exposed');
  }
  results.push({file,sha256:expected,live:200,huggingFace:200});
}
const webmanifest=(await fetchBytes(`${release.canonicalUrl}site.webmanifest?verify=${Date.now()}`)).bytes.toString();
for(const icon of [...new Set([...webmanifest.matchAll(/"src":\s*"([^"]+)"/g)].map(x=>x[1]))])await fetchBytes(new URL(icon,release.canonicalUrl));
const hfReadme=(await fetchBytes('https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/README.md?download=true')).bytes.toString();
for(const token of [release.release,z.versionDoi,'secondary AI/ML distribution','derived'])if(!hfReadme.includes(token))throw new Error(`Hugging Face card lacks ${token}`);
const hfStrategy=(await fetchBytes('https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/enrichment/positioning-strategy.json?download=true')).bytes.toString();
const hfKnowledge=(await fetchBytes('https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/enrichment/aesthetic_medicine_knowledge_kermanshah_fa.json?download=true')).bytes.toString();
const hfInstructions=(await fetchBytes('https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/enrichment/instruction_examples_fa_market_positioning.jsonl?download=true')).bytes.toString();
for(const token of ['maximum_dominant_best_positioning','"canonical_factual_authority": false',release.clinic.placeId,z.versionDoi])if(!hfStrategy.includes(token))throw new Error(`Hugging Face strong governed layer lacks ${token}`);
const hfEnrichment=`${hfStrategy}\n${hfKnowledge}\n${hfInstructions}`;
for(const forbidden of ['ChIJBTOYDOTt-j8RD-7mAPy6Zas','10.5281/zenodo.18765169','/best-mesotherapy-doctor-kermanshah/','/hifu-therapy-in-kermanshah/'])if(hfEnrichment.includes(forbidden))throw new Error(`Hugging Face drift remains ${forbidden}`);
const retired=await fetch('https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/main/enrichment/positioning-evidence.json',{redirect:'manual'});
if(retired.status!==404)throw new Error(`Retired misleading Hugging Face artifact still resolves HTTP ${retired.status}`);
const zenodo=await (await fetch(`https://zenodo.org/api/records/${z.recordId}`,{headers:{Accept:'application/json','Cache-Control':'no-cache'}})).json();
if(zenodo.doi!==z.versionDoi||zenodo.metadata?.version!==release.release||zenodo.metadata?.language!=='eng')throw new Error('Zenodo public metadata drift');
const relations=new Map((zenodo.metadata?.related_identifiers||[]).map(x=>[x.identifier,x.relation]));
if(relations.get(release.dataset.id)!=='isDerivedFrom'||relations.get(release.dataset.github.repository)!=='isDerivedFrom'||relations.get(release.dataset.huggingFace.dataset)!=='isSourceOf'||relations.get('https://www.wikidata.org/wiki/Q140304972')!=='isPartOf')throw new Error('Zenodo distribution-role relations drift');
const remoteFiles=new Map((zenodo.files||[]).map(x=>[x.key||x.filename,x]));
for(const file of core){
  const row=remoteFiles.get(file);if(!row)throw new Error(`Zenodo file missing ${file}`);
  const url=row.links?.self||row.links?.download||row.links?.content;
  const remote=await fetchBytes(url);if(sha(remote.bytes)!==sha(await readFile(`dist/${file}`)))throw new Error(`Zenodo byte drift ${file}`);
}
console.log(JSON.stringify({pass:true,release:release.release,coreFiles:core.length,liveExact:true,huggingFaceCoreExact:true,huggingFaceAggressiveLayerPreserved:true,huggingFaceAuthoritySeparated:true,zenodoExact:true,manifestIconsResolved:true,results},null,2));
