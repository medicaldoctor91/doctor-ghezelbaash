import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';

const run=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
const workflow=await readFile('.github/workflows/hugging-face-authority.yml','utf8');
const cloudflare=await readFile('.github/workflows/cloudflare-pages-deploy.yml','utf8');
const recovery=await readFile('.github/workflows/reconcile-published-v1.2.4.yml','utf8');
const huggingFace=await readFile('scripts/huggingface.mjs','utf8');
const retiredDatasetId=['Q140','304972'].join('');

assert.match(workflow,/git merge-base --is-ancestor "\$BASE_SHA" "\$CANDIDATE_SHA"/);
assert.match(workflow,/push --atomic origin HEAD:main "refs\/tags\/v\$RELEASE_TARGET"/);
assert.doesNotMatch(workflow,/push origin HEAD:main\s*\n\s*if git ls-remote/);
assert.doesNotMatch(cloudflare,/configure-cloudflare-edge\.py\s+\\\s*\n\s*--apply\b/);
assert.match(cloudflare,/--purge-cache-only/);
for(const token of [
  'dccd90c75c4604bd2f188b958eff3fa9dfb8d347',
  '28f0eee13c813642af369281b0f42cf7ab2ee8ea',
  'ef2333a9a2b9c5d2a2df757d7c42357c77eff659',
  '10.5281/zenodo.22131441',
  'git merge-base --is-ancestor "$RECOVERY_SOURCE_SHA" HEAD',
])assert.ok(recovery.includes(token),`Recovery workflow missing ${token}`);
assert.ok(recovery.includes('RECOVERY_HF_BASE_SHA'), 'Recovery must treat the historical HF candidate as a core baseline');
assert.ok(recovery.includes('HF_FROZEN_SHA'), 'Recovery must bind the clean derived HF tag');
assert.ok(recovery.includes('huggingface.mjs sanitize'), 'Recovery must sanitize HF enrichment before tagging and promotion');
assert.ok(huggingFace.includes("['Q140','304972'].join('')"), 'HF sanitizer must construct the retired identifier without publishing it literally');
assert.ok(huggingFace.includes('assertNoRetiredDatasetId(hub)'), 'HF preparation must enforce the full-tree retired-identifier gate');
assert.ok(!recovery.includes(retiredDatasetId), 'Recovery workflow republishes the retired identifier literally');
assert.ok(!huggingFace.includes(retiredDatasetId), 'HF sanitizer republishes the retired identifier literally');

const dir=await mkdtemp(path.join(os.tmpdir(),'ghezelbaash-release-topology-'));
try{
  run(dir,['init','-q']);
  run(dir,['config','user.name','release-test']);
  run(dir,['config','user.email','release-test@example.invalid']);
  await writeFile(path.join(dir,'state.txt'),'base\n');
  run(dir,['add','state.txt']);
  run(dir,['commit','-qm','base']);
  const base=run(dir,['rev-parse','HEAD']);
  run(dir,['switch','-qc','candidate']);
  await writeFile(path.join(dir,'release.txt'),'snapshot\n');
  run(dir,['add','release.txt']);
  run(dir,['commit','-qm','snapshot']);
  const snapshot=run(dir,['rev-parse','HEAD']);
  run(dir,['switch','-qc','main',base]);
  await writeFile(path.join(dir,'workflow.txt'),'fix\n');
  run(dir,['add','workflow.txt']);
  run(dir,['commit','-qm','workflow fix']);
  const current=run(dir,['rev-parse','HEAD']);
  assert.throws(()=>run(dir,['merge-base','--is-ancestor',current,snapshot]));
  run(dir,['merge','--no-ff','-qm','integrate immutable snapshot',snapshot]);
  const integrated=run(dir,['rev-parse','HEAD']);
  run(dir,['merge-base','--is-ancestor',current,integrated]);
  run(dir,['merge-base','--is-ancestor',snapshot,integrated]);
  run(dir,['tag','-a','v1.2.4',snapshot,'-m','frozen snapshot']);
  assert.equal(run(dir,['rev-parse','v1.2.4^{}']),snapshot);
  assert.notEqual(integrated,snapshot);
}finally{
  await rm(dir,{recursive:true,force:true});
}

console.log(JSON.stringify({
  releaseTransaction:'PASS',
  divergenceRejectedBeforePublish:true,
  integrationKeepsBothParents:true,
  frozenTagExact:true,
  cloudflareFullApplyDisabled:true,
}));
