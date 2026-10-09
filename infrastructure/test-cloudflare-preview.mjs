import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {test} from 'node:test';
import {POLICY,assertDispatch,assertProject,assertPreviewDeployment,readSealedRelease,assertCheckout,previewArguments,runPreview} from './deploy-cloudflare-preview.mjs';

const sha='1'.repeat(40);
const context={requested:'true',event:'workflow_dispatch',repository:POLICY.repository,ref:'refs/heads/'+POLICY.branch,sha};
const project={name:POLICY.project,subdomain:POLICY.project+'.pages.dev',domains:['ghezelbaash.ir','www.ghezelbaash.ir'],production_branch:'main',canonical_deployment:{id:'production-id',environment:'production'},source:{type:'github',config:{owner:'medicaldoctor91',repo_name:'doctor-ghezelbaash',production_branch:'main'}}};
const preview={id:'a123bcde-1234-4234-9234-123456789abc',environment:'preview',url:'https://a123bcde.doctor-ghezelbaash.pages.dev',latest_stage:{name:'deploy',status:'success'},is_skipped:false,deployment_trigger:{metadata:{branch:POLICY.branch,commit_hash:sha}}};
const copy=v=>JSON.parse(JSON.stringify(v));

for(const[field,value]of Object.entries({requested:'false',event:'push',repository:'someone/doctor-ghezelbaash',ref:'refs/heads/main',sha:'not-a-sha'})){
  test(`deny dispatch with invalid ${field}`,()=>assert.throws(()=>assertDispatch({...context,[field]:value})));
}
test('accept only explicitly requested candidate dispatch',()=>assertDispatch(context));
for(const[field,value]of Object.entries({name:'different-project',production_branch:POLICY.branch,subdomain:'another.pages.dev',domains:['another.example'],canonical_deployment:{id:'bad',environment:'preview'},source:{type:'github',config:{owner:'someone',repo_name:'doctor-ghezelbaash',production_branch:'main'}}})){
  test(`deny unexpected project ${field}`,()=>assert.throws(()=>assertProject({...project,[field]:value})));
}
test('deny project without source identity',()=>assert.throws(()=>assertProject({...project,source:undefined})));
test('deny project without GitHub source configuration',()=>assert.throws(()=>assertProject({...project,source:{type:'github'}})));
test('deny project with non-GitHub source type',()=>assert.throws(()=>assertProject({...project,source:{...project.source,type:'gitlab'}})));
test('deny GitHub source with wrong repository',()=>assert.throws(()=>assertProject({...project,source:{type:'github',config:{...project.source.config,repo_name:'different-repository'}}})));
test('deny GitHub source with wrong production branch',()=>assert.throws(()=>assertProject({...project,source:{type:'github',config:{...project.source.config,production_branch:POLICY.branch}}})));
for(const[field,value]of Object.entries({environment:'production',url:'https://www.ghezelbaash.ir',latest_stage:{status:'failure'},deployment_trigger:{metadata:{branch:'main',commit_hash:sha}}})){
  test(`deny deployment with unexpected ${field}`,()=>assert.throws(()=>assertPreviewDeployment({...preview,[field]:value},sha)));
}
test('deny deployment with different SHA',()=>assert.throws(()=>assertPreviewDeployment({...preview,deployment_trigger:{metadata:{branch:POLICY.branch,commit_hash:'2'.repeat(40)}}},sha)));
test('successful upload/build stage alone does not prove a live preview',()=>assert.throws(()=>assertPreviewDeployment({...preview,latest_stage:{name:'upload',status:'success'}},sha)));
test('skipped deployment cannot pass',()=>assert.throws(()=>assertPreviewDeployment({...preview,is_skipped:true},sha)));
test('deny malformed deployment UUID',()=>assert.throws(()=>assertPreviewDeployment({...preview,id:'not-a-uuid'},sha)));
test('deny immutable host belonging to another deployment UUID',()=>assert.throws(()=>assertPreviewDeployment({...preview,url:'https://deadbeef.doctor-ghezelbaash.pages.dev'},sha)));
test('deny nondefault HTTPS port on otherwise matching immutable preview host',()=>assert.throws(()=>assertPreviewDeployment({...preview,url:'https://a123bcde.doctor-ghezelbaash.pages.dev:8443'},sha)));
test('accept immutable successful preview URL and exact identity',()=>assert.equal(assertPreviewDeployment(preview,sha),preview.url));
test('pinned upload arguments always select fixed preview branch and exact SHA',()=>{
  const args=previewArguments('/safe/repo',sha);
  assert.deepEqual(args,['--yes','--package=wrangler@4.149.0','--','wrangler','pages','deploy','/safe/repo/dist','--project-name',POLICY.project,'--branch',POLICY.branch,'--commit-hash',sha,'--commit-dirty=false']);
  assert(!args.includes('project')&&!args.includes('create'));
});

