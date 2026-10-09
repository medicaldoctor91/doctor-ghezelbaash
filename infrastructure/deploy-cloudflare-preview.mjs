import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';

const execute=promisify(execFile);
export const POLICY=Object.freeze({repository:'medicaldoctor91/doctor-ghezelbaash',branch:'experiment/source-preview',account:'884d1d90bd1fb6ecca14992c6c60d677',project:'doctor-ghezelbaash',productionBranch:'main',wrangler:'4.149.0'});
const base=`/accounts/${POLICY.account}/pages/projects/${POLICY.project}`;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const clone=v=>JSON.parse(JSON.stringify(v));

export function assertDispatch(context){
  assert.equal(context.requested,'true','Preview must be explicitly requested');
  assert.equal(context.event,'workflow_dispatch','Preview requires manual workflow dispatch');
  assert.equal(context.repository,POLICY.repository,'Unexpected repository');
  assert.equal(context.ref,`refs/heads/${POLICY.branch}`,'Preview may run only on experiment/source-preview');
  assert.match(context.sha,/^[0-9a-f]{40}$/,'Invalid commit SHA');
}

export function assertProject(project){
  assert.equal(project?.name,POLICY.project,'Unexpected Cloudflare project');
  assert.equal(project.production_branch,POLICY.productionBranch,'Unexpected production branch');
  assert.notEqual(project.production_branch,POLICY.branch,'Candidate must not be the production branch');
  assert(['ghezelbaash.ir','www.ghezelbaash.ir'].some(domain=>project.domains?.includes(domain)),'Expected production domain is absent');
  assert.equal(project.subdomain,`${POLICY.project}.pages.dev`,'Unexpected Pages subdomain');
  assert.equal(project.source?.type,'github','Expected GitHub project source is unavailable');
  const source=project.source.config;
  assert(source&&typeof source==='object'&&!Array.isArray(source),'GitHub project source configuration is unavailable');
  assert.equal(source.owner,'medicaldoctor91','Unexpected project source owner');
  assert.equal(source.repo_name,'doctor-ghezelbaash','Unexpected project source repository');
  assert.equal(source.production_branch,POLICY.productionBranch,'Unexpected source production branch');
  const canonical=project.canonical_deployment;
  assert.equal(canonical?.environment,'production','Production canonical deployment is unavailable');
  assert.equal(typeof canonical.id,'string','Production canonical deployment ID is unavailable');
  assert(canonical.id.length>0,'Empty production canonical deployment ID');
  return canonical.id;
}

export function assertPreviewDeployment(deployment,sha){
  assert.equal(deployment?.environment,'preview','Deployment is not a preview');
  const metadata=deployment.deployment_trigger?.metadata;
  assert.equal(metadata?.branch,POLICY.branch,'Deployment branch mismatch');
  assert.equal(metadata?.commit_hash,sha,'Deployment SHA mismatch');
  assert.equal(deployment.latest_stage?.name,'deploy','Preview has not reached the deployment stage');
  assert.equal(deployment.latest_stage?.status,'success','Preview deployment is not successful');
  assert.notEqual(deployment.is_skipped,true,'Preview deployment was skipped');
  assert.equal(typeof deployment.id,'string','Missing deployment ID');
  assert.match(deployment.id,/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/,'Invalid deployment UUID');
  const url=new URL(deployment.url);
  assert.equal(url.protocol,'https:','Preview URL must use HTTPS');
  assert.match(url.hostname,/^[a-z0-9]+\.doctor-ghezelbaash\.pages\.dev$/,'Unexpected immutable preview host');
  assert.equal(url.hostname,`${deployment.id.split('-')[0]}.${POLICY.project}.pages.dev`,'Immutable preview host does not match deployment UUID');
  assert.equal(url.port,'','Unexpected immutable preview port');
  assert.equal(url.pathname,'/','Unexpected preview URL path');
  assert(!url.username&&!url.password&&!url.search&&!url.hash,'Unexpected preview URL components');
  return url.origin;
}

