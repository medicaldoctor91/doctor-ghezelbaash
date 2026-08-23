import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';

const execFileAsync=promisify(execFile);
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const targets=['src/data/release.json','package.json','package-lock.json','src/data/volatile-facts.json','src/data/evidence-snapshot.json','src/data/semantic/knowledge-graph.jsonld','CITATION.cff','codemeta.json'];
const snapshot=async()=>new Map(await Promise.all(targets.map(async file=>[file,await readFile(file)])));
const before=await snapshot();
const {stdout,stderr}=await execFileAsync(process.execPath,[
  'scripts/promote-release.mjs',
  '--version=999.999.999',
  '--date=2099-12-31',
  '--zenodo-record=999999999',
  '--zenodo-doi=10.5281/zenodo.999999999',
  '--dry-run=true',
],{maxBuffer:4*1024*1024});
assert(!stderr.trim(),`Promotion dry-run wrote to stderr: ${stderr.trim()}`);
const result=JSON.parse(stdout);
assert(result.promoted===false&&result.dryRun===true&&result.prepared===true,'Promotion dry-run did not complete candidate preparation');
assert(result.releaseBoundNodes>0,'Promotion dry-run did not select current release-bound graph nodes');
assert(Array.isArray(result.files)&&result.files.length===targets.length&&targets.every(file=>result.files.includes(file)),'Promotion dry-run target set drift');
const after=await snapshot();
for(const file of targets)assert(before.get(file).equals(after.get(file)),`Promotion dry-run mutated ${file}`);
console.log(JSON.stringify({stage:'RELEASE_PROMOTION_DRY_RUN',candidatePrepared:'PASS',releaseBoundNodes:result.releaseBoundNodes,targetFiles:targets.length,sourceMutation:false,integrity:'PASS'},null,2));
