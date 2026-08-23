import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {buildLiveReputationArtifacts,huggingFaceDatasetRepo} from './lib/live-reputation-artifacts.mjs';

async function command_current(){
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
}

async function command_discovery(){
  const root=process.cwd(),dist=path.resolve(root,process.argv[2]||'dist'),base=process.env.VERIFY_BASE_URL||'https://www.ghezelbaash.ir/';
  const release=JSON.parse(await readFile(path.join(root,'src/data/release.json'),'utf8')),matrix=JSON.parse(await readFile(path.join(dist,'current-release-matrix.json'),'utf8'));
  for(const [k,v] of Object.entries({release:release.release,conceptDoi:release.dataset.zenodo.conceptDoi,versionDoi:release.dataset.zenodo.versionDoi,recordId:String(release.dataset.zenodo.recordId),personWikidata:release.primaryEntity.wikidata,clinicWikidata:release.dataset.supportingClinicWikidata,datasetWikidata:release.dataset.wikidata}))if(String(matrix[k])!==String(v))throw new Error(`Current release matrix ${k} drift ${matrix[k]} != ${v}`);
  const semantic=['graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','llms-full.txt','index.md','datapackage.json','croissant.json','dcat.ttl','void.ttl','linkset.json','provenance.jsonld','evidence-snapshot.json','query-matrix.jsonl'];
  const mutable=['artifact-manifest.json','live-observations.jsonld','current-release-matrix.json','live-serving-attestation.json'];
  const endpoints=[...semantic,...mutable],noDigest=new Set(['live-serving-attestation.json']),sha=b=>createHash('sha256').update(b).digest('hex'),b64=b=>createHash('sha256').update(b).digest('base64');
  const parseMaxAge=v=>{const m=String(v||'').match(/(?:^|,)\s*max-age=(\d+)/i);return m?Number(m[1]):null};
  const fetchBytes=async url=>{const r=await fetch(url,{headers:{'user-agent':'ghezelbaash-public-discovery-freshness/1.0',accept:'*/*'},redirect:'follow',signal:AbortSignal.timeout(45000)});return{r,b:Buffer.from(await r.arrayBuffer())}};
  const rows=[];
  for(const rel of endpoints){const expected=Buffer.from(await readFile(path.join(dist,rel))),expectedSha=sha(expected),url=new URL(rel,base),ordinary=await fetchBytes(url),bust=new URL(url);bust.searchParams.set('__discovery_freshness',`${Date.now()}-${Math.random()}`);const fresh=await fetchBytes(bust);for(const [lane,x] of [['ordinary',ordinary],['cacheBusted',fresh]]){if(x.r.status!==200||sha(x.b)!==expectedSha)throw new Error(`${rel} ${lane} byte drift status=${x.r.status} got=${sha(x.b)} expected=${expectedSha}`);const cc=x.r.headers.get('cache-control')||'',maxAge=parseMaxAge(cc);if(!/must-revalidate/i.test(cc))throw new Error(`${rel} ${lane} missing must-revalidate: ${cc}`);if(mutable.includes(rel)){if(maxAge!==0)throw new Error(`${rel} ${lane} mutable max-age drift: ${cc}`)}else if(maxAge===null||maxAge>3600)throw new Error(`${rel} ${lane} semantic max-age drift: ${cc}`);const rd=x.r.headers.get('repr-digest');if(!noDigest.has(rel)){const wanted=`sha-256=:${b64(expected)}:`;if(rd!==wanted)throw new Error(`${rel} ${lane} Repr-Digest drift ${rd} != ${wanted}`)}rows.push({resource:rel,lane,status:x.r.status,sha256:expectedSha,cacheControl:cc,age:x.r.headers.get('age'),etag:x.r.headers.get('etag'),cfCacheStatus:x.r.headers.get('cf-cache-status'),reprDigest:rd,release:matrix.release,conceptDoi:matrix.conceptDoi,versionDoi:matrix.versionDoi,sourceCommit:matrix.sourceCommit||matrix.liveRevision||null});}}
  console.log(JSON.stringify({publicDiscoveryFreshness:'PASS',base,resources:endpoints.length,lanes:rows.length,currentMatrix:{release:matrix.release,conceptDoi:matrix.conceptDoi,versionDoi:matrix.versionDoi,recordId:String(matrix.recordId),sourceCommit:matrix.sourceCommit||matrix.liveRevision||null},rows},null,2));
}