function fixture(overrides={}){
  let projectReads=0,listReads=0,sealReads=0,uploads=0;
  const seal={hashes:{'/index.html':'hash'},sha256:'inventory'};
  return {
    context,
    async checkCheckout(){},
    async readSeal(){sealReads++;return sealReads===1?seal:(overrides.afterSeal??seal);},
    async apiGet(resource){
      if(resource.endsWith('/doctor-ghezelbaash')){projectReads++;return projectReads===1?(overrides.beforeProject??copy(project)):(overrides.afterProject??copy(project));}
      listReads++;return listReads===1?[]:[overrides.preview??copy(preview)];
    },
    async upload(){uploads++;if(overrides.uploadError)throw new Error('Upload denied');return [preview.url];},
    async wait(){},
    counts:()=>({projectReads,listReads,sealReads,uploads})
  };
}
test('wrong branch is denied before API or upload',async()=>{
  const f=fixture();f.context={...context,ref:'refs/heads/main'};
  await assert.rejects(runPreview(f));assert.deepEqual(f.counts(),{projectReads:0,listReads:0,sealReads:0,uploads:0});
});
test('wrong project is denied before upload',async()=>{
  const f=fixture({beforeProject:{...project,name:'wrong'}});
  await assert.rejects(runPreview(f));assert.equal(f.counts().uploads,0);
});
test('unsealed release is denied before API or upload',async()=>{
  const f=fixture();f.readSeal=async()=>{throw new Error('Unsealed');};
  await assert.rejects(runPreview(f));assert.equal(f.counts().uploads,0);assert.equal(f.counts().projectReads,0);
});
test('successful preview proves production canonical ID and sealed bytes unchanged',async()=>{
  const f=fixture(),proof=await runPreview(f);
  assert.equal(proof.status,'PASS');assert.equal(proof.productionUnchanged,true);assert.equal(proof.postSealReadOnly,true);assert.equal(proof.previewUrl,preview.url);assert.equal(proof.sourceCommit,sha);
  assert.deepEqual(f.counts(),{projectReads:2,listReads:2,sealReads:2,uploads:1});
});
test('production canonical ID drift fails instead of reporting PASS',async()=>{
  const f=fixture({afterProject:{...project,canonical_deployment:{id:'other-production',environment:'production'}}}),proof={};
  await assert.rejects(runPreview({...f,proof}),/Production canonical deployment changed/);assert.equal(proof.status,'FAIL');assert.equal(proof.productionUnchanged,false);
});
test('mutated sealed bytes fail instead of reporting PASS',async()=>{
  const f=fixture({afterSeal:{hashes:{'/index.html':'other'},sha256:'changed'}}),proof={};
  await assert.rejects(runPreview({...f,proof}),/Uploading mutated/);assert.equal(proof.status,'FAIL');assert.equal(proof.postSealReadOnly,false);
});
test('upload failure still checks production and sealed bytes, and remains FAIL',async()=>{
  const f=fixture({uploadError:true}),proof={};
  await assert.rejects(runPreview({...f,proof}),/Upload denied/);assert.equal(proof.status,'FAIL');assert.equal(proof.productionUnchanged,true);assert.equal(proof.postSealReadOnly,true);
});
test('production deployment response cannot be accepted as preview',async()=>{
  const f=fixture({preview:{...preview,environment:'production'}}),proof={};
  await assert.rejects(runPreview({...f,proof}),/not a preview/);assert.equal(proof.status,'FAIL');assert.equal(proof.productionUnchanged,true);
});

