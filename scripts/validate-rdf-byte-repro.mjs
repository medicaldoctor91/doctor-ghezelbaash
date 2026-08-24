import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const ttl='.generated/semantic/knowledge-graph.ttl';
const lock='.generated/semantic/rdf-lock.json';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const snapshot=()=>({ttl:fs.readFileSync(ttl),lock:fs.readFileSync(lock)});
const run=()=>{
  const p=spawnSync(process.execPath,['scripts/generate-rdf.mjs'],{encoding:'utf8'});
  if(p.status!==0)throw new Error(p.stderr||p.stdout);
  return snapshot();
};

const canonical=snapshot();
const a=run(),b=run();
if(!a.ttl.equals(b.ttl)||!a.lock.equals(b.lock))throw new Error(`same-tree RDF byte drift ${sha(a.ttl)} ${sha(b.ttl)}`);
if(!a.ttl.equals(canonical.ttl)||!a.lock.equals(canonical.lock))throw new Error('RDF regeneration diverges from generated workspace canonical bytes');
console.log(JSON.stringify({rdfByteReproducibility:'PASS',workspace:'.generated/semantic',sha256:sha(a.ttl),bytes:a.ttl.length,lockReproducible:true,sourceTreeMutation:false}));