async function walk(directory,root=directory){
  const found=[];
  for(const entry of(await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const file=path.join(directory,entry.name);
    assert(!entry.isSymbolicLink(),'Symlink is forbidden in sealed dist');
    if(entry.isDirectory())found.push(...await walk(file,root));
    else{assert(entry.isFile(),'Unexpected dist entry');found.push(['/'+path.relative(root,file).split(path.sep).join('/'),file]);}
  }
  return found;
}

export async function readSealedRelease(projectRoot,sha){
  const dist=path.join(projectRoot,'dist');
  const provenance=JSON.parse(await fs.readFile(path.join(dist,'release-provenance.json'),'utf8'));
  const report=JSON.parse(await fs.readFile(path.join(projectRoot,'release/verification-report.json'),'utf8'));
  assert.equal(provenance.sourceCommit,sha,'Sealed provenance SHA mismatch');
  assert.equal(report.sourceCommit,sha,'Release report SHA mismatch');
  assert.equal(report.status,'PASS','Release verification did not pass');
  assert.equal(report.postSealReadOnly,true,'Post-seal verification is not read-only');
  assert.equal(report.browserVerification,'PASS','Reader browser verification did not pass');
  const manifest=JSON.parse(await fs.readFile(path.join(dist,'integrity-manifest.json'),'utf8'));
  assert.equal(manifest.algorithm,'sha256','Invalid seal algorithm');
  const files=await walk(dist),listed=Object.keys(manifest.files).sort();
  assert.deepEqual(files.map(([name])=>name).filter(name=>name!=='/integrity-manifest.json').sort(),listed,'Seal does not cover the exact distribution');
  const hashes={};
  for(const[name,file]of files){
    const bytes=await fs.readFile(file),hash=digest(bytes);hashes[name]=hash;
    if(name!=='/integrity-manifest.json'){
      assert.equal(manifest.files[name].sha256,hash,`Seal hash mismatch: ${name}`);
      assert.equal(manifest.files[name].bytes,bytes.length,`Seal byte count mismatch: ${name}`);
    }
  }
  return {hashes,sha256:digest(JSON.stringify(hashes))};
}

export async function assertCheckout(projectRoot,sha){
  assert.equal((await execute('git',['rev-parse','HEAD'],{cwd:projectRoot})).stdout.trim(),sha,'Checked-out SHA mismatch');
  assert.equal((await execute('git',['status','--porcelain','--untracked-files=no'],{cwd:projectRoot})).stdout.trim(),'','Tracked checkout is dirty');
  async function absent(file){
    try{await fs.lstat(file);assert.fail(`Unexpected deployment executable/configuration: ${file}`);}catch(error){if(error.code!=='ENOENT')throw error;}
  }
  for(let directory=path.resolve(projectRoot);;directory=path.dirname(directory)){
    for(const file of['wrangler.toml','wrangler.json','wrangler.jsonc','.wrangler/deploy/config.json'])await absent(path.join(directory,file));
    if(directory===path.dirname(directory))break;
  }
  for(const file of['functions','dist/_worker.js','dist/_routes.json'])await absent(path.join(projectRoot,file));
}

export function createApiGet(token){
  assert(token,'CLOUDFLARE_API_TOKEN is unavailable');
  return async resource=>{
    assert(resource===base||resource===`${base}/deployments?per_page=25&page=1`,'Unexpected Cloudflare API resource');
    let response;
    try{response=await fetch('https://api.cloudflare.com/client/v4'+resource,{method:'GET',redirect:'error',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(30000)});}catch{throw new Error('Cloudflare API request failed');}
    if(!response.ok)throw new Error(`Cloudflare API HTTP ${response.status}`);
    let payload;try{payload=await response.json();}catch{throw new Error('Cloudflare API returned invalid JSON');}
    if(payload.success!==true)throw new Error('Cloudflare API returned failure');
    assert(payload.result,'Cloudflare API result is unavailable');
    return payload.result;
  };
}

export function previewArguments(projectRoot,sha){
  assert.match(sha,/^[0-9a-f]{40}$/,'Invalid commit SHA');
  return ['--yes',`--package=wrangler@${POLICY.wrangler}`,'--','wrangler','pages','deploy',path.join(projectRoot,'dist'),'--project-name',POLICY.project,'--branch',POLICY.branch,'--commit-hash',sha,'--commit-dirty=false'];
}
export async function uploadPreview(projectRoot,sha,env){
  const args=previewArguments(projectRoot,sha);
  let stdout;
  try{({stdout}=await execute('npx',args,{cwd:projectRoot,env:{...env,CI:'true',CLOUDFLARE_ACCOUNT_ID:POLICY.account,WRANGLER_SEND_METRICS:'false'},timeout:600000,maxBuffer:8*1024*1024}));}catch{throw new Error('Pinned Wrangler preview upload failed; command output withheld');}
  const urls=[...new Set([...stdout.matchAll(/https:\/\/[a-z0-9]+\.doctor-ghezelbaash\.pages\.dev\b/g)].map(match=>match[0]))];
  assert(urls.length>0,'Wrangler did not return an immutable preview URL');
  return urls;
}

// Only uploadPreview may mutate Cloudflare, and it always uses the fixed candidate branch.
export async function runPreview({context,readSeal,checkCheckout,apiGet,upload,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),proof={}}){
  assertDispatch(context);
  Object.assign(proof,{sourceCommit:context.sha,branch:POLICY.branch,project:POLICY.project,status:'FAIL',productionUnchanged:null,postSealReadOnly:null});
  await checkCheckout();
  const sealBefore=await readSeal();
  const projectBefore=await apiGet(base),productionBefore=assertProject(projectBefore);
  const before=await apiGet(`${base}/deployments?per_page=25&page=1`);
  assert(Array.isArray(before),'Invalid deployments API result');
  const beforeIds=new Set(before.map(item=>item.id));
  proof.productionDeploymentIdBefore=productionBefore;
  try{
    const urls=await upload();
    let deployment=null;
    for(let attempt=0;attempt<12;attempt++){
      const deployments=await apiGet(`${base}/deployments?per_page=25&page=1`);
      assert(Array.isArray(deployments),'Invalid deployments API result');
      const matches=deployments.filter(item=>!beforeIds.has(item.id)&&urls.includes(item.url?.replace(/\/$/,'')));
      assert(matches.length<=1,'Ambiguous preview deployment');
      if(matches.length===1&&matches[0].latest_stage?.name==='deploy'&&matches[0].latest_stage?.status==='success'){deployment=matches[0];break;}
      if(matches.some(item=>['failure','canceled'].includes(item.latest_stage?.status)))throw new Error('Cloudflare preview deployment failed');
      if(attempt<11)await wait(5000);
    }
    assert(deployment,'Successful preview deployment was not verified');
    proof.previewUrl=assertPreviewDeployment(deployment,context.sha);
    proof.previewDeploymentId=deployment.id;
  }finally{
    const productionAfter=assertProject(await apiGet(base));
    proof.productionDeploymentIdAfter=productionAfter;
    proof.productionUnchanged=productionBefore===productionAfter;
    assert.equal(proof.productionUnchanged,true,'Production canonical deployment changed');
    const sealAfter=await readSeal();
    proof.postSealReadOnly=sealBefore.sha256===sealAfter.sha256;
    assert.deepEqual(sealAfter.hashes,sealBefore.hashes,'Uploading mutated sealed dist');
    assert.equal(proof.postSealReadOnly,true,'Uploading mutated sealed dist inventory');
    await checkCheckout();
    proof.distInventorySha256=sealAfter.sha256;
  }
  proof.status='PASS';
  return clone(proof);
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const env=process.env,context={requested:env.PREVIEW_REQUESTED,event:env.GITHUB_EVENT_NAME,repository:env.GITHUB_REPOSITORY,ref:env.GITHUB_REF,sha:env.GITHUB_SHA};
  const proof={};
  try{
    assertDispatch(context);
    await runPreview({context,proof,readSeal:()=>readSealedRelease(projectRoot,context.sha),checkCheckout:()=>assertCheckout(projectRoot,context.sha),apiGet:createApiGet(env.CLOUDFLARE_API_TOKEN),upload:()=>uploadPreview(projectRoot,context.sha,env)});
    if(env.GITHUB_OUTPUT)await fs.appendFile(env.GITHUB_OUTPUT,`preview_url=${proof.previewUrl}\npreview_sha=${proof.sourceCommit}\n`);
    console.log(JSON.stringify(proof,null,2));
  }catch(error){proof.status='FAIL';proof.error=error.message;process.exitCode=1;console.error(error.message);}
  await fs.mkdir(path.join(projectRoot,'release'),{recursive:true});
  await fs.writeFile(path.join(projectRoot,'release/cloudflare-preview-proof.json'),JSON.stringify(proof,null,2)+'\n');
}
