import fs from 'node:fs'; import crypto from 'node:crypto'; import {spawnSync} from 'node:child_process';
const ttl='src/data/semantic/knowledge-graph.ttl', lock='src/data/semantic/rdf-lock.json';
function run(){fs.rmSync(ttl,{force:true});fs.rmSync(lock,{force:true});const p=spawnSync('python',['scripts/generate-rdf.py'],{env:{...process.env,PYTHONPATH:'.python-deps'},encoding:'utf8'});if(p.status!==0)throw new Error(p.stderr);const b=fs.readFileSync(ttl);return {b,h:crypto.createHash('sha256').update(b).digest('hex')}}
const a=run(),b=run();if(!a.b.equals(b.b))throw new Error(`RDF byte reproducibility failed: ${a.h} != ${b.h}`);console.log(JSON.stringify({rdfByteReproducibility:'PASS',sha256:a.h,bytes:a.b.length}));
