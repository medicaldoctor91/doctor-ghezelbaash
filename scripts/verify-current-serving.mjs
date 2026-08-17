import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {buildLiveReputationArtifacts,huggingFaceDatasetRepo} from './lib/live-reputation-artifacts.mjs';

const release=JSON.parse(await readFile('src/data/release.json','utf8'));
const volatile=JSON.parse(await readFile('src/data/volatile-facts.json','utf8'));
const websiteOnly=process.argv.includes('--website-only'),hfOnly=process.argv.includes('--hf-only');
if(websiteOnly&&hfOnly)throw new Error('Choose at most one current-serving verification scope');
const verifyWebsite=!hfOnly,verifyHf=!websiteOnly,sha=b=>createHash('sha256').update(b).digest('hex');
const currentFiles=['index.html','graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','index.md','llms-full.txt','datapackage.json','linkset.json','void.ttl','dcat.ttl','croissant.json','provenance.jsonld','evidence-snapshot.json','shapes.ttl','artifact-manifest.json','query-matrix.jsonl','current-release-matrix.json','live-observations.jsonld','live-serving-attestation.json'];
const fetchOne=async(url,noCache=false)=>{const headers={'User-Agent':'ghezelbaash-current-serving-verifier/2.0'};if(noCache)headers['Cache-Control']='no-cache';const r=await fetch(url,{headers,signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);return {r,b:Buffer.from(await r.arrayBuffer())}};
const {rating,reviewCount,observedAt,csv,attestationJson}=buildLiveReputationArtifacts(release,volatile);
const results=[];

if(verifyWebsite){
  for(const file of currentFiles){
    const local=await readFile(`dist/${file}`),wanted=sha(local),url=`${release.canonicalUrl}${file==='index.html'?'':file}`,ordinary=await fetchOne(url),bypass=await fetchOne(`${url}${url.includes('?')?'&':'?'}__serving_verify=${Date.now()}`,true),oh=sha(ordinary.b),bh=sha(bypass.b);
    if(oh!==wanted||bh!==wanted)throw new Error(`Current serving byte drift ${file}: ordinary=${oh} bypass=${bh} wanted=${wanted}`);
    if(['artifact-manifest.json','live-observations.jsonld','current-release-matrix.json','live-serving-attestation.json'].includes(file)){
      const cc=ordinary.r.headers.get('cache-control')||'';
      if(!/max-age=0|must-revalidate/i.test(cc))throw new Error(`Mutable/current machine resource cache policy too stale ${file}: ${cc}`);
    }
    results.push({file,sha256:wanted,ordinary:ordinary.r.status,bypass:bypass.r.status,cfCacheStatus:ordinary.r.headers.get('cf-cache-status'),age:ordinary.r.headers.get('age')});
  }
  const live=JSON.parse(await readFile('dist/live-observations.jsonld','utf8')),props=Array.isArray(live.item?.additionalProperty)?live.item.additionalProperty:[],liveRating=Number(props.find(x=>x.propertyID==='Google Places rating')?.value),liveReviewCount=Number(props.find(x=>x.propertyID==='Google Places userRatingCount')?.value);
  if(live.about?.['@id']!==release.clinic.id||live.dateModified!==observedAt||liveRating!==rating||liveReviewCount!==reviewCount)throw new Error('Current website live observation drift');
}

if(verifyHf){
  const repo=huggingFaceDatasetRepo(release),base=`https://huggingface.co/datasets/${repo}/resolve/main/`,nonce=Date.now();
  const hfCsv=(await fetchOne(`${base}live_observations.csv?download=true&_=${nonce}`,true)).b;
  const hfAttestation=(await fetchOne(`${base}live-observation-attestation.json?download=true&_=${nonce}`,true)).b;
  if(!hfCsv.equals(Buffer.from(csv)))throw new Error(`HF main live observation byte drift: actual=${sha(hfCsv)} expected=${sha(Buffer.from(csv))}`);
  if(!hfAttestation.equals(Buffer.from(attestationJson)))throw new Error(`HF main live attestation byte drift: actual=${sha(hfAttestation)} expected=${sha(Buffer.from(attestationJson))}`);
}

console.log(JSON.stringify({stage:'CURRENT_SERVING_TRUTH',release:release.release,currentReputation:{rating,reviewCount,valueObservedAt:observedAt},websiteExact:verifyWebsite?true:null,hfLiveObservationExact:verifyHf?true:null,files:results.length,integrity:'PASS',results},null,2));
