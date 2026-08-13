import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const root=process.cwd();
const canonical='https://www.ghezelbaash.ir/';
const stable=JSON.parse(await readFile(path.join(root,'src/data/stable-media-aliases.json'),'utf8'));
const core=[
  'index.html','graph.jsonld','graph.ttl','entity-facts.csv','answers.txt',
  'knowledge.xml','llms.txt','index.md','llms-full.txt','datapackage.json',
  'linkset.json','void.ttl','dcat.ttl','croissant.json','provenance.jsonld',
  'evidence-snapshot.json','shapes.ttl','artifact-manifest.json',
  'ns/entity-metadata/2026/index.html','ns/media-semantics/2026/index.html'
];
const files=[...new Set([...core,...stable.aliases.map(row=>row.path)])].sort();
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const routeFor=rel=>rel==='index.html'?'':rel.endsWith('/index.html')?rel.slice(0,-10):rel;
const expected=new Map();
for(const rel of files)expected.set(rel,await readFile(path.join(root,'dist',rel)));
const headers={'user-agent':'ghezelbaash-pages-byte-verifier/1.0',accept:'*/*'};
const fetchBytes=async url=>{
  const response=await fetch(url,{headers,redirect:'follow',signal:AbortSignal.timeout(45_000)});
  return {response,bytes:Buffer.from(await response.arrayBuffer())};
};
const verifyOne=async rel=>{
  const wanted=expected.get(rel),wantedSha=sha(wanted),url=new URL(routeFor(rel),canonical);
  for(let attempt=1;attempt<=20;attempt++){
    const ordinary=await fetchBytes(url);
    const bypass=new URL(url);bypass.searchParams.set('__pages_byte_verify',`${Date.now()}-${attempt}`);
    const fresh=await fetchBytes(bypass);
    const ordinarySha=sha(ordinary.bytes),freshSha=sha(fresh.bytes);
    if(ordinary.response.status===200&&fresh.response.status===200&&ordinarySha===wantedSha&&freshSha===wantedSha){
      return {rel,sha256:wantedSha,ordinary:ordinary.response.status,cacheBusted:fresh.response.status};
    }
    if(attempt===20)throw new Error(`Cloudflare Pages byte drift ${rel}: ordinary=${ordinary.response.status}/${ordinarySha} fresh=${fresh.response.status}/${freshSha} expected=${wantedSha}`);
    console.warn(JSON.stringify({stage:'PAGES_PROPAGATION_WAIT',rel,attempt,ordinaryStatus:ordinary.response.status,ordinarySha,freshStatus:fresh.response.status,freshSha,wantedSha}));
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
};
const results=[];
let cursor=0;
const worker=async()=>{while(cursor<files.length){const index=cursor++;results[index]=await verifyOne(files[index]);}};
await Promise.all(Array.from({length:Math.min(8,files.length)},worker));
console.log(JSON.stringify({valid:true,canonical,verifiedFiles:results.length,stableMediaAliases:stable.aliases.length,ordinaryAndCacheBustedByteExact:true,results},null,2));