test('sealed release checks exact provenance, complete inventory, byte lengths and checksums',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'cf-preview-test-'));
  try{
    await fs.mkdir(path.join(root,'dist'));await fs.mkdir(path.join(root,'release'));
    const provenance={sourceCommit:sha};
    await fs.writeFile(path.join(root,'dist/release-provenance.json'),JSON.stringify(provenance));
    await fs.writeFile(path.join(root,'dist/index.html'),'<main>known content</main>');
    const report={sourceCommit:sha,status:'PASS',postSealReadOnly:true,browserVerification:'PASS'};
    await fs.writeFile(path.join(root,'release/verification-report.json'),JSON.stringify(report));
    const files={};
    for(const file of['index.html','release-provenance.json']){const bytes=await fs.readFile(path.join(root,'dist',file));files['/'+file]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
    await fs.writeFile(path.join(root,'dist/integrity-manifest.json'),JSON.stringify({algorithm:'sha256',files}));
    const valid=await readSealedRelease(root,sha);assert.equal(Object.keys(valid.hashes).length,3);
    await assert.rejects(readSealedRelease(root,'2'.repeat(40)),/provenance SHA mismatch/);
    await fs.writeFile(path.join(root,'dist/index.html'),'modified');await assert.rejects(readSealedRelease(root,sha),/Seal hash mismatch/);
    await fs.writeFile(path.join(root,'dist/extra.txt'),'unsealed');await assert.rejects(readSealedRelease(root,sha),/exact distribution/);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

const execute=promisify(execFile);
async function withGitCheckout(action){
  const parent=await fs.mkdtemp(path.join(os.tmpdir(),'cf-preview-checkout-test-')),root=path.join(parent,'checkout');
  try{
    await fs.mkdir(root);
    await execute('git',['init','--quiet','--initial-branch=test'],{cwd:root});
    await fs.writeFile(path.join(root,'tracked.txt'),'clean');
    await execute('git',['add','tracked.txt'],{cwd:root});
    await execute('git',['-c','user.name=Preview Safety Test','-c','user.email=preview-safety@example.invalid','commit','--quiet','-m','fixture'],{cwd:root});
    const fixtureSha=(await execute('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim();
    await action({parent,root,sha:fixtureSha});
  }finally{await fs.rm(parent,{recursive:true,force:true});}
}
test('actual clean Git checkout with no deployment configuration is accepted',()=>withGitCheckout(async({root,sha})=>assertCheckout(root,sha)));
test('actual wrong checkout SHA is denied',()=>withGitCheckout(async({root})=>assert.rejects(assertCheckout(root,'f'.repeat(40)),/Checked-out SHA mismatch/)));
test('actual tracked dirty checkout is denied',()=>withGitCheckout(async({root,sha})=>{
  await fs.writeFile(path.join(root,'tracked.txt'),'dirty');
  await assert.rejects(assertCheckout(root,sha),/Tracked checkout is dirty/);
}));
for(const file of['wrangler.toml','wrangler.json','wrangler.jsonc','.wrangler/deploy/config.json']){
  for(const scope of['root','ancestor']){
    test(`actual ${scope} ${file} is denied before any upload`,()=>withGitCheckout(async({root,parent,sha})=>{
      const target=path.join(scope==='root'?root:parent,file);
      await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,'{}');
      let uploads=0;
      await assert.rejects(runPreview({context,readSeal:async()=>({hashes:{},sha256:'seal'}),checkCheckout:()=>assertCheckout(root,sha),apiGet:async()=>{throw new Error('API must not be reached');},upload:async()=>{uploads++;return[];}}),/Unexpected deployment executable\/configuration/);
      assert.equal(uploads,0);
    }));
  }
}
for(const file of['functions/index.js','dist/_worker.js','dist/_routes.json']){
  test(`actual ${file} deployment executable is denied`,()=>withGitCheckout(async({root,sha})=>{
    const target=path.join(root,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,'{}');
    await assert.rejects(assertCheckout(root,sha),/Unexpected deployment executable\/configuration/);
  }));
}
