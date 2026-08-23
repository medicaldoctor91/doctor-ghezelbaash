import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {appendFile,readFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

async function command_ensure(){
  const platform=JSON.parse(await readFile('.release/policy/platform-contract.json','utf8')),cf=platform.cloudflare;
  const API_ROOT='https://api.cloudflare.com/client/v4',EXPECTED_PROJECT=cf.pagesProject,EXPECTED_REPO=platform.repository,EXPECTED_BUILD={build_command:cf.build.command,destination_dir:cf.build.destinationDir,root_dir:cf.build.rootDir};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms)),statusOf=d=>d?.latest_stage?.status??d?.stages?.at(-1)?.status??'unknown';
  const productionBranch=()=>process.env.CF_PRODUCTION_BRANCH?.trim()||cf.productionBranch;
  const projectPatch=(sourceType='github')=>({production_branch:productionBranch(),build_config:{...EXPECTED_BUILD},source:{type:sourceType,config:{deployments_enabled:true,production_branch:productionBranch(),production_deployments_enabled:true,preview_deployment_setting:cf.preview.deploymentSetting,preview_branch_includes:[...cf.preview.branchIncludes],preview_branch_excludes:[...cf.preview.branchExcludes]}}});
  const safeProjectState=p=>{const s=p?.source??{},c=s.config??{},b=p?.build_config??{};return{name:p?.name??null,productionBranch:p?.production_branch??null,sourceType:s.type??null,repository:c.owner&&c.repo_name?`${c.owner}/${c.repo_name}`:null,deploymentsEnabled:c.deployments_enabled??null,productionDeploymentsEnabled:c.production_deployments_enabled??null,previewDeploymentSetting:c.preview_deployment_setting??null,previewBranchIncludes:c.preview_branch_includes??[],previewBranchExcludes:c.preview_branch_excludes??[],buildCommand:b.build_command??null,destinationDir:b.destination_dir??null,rootDir:b.root_dir??null}};
  const projectIsExact=(p,repo=EXPECTED_REPO)=>{const s=safeProjectState(p);return s.name===EXPECTED_PROJECT&&s.productionBranch===productionBranch()&&s.sourceType==='github'&&s.repository===repo&&s.deploymentsEnabled===true&&s.productionDeploymentsEnabled===true&&s.previewDeploymentSetting==='none'&&s.previewBranchIncludes.length===0&&s.previewBranchExcludes.length===0&&s.buildCommand===EXPECTED_BUILD.build_command&&s.destinationDir===EXPECTED_BUILD.destination_dir&&(s.rootDir===''||s.rootDir==='/')};
  const matchDeployment=(items,commitHash,environment)=>items.filter(x=>x?.deployment_trigger?.type==='github:push').filter(x=>x?.deployment_trigger?.metadata?.commit_hash===commitHash).filter(x=>!environment||x?.environment===environment).sort((a,b)=>String(b.created_on).localeCompare(String(a.created_on)))[0]??null;
  const writeGithubOutput=async values=>{const file=process.env.GITHUB_OUTPUT?.trim();if(!file)return;await appendFile(file,Object.entries(values).map(([k,v])=>`${k}=${String(v??'')}\n`).join(''))};
  async function selfTest(){process.env.CF_PRODUCTION_BRANCH=cf.productionBranch;const patch=projectPatch();assert.equal(patch.production_branch,cf.productionBranch);assert.equal(patch.source.config.preview_deployment_setting,cf.preview.deploymentSetting);assert.deepEqual(patch.source.config.preview_branch_includes,[]);assert.deepEqual(patch.source.config.preview_branch_excludes,[]);const [owner,repo_name]=EXPECTED_REPO.split('/');const p={name:EXPECTED_PROJECT,production_branch:cf.productionBranch,source:{type:'github',config:{owner,repo_name,...patch.source.config}},build_config:patch.build_config};assert(projectIsExact(p));console.log('CLOUDFLARE_PAGES_MAIN_ONLY_CONTRACT_SELF_TEST_OK')}
  async function main(){const token=process.env.CLOUDFLARE_API_TOKEN?.trim(),account=process.env.CLOUDFLARE_ACCOUNT_ID?.trim(),projectName=process.env.CF_PROJECT?.trim()||EXPECTED_PROJECT,commitHash=(process.env.CF_EXPECTED_COMMIT||process.env.GITHUB_SHA||'').trim(),expectedEnv=(process.env.CF_EXPECTED_ENVIRONMENT||'').trim();assert(token,'CLOUDFLARE_API_TOKEN required');assert(account,'CLOUDFLARE_ACCOUNT_ID required');assert.equal(projectName,EXPECTED_PROJECT,'Unexpected Cloudflare project');assert.equal(process.env.GITHUB_REPOSITORY||EXPECTED_REPO,EXPECTED_REPO,'Unexpected repository');const base=`/accounts/${encodeURIComponent(account)}/pages/projects/${encodeURIComponent(projectName)}`;
  const req=async(path,{method='GET',body}={})=>{const r=await fetch(API_ROOT+path,{method,headers:{authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)}),p=await r.json().catch(()=>null);if(!r.ok||p?.success!==true)throw new Error(`Cloudflare ${method} ${path} HTTP ${r.status}: ${JSON.stringify(p?.errors||[])}`);return p.result};
  let p=await req(base);console.log('CF_PROJECT_BEFORE',JSON.stringify(safeProjectState(p)));if(process.argv.includes('--configure')){if(!projectIsExact(p)){p=await req(base,{method:'PATCH',body:projectPatch(p?.source?.type||'github')})}p=await req(base);assert(projectIsExact(p),'Cloudflare main-only deployment settings failed to converge');console.log('CF_PROJECT_CONFIGURED',JSON.stringify(safeProjectState(p)));if(!process.argv.includes('--wait'))return}
  if(process.argv.includes('--verify-config')){assert(projectIsExact(p),'Cloudflare main-only deployment settings drift');console.log('CF_PROJECT_CONFIG_PASS',JSON.stringify(safeProjectState(p)));return}
  if(!/^[0-9a-f]{40}$/.test(commitHash))throw new Error('CF_EXPECTED_COMMIT/GITHUB_SHA must be full SHA');if(expectedEnv!=='production')throw new Error('CF_EXPECTED_ENVIRONMENT must be production');let d=null;for(let attempt=1;attempt<=60&&!d;attempt++){d=matchDeployment(await req(`${base}/deployments?per_page=25`),commitHash,expectedEnv);if(!d){console.log(`CF_GIT_EVENT_WAIT attempt=${attempt} env=${expectedEnv} commit=${commitHash}`);await sleep(5000)}}assert(d,`No ${expectedEnv} github:push deployment for ${commitHash}`);if(d.is_skipped||['failure','canceled'].includes(statusOf(d))){console.log(`CF_DEPLOYMENT_RETRY_REQUEST id=${d.id} env=${expectedEnv} commit=${commitHash} prior=${d.is_skipped?'skipped:'+String(d.skip_reason||'unknown'):statusOf(d)}`);d=await req(`${base}/deployments/${encodeURIComponent(d.id)}/retry`,{method:'POST',body:{}});assert(d?.id,'Cloudflare retry did not return a deployment')}for(let attempt=1;attempt<=120;attempt++){d=await req(`${base}/deployments/${encodeURIComponent(d.id)}`);const st=statusOf(d);console.log(`CF_DEPLOYMENT_STATUS id=${d.id} attempt=${attempt} status=${st}`);if(st==='success')break;if(['failure','canceled'].includes(st))throw new Error(`Cloudflare ${d.id} ${st}`);if(attempt===120)throw new Error('Cloudflare deployment timeout');await sleep(10000)}assert.equal(d.environment,expectedEnv,'Deployment environment drift');assert.equal(d.deployment_trigger?.metadata?.commit_hash,commitHash,'Deployment commit drift');assert.equal(statusOf(d),'success');const deploymentUrl=String(d.url||'').replace(/\/+$/,'')+'/';assert(/^https:\/\//.test(deploymentUrl),'Cloudflare deployment URL missing');await writeGithubOutput({deployment_id:d.id,deployment_url:deploymentUrl,deployment_environment:d.environment,deployment_commit:commitHash});console.log(`CF_GIT_DEPLOYMENT_PROVEN env=${expectedEnv} id=${d.id} commit=${commitHash} url=${deploymentUrl}`)}
  if(process.argv.includes('--self-test'))await selfTest();else await main();
}

async function command_verify(){
  const root=process.cwd();
  const base=process.env.VERIFY_BASE_URL||'https://www.ghezelbaash.ir/';
  const freshOnly=process.argv.includes('--fresh-only');
  const stable=JSON.parse(await readFile(path.join(root,'src/data/stable-media-aliases.json'),'utf8'));

  const ensureLocalDist=async()=>{
    try{await access(path.join(root,'dist','answers.txt'));return}catch{}
    const commit=process.env.CANDIDATE_SHA||process.env.CF_EXPECTED_COMMIT||process.env.SOURCE_COMMIT||process.env.CF_PAGES_COMMIT_SHA||'';
    const epoch=process.env.SOURCE_DATE_EPOCH||'';
    if(!/^[0-9a-f]{40}$/.test(commit)||!/^\d+$/.test(epoch))throw new Error('Local DIST missing and exact commit/SOURCE_DATE_EPOCH unavailable');
    const buildEnv={...process.env,SOURCE_COMMIT:commit,CF_PAGES_COMMIT_SHA:commit,SOURCE_DATE_EPOCH:epoch,ASTRO_TELEMETRY_DISABLED:'1',CLOUDFLARE_API_TOKEN:'',ZENODO_TOKEN:'',ZENODO_ACCESS_TOKEN:'',ZENODO_API_TOKEN:'',HF_TOKEN:'',HUGGINGFACE_TOKEN:'',HUGGING_FACE_TOKEN:'',GOOGLE_PLACES_API_KEY:''};
    execFileSync('npm',['run','build'],{cwd:root,stdio:'inherit',env:buildEnv});
  };
  await ensureLocalDist();

  const core=['index.html','graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','index.md','llms-full.txt','datapackage.json','linkset.json','void.ttl','dcat.ttl','croissant.json','provenance.jsonld','evidence-snapshot.json','shapes.ttl','artifact-manifest.json','query-matrix.jsonl','current-release-matrix.json','live-observations.jsonld','live-serving-attestation.json','ns/entity-metadata/2026/index.html','ns/media-semantics/2026/index.html'];
  const files=[...new Set([...core,...stable.aliases.map(row=>row.path)])].sort();
  const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
  const routeFor=rel=>rel==='index.html'?'':rel.endsWith('/index.html')?rel.slice(0,-10):rel;
  const expected=new Map();
  for(const rel of files)expected.set(rel,await readFile(path.join(root,'dist',rel)));

  const fetchBytes=async url=>{
    const response=await fetch(url,{headers:{'user-agent':'ghezelbaash-pages-byte-verifier/3.0',accept:'*/*'},redirect:'follow',signal:AbortSignal.timeout(45000)});
    return {response,bytes:Buffer.from(await response.arrayBuffer())};
  };

  const verifyOne=async rel=>{
    const wanted=expected.get(rel),wantedSha=sha(wanted),url=new URL(routeFor(rel),base);
    for(let attempt=1;attempt<=24;attempt++){
      if(freshOnly){
        const bypass=new URL(url);bypass.searchParams.set('__pages_byte_verify',`${Date.now()}-${attempt}`);
        const fresh=await fetchBytes(bypass),freshSha=sha(fresh.bytes);
        if(fresh.response.status===200&&freshSha===wantedSha)return {rel,sha256:wantedSha,cacheBusted:fresh.response.status,cacheBustedExact:true};
        if(attempt===24)throw new Error(`Pages fresh-byte drift ${rel}: fresh=${fresh.response.status}/${freshSha} expected=${wantedSha} base=${base}`);
      }else{
        const ordinary=await fetchBytes(url),bypass=new URL(url);bypass.searchParams.set('__pages_byte_verify',`${Date.now()}-${attempt}`);
        const fresh=await fetchBytes(bypass),ordinarySha=sha(ordinary.bytes),freshSha=sha(fresh.bytes);
        if(ordinary.response.status===200&&fresh.response.status===200&&ordinarySha===wantedSha&&freshSha===wantedSha)return {rel,sha256:wantedSha,ordinary:ordinary.response.status,cacheBusted:fresh.response.status,cacheControl:ordinary.response.headers.get('cache-control'),age:ordinary.response.headers.get('age'),etag:ordinary.response.headers.get('etag'),cfCacheStatus:ordinary.response.headers.get('cf-cache-status'),reprDigest:ordinary.response.headers.get('repr-digest')};
        if(attempt===24)throw new Error(`Pages byte drift ${rel}: ordinary=${ordinary.response.status}/${ordinarySha} fresh=${fresh.response.status}/${freshSha} expected=${wantedSha} base=${base}`);
      }
      await new Promise(r=>setTimeout(r,3000));
    }
  };

  const results=[];let cursor=0;
  const worker=async()=>{while(cursor<files.length){const i=cursor++;results[i]=await verifyOne(files[i])}};
  await Promise.all(Array.from({length:Math.min(8,files.length)},worker));
  console.log(JSON.stringify({valid:true,mode:freshOnly?'fresh-origin':'full-edge',base,verifiedFiles:results.length,stableMediaAliases:stable.aliases.length,cacheBustedByteExact:true,ordinaryByteExact:freshOnly?null:true,credentialIsolatedLocalBuild:true,results},null,2));
}

const command=process.argv[2];
if(!command)throw new Error('Usage: node scripts/cloudflare-pages.mjs <ensure|verify> [options]');
process.argv.splice(2,1);
switch(command){
  case 'ensure': await command_ensure(); break;
  case 'verify': await command_verify(); break;
  default: throw new Error('Usage: node scripts/cloudflare-pages.mjs <ensure|verify> [options]');
}