async function command_release(){
  const release=JSON.parse(await readFile('src/data/release.json','utf8')),z=release.dataset.zenodo,tag=`v${release.release}`;
  const core=['index.html','graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','index.md','llms-full.txt','datapackage.json','linkset.json','void.ttl','dcat.ttl','croissant.json','provenance.jsonld','evidence-snapshot.json','shapes.ttl','artifact-manifest.json','query-matrix.jsonl','current-release-matrix.json'];
  const sha=b=>createHash('sha256').update(b).digest('hex'),fetchBytes=async url=>{const r=await fetch(url,{headers:{'Cache-Control':'no-cache','User-Agent':'ghezelbaash-release-snapshot-verifier/1.0'},signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);return Buffer.from(await r.arrayBuffer())};
  let tagSha='';try{tagSha=execFileSync('git',['rev-list','-n','1',tag],{encoding:'utf8'}).trim()}catch{}const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();if(tagSha&&tagSha!==head)throw new Error(`Snapshot verifier must run at release tag source: tag=${tagSha} HEAD=${head}`);
  const zenodoResponse=await fetch(`https://zenodo.org/api/records/${z.recordId}?_=${Date.now()}`,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)});if(!zenodoResponse.ok)throw new Error(`Zenodo HTTP ${zenodoResponse.status}`);const zenodo=await zenodoResponse.json(),md=zenodo.metadata||{};if(zenodo.doi!==z.versionDoi||md.version!==release.release||md.title!=='Dr. Saeed Ghezelbash Public Knowledge Graph')throw new Error('Zenodo release identity drift');if((md.creators||[])[0]?.orcid!=='0009-0001-9346-8475')throw new Error('Zenodo creator ORCID drift');const remoteFiles=new Map((zenodo.files||[]).map(x=>[x.key||x.filename,x]));
  const results=[];for(const file of core){const local=await readFile(`dist/${file}`),wanted=sha(local),zrow=remoteFiles.get(file);if(!zrow)throw new Error(`Zenodo snapshot file missing ${file}`);const zurl=zrow.links?.self||zrow.links?.download||zrow.links?.content,zh=sha(await fetchBytes(zurl));if(zh!==wanted)throw new Error(`Zenodo snapshot byte drift ${file}: ${zh}/${wanted}`);const hfUrl=`https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/${encodeURIComponent(tag)}/${file}?download=true&_=${Date.now()}`,hh=sha(await fetchBytes(hfUrl));if(hh!==wanted)throw new Error(`HF ${tag} byte drift ${file}: ${hh}/${wanted}`);results.push({file,sha256:wanted})}
  const hfReadme=(await fetchBytes(`https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data/resolve/${encodeURIComponent(tag)}/README.md?download=true&_=${Date.now()}`)).toString();for(const token of [release.release,z.versionDoi,z.conceptDoi,release.primaryEntity.wikidata,release.dataset.wikidata,'text-retrieval','text-generation','live_observations'])if(!hfReadme.includes(token))throw new Error(`HF frozen release card lacks ${token}`);
  console.log(JSON.stringify({stage:'RELEASE_SNAPSHOT_TRUTH',release:release.release,sourceCommit:head,gitTag:tag,versionDoi:z.versionDoi,recordId:String(z.recordId),coreFiles:core.length,zenodoExact:true,hfTagExact:true,integrity:'PASS',results},null,2));
}

const command=process.argv[2];
if(!command)throw new Error('Usage: node scripts/verify-live.mjs <current|discovery|release> [options]');
process.argv.splice(2,1);
switch(command){
  case 'current': await command_current(); break;
  case 'discovery': await command_discovery(); break;
  case 'release': await command_release(); break;
  default: throw new Error('Usage: node scripts/verify-live.mjs <current|discovery|release> [options]');
}
