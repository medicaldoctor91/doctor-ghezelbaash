import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
const html=process.argv[2]||'dist/index.html',contractPath='src/data/visible-contract.json';
const r=spawnSync(process.execPath,['scripts/compute-visible-contract.mjs',html,'--summary'],{encoding:'utf8',maxBuffer:4*1024*1024});
if(r.error)throw r.error;if(r.status!==0)throw new Error(r.stderr||r.stdout);
const result=JSON.parse(r.stdout),contract=JSON.parse(await readFile(contractPath,'utf8'));
if(!/^[0-9a-f]{64}$/.test(result.sha256)||!Number.isInteger(result.records)||result.records<1)throw new Error('Visible contract summary malformed');
contract.finalVisibleDomSha256=result.sha256;contract.finalVisibleDomRecords=result.records;contract.finalVisibleDomNormalization='semantic-body-tree-v1; scripts/styles/head excluded; class/style/data attrs excluded; reputation subtree replaced with sentinel';
await writeFile(contractPath,JSON.stringify(contract,null,2)+'\n');

// Step 10 immediately follows this lock with a release-candidate commit.  Fail
// closed here if any tracked/untracked source mutation outside the explicitly
// reviewed DOI/version promotion surface has appeared.  The workflow's fixed
// bootstrap-file removals happen after this check and are the only subsequent
// broad-add inputs.
const allowed=new Set([
  'CITATION.cff','README.md','codemeta.json','package-lock.json','package.json',
  'public/favicon.svg','public/media/brand/doctor-ghezelbaash-symbol.3a9e7509912d.svg','public/safari-pinned-tab.svg',
  'src/content-source/100-rc099.html','src/data/evidence-registry.json','src/data/evidence-snapshot.json',
  'src/data/release-invariants.json','src/data/release.json','src/data/semantic/knowledge-graph.jsonld',
  'src/data/templates/main-head.html','src/data/visible-contract.json','src/data/volatile-facts.json'
]);
const gs=spawnSync('git',['status','--porcelain=v1','--untracked-files=all'],{encoding:'utf8',maxBuffer:4*1024*1024});
if(gs.error)throw gs.error;if(gs.status!==0)throw new Error(gs.stderr||gs.stdout);
const changed=gs.stdout.split(/\r?\n/).filter(Boolean).map(line=>{
  const raw=line.slice(3);const arrow=raw.lastIndexOf(' -> ');return arrow>=0?raw.slice(arrow+4):raw;
});
const unexpected=changed.filter(p=>!allowed.has(p));
if(unexpected.length)throw new Error(`Unexpected release-freeze mutation(s): ${unexpected.join(', ')}`);
console.log(JSON.stringify({locked:true,sha256:result.sha256,records:result.records,bytes:result.bytes,releaseFreezeMutationGuard:'PASS',changed},null,2));
