import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const html=process.argv[2]||'dist/index.html',contract=JSON.parse(await readFile('src/data/visible-contract.json','utf8'));
if(!/^[0-9a-f]{64}$/.test(contract.visibleDomSha256||''))throw new Error('Visible DOM contract hash is missing');
const r=spawnSync(process.execPath,['scripts/compute-visible-contract.mjs',html,'--summary'],{encoding:'utf8',maxBuffer:4*1024*1024});
if(r.error)throw r.error;if(r.status!==0)throw new Error(r.stderr||r.stdout);
const result=JSON.parse(r.stdout);if(result.sha256!==contract.visibleDomSha256)throw new Error(`Visible DOM contract violation: current=${result.sha256} expected=${contract.visibleDomSha256}`);
if(contract.visibleDomRecords&&result.records!==contract.visibleDomRecords)throw new Error(`Visible DOM record-count drift: current=${result.records} expected=${contract.visibleDomRecords}`);
console.log(JSON.stringify({visibleContract:true,sha256:result.sha256,records:result.records,bytes:result.bytes,mutableSelector:contract.mutableSelector},null,2));
