import path from 'node:path';
import {chmod,mkdir,readFile,writeFile} from 'node:fs/promises';

async function installGitCredentialBridge(){
  if(process.env.GITHUB_ACTIONS!=='true'||!process.env.RUNNER_TEMP)return{};
  const dir=path.join(process.env.RUNNER_TEMP,'doctor-ghezelbaash-git-bridge');
  const askpass=path.join(dir,'hf-askpass.sh');
  const wrapper=path.join(dir,'git');
  await mkdir(dir,{recursive:true});
  await writeFile(askpass,`#!/bin/sh
case "$1" in
  *Username*) printf '%s\\n' "\${HF_GIT_USERNAME:-doctor-ghezelbaash}" ;;
  *Password*) printf '%s\\n' "\${HF_TOKEN:?HF_TOKEN is required for Hugging Face Git write}" ;;
  *) exit 1 ;;
esac
`);
  await chmod(askpass,0o700);
  await writeFile(wrapper,`#!/usr/bin/env bash
set -euo pipefail
REAL_GIT="\${DOCTOR_REAL_GIT:-/usr/bin/git}"
args=("$@")
filtered=()
hf_write=false
i=0
while (( i < \${#args[@]} )); do
  arg="\${args[$i]}"
  if [[ "$arg" == "-c" ]] && (( i + 1 < \${#args[@]} )); then
    next="\${args[$((i+1))]}"
    case "$next" in
      "http.https://huggingface.co/.extraheader=AUTHORIZATION: basic "*)
        hf_write=true
        i=$((i+2))
        continue
        ;;
    esac
  fi
  filtered+=("$arg")
  i=$((i+1))
done
if $hf_write; then
  test -n "\${HF_TOKEN:-}" || { echo 'HF_TOKEN is required for Hugging Face Git write' >&2; exit 2; }
  export GIT_TERMINAL_PROMPT=0
  export GIT_ASKPASS="\${DOCTOR_HF_ASKPASS:?DOCTOR_HF_ASKPASS is required}"
  exec "$REAL_GIT" "\${filtered[@]}"
fi
exec "$REAL_GIT" "$@"
`);
  await chmod(wrapper,0o700);
  return{
    DOCTOR_REAL_GIT:'/usr/bin/git',
    DOCTOR_HF_ASKPASS:askpass,
    HF_GIT_USERNAME:'doctor-ghezelbaash',
    PATH:`${dir}:${process.env.PATH||''}`,
  };
}

async function exportContract(){
  const contract=JSON.parse(await readFile('.release/policy/platform-contract.json','utf8')),
    cf=contract.cloudflare,
    bridge=await installGitCredentialBridge();
  const env={
    CF_PROJECT:cf.pagesProject,
    CLOUDFLARE_ACCOUNT_ID:cf.accountId,
    CF_PRODUCTION_BRANCH:cf.productionBranch,
    CF_EXPECTED_ENVIRONMENT:cf.expectedEnvironment,
    ZONE_NAME:contract.zoneName,
    CANONICAL_HOST:contract.canonicalHost,
    ...bridge,
  };
  for(const [key,value] of Object.entries(env)){
    if(!String(value||'').trim())throw new Error(`Platform contract missing ${key}`);
    console.log(`${key}=${value}`);
  }
}

async function validateContract(){
  const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
  const contract=await readJson('.release/policy/platform-contract.json'),release=await readJson('src/data/release.json'),pkg=await readJson('package.json'),lock=await readJson('package-lock.json'),codemeta=await readJson('codemeta.json');
  const cf=contract.cloudflare,runtime=contract.runtime,fail=m=>{throw new Error(m)};
  if(contract.schemaVersion!=='1.0')fail('Unsupported platform contract schema');
  if(contract.canonicalUrl!==release.canonicalUrl||contract.canonicalHost!==new URL(release.canonicalUrl).hostname)fail('Platform canonical URL drift');
  if(contract.repository!==release.dataset.github.repository.replace(/^https:\/\/github\.com\//,''))fail('Platform repository drift');
  if(cf.productionBranch!=='main'||cf.expectedEnvironment!=='production'||cf.preview?.deploymentSetting!=='none'||cf.preview?.branchIncludes?.length||cf.preview?.branchExcludes?.length)fail('Platform main-only/no-preview contract drift');
  if(cf.build?.command!=='npm run build'||cf.build?.destinationDir!=='dist'||cf.build?.rootDir!=='')fail('Platform build contract drift');
  if(cf.planTier!=='free')fail('Cloudflare plan contract drift');
  if(!Array.isArray(cf.requiredCustomDomains)||!cf.requiredCustomDomains.includes(contract.canonicalHost))fail('Required custom domains contract incomplete');
  if(!runtime?.node||!runtime?.nodeEngine||!runtime?.npm||!runtime?.npmEngine)fail('Canonical runtime contract incomplete');
  const nvmrc=(await readFile('.nvmrc','utf8')).trim();
  if(nvmrc!==runtime.node||pkg.engines?.node!==runtime.nodeEngine||pkg.engines?.npm!==runtime.npmEngine||pkg.packageManager!==`npm@${runtime.npm}`)fail('Runtime pin drift');
  const packageName=location=>{const remainder=location.slice(location.lastIndexOf('node_modules/')+'node_modules/'.length),parts=remainder.split('/');return remainder.startsWith('@')?parts.slice(0,2).join('/'):parts[0]};
  const requiredScriptApprovals=Object.entries(lock.packages??{}).filter(([location,metadata])=>location.includes('node_modules/')&&metadata?.hasInstallScript).map(([location,metadata])=>`${packageName(location)}@${metadata.version}`).sort(),approvedScripts=Object.entries(pkg.allowScripts??{}).filter(([,allowed])=>allowed===true).map(([name])=>name).sort(),npmrc=await readFile('.npmrc','utf8');
  if(JSON.stringify(approvedScripts)!==JSON.stringify(requiredScriptApprovals)||!/^strict-allow-scripts=true$/m.test(npmrc)||/^ignore-scripts=true$/m.test(npmrc))fail('Dependency install-script policy drift');
  if(codemeta.runtimePlatform!==`Node.js ${runtime.node}`)fail('CodeMeta runtimePlatform drift');
  console.log(JSON.stringify({platformContract:'PASS',repository:contract.repository,productionBranch:cf.productionBranch,pagesProject:cf.pagesProject,canonicalHost:contract.canonicalHost,planTier:cf.planTier,runtime,approvedInstallScripts:approvedScripts,codemetaRuntime:codemeta.runtimePlatform},null,2));
}

const command=process.argv[2]||'validate';
if(command==='export')await exportContract();
else if(command==='validate')await validateContract();
else throw new Error('Usage: node scripts/platform-contract.mjs <export|validate>');
