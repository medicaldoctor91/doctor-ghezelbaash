import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const stagedTtl='src/data/semantic/knowledge-graph.ttl';
const stagedLock='src/data/semantic/rdf-lock.json';
const canonicalTtl='.generated/semantic/knowledge-graph.ttl';
const clean=()=>{fs.rmSync(stagedTtl,{force:true});fs.rmSync(stagedLock,{force:true})};
function run(){
  clean();
  const p=spawnSync(process.execPath,['scripts/generate-rdf.mjs'],{encoding:'utf8'});
  if(p.status!==0)throw new Error(p.stderr||p.stdout);
  const b=fs.readFileSync(stagedTtl);
  return {b,h:crypto.createHash('sha256').update(b).digest('hex')};
}
try{
  const canonical=fs.readFileSync(canonicalTtl);
  const a=run(),b=run();
  if(!a.b.equals(b.b))throw new Error('same-tree RDF byte drift '+a.h+' '+b.h);
  if(!a.b.equals(canonical))throw new Error('RDF regeneration diverges from generated workspace canonical bytes');
  console.log(JSON.stringify({rdfByteReproducibility:'PASS',workspace:canonicalTtl,sha256:a.h,bytes:a.b.length}));
}finally{clean()}
