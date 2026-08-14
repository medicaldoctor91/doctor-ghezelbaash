#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path

def read(path): return Path(path).read_text()
def write(path, text):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(text)

def replace_once(text, old, new, label):
    if new in text and old not in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one old pattern, found {count}")
    return text.replace(old, new, 1)

# 1) Runtime hygiene
p=Path(".gitignore"); s=p.read_text()
if ".release/huggingface/" not in s:
    s=s.rstrip()+"\n.release/huggingface/\n"
p.write_text(s)

# 2) Cloudflare branch contract + deployment recovery
p=Path("scripts/ensure-cloudflare-pages-git-deployment.mjs"); s=p.read_text()
s=replace_once(s,"preview_branch_excludes:['*']","preview_branch_excludes:[]","CF wildcard exclusion removal")
s=replace_once(
    s,
    "&&s.productionDeploymentsEnabled===true&&s.previewDeploymentSetting==='custom'&&s.previewBranchIncludes.length===1&&s.previewBranchIncludes[0]===previewBranch()&&s.buildCommand",
    "&&s.deploymentsEnabled===true&&s.productionDeploymentsEnabled===true&&s.previewDeploymentSetting==='custom'&&s.previewBranchIncludes.length===1&&s.previewBranchIncludes[0]===previewBranch()&&s.previewBranchExcludes.length===0&&s.buildCommand",
    "CF exact state validator"
)
s=replace_once(
    s,
    "assert.deepEqual(patch.source.config.preview_branch_includes,['staging/deploy']);assert.equal(patch.source.config.preview_deployment_setting,'custom');",
    "assert.deepEqual(patch.source.config.preview_branch_includes,['staging/deploy']);assert.deepEqual(patch.source.config.preview_branch_excludes,[]);assert.equal(patch.source.config.preview_deployment_setting,'custom');",
    "CF self-test excludes"
)
old="assert(d,`No ${expectedEnv} github:push deployment for ${commitHash}`);if(d.is_skipped)throw new Error(`Cloudflare deployment skipped: ${d.skip_reason||'unknown'}`);for(let attempt=1;attempt<=120;attempt++){"
new="assert(d,`No ${expectedEnv} github:push deployment for ${commitHash}`);if(d.is_skipped||['failure','canceled'].includes(statusOf(d))){console.log(`CF_DEPLOYMENT_RETRY_REQUEST id=${d.id} env=${expectedEnv} commit=${commitHash} prior=${d.is_skipped?'skipped:'+String(d.skip_reason||'unknown'):statusOf(d)}`);d=await req(`${base}/deployments/${encodeURIComponent(d.id)}/retry`,{method:'POST',body:{}});assert(d?.id,'Cloudflare retry did not return a deployment')}for(let attempt=1;attempt<=120;attempt++){"
s=replace_once(s,old,new,"CF deployment retry")
p.write_text(s)

# 3) Durable ledger with commit-bound proofs, while keeping legacy `stage` compatibility
updater = """import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const [file,stage,...pairs]=process.argv.slice(2);if(!file||!stage)throw new Error('Usage: node scripts/update-release-control.mjs <file> <stage> [key=value...]');
let current={};try{current=JSON.parse(await readFile(file,'utf8'))}catch{}
const patch={};for(const pair of pairs){const i=pair.indexOf('=');if(i<1)throw new Error(`Invalid ledger pair ${pair}`);const k=pair.slice(0,i),raw=pair.slice(i+1);patch[k]=/^(true|false)$/.test(raw)?raw==='true':/^\\d+$/.test(raw)?raw:raw}
const now=new Date().toISOString();
const rank={PREFLIGHT_STARTED:10,PREFLIGHTED:20,REPUTATION_FROZEN:30,DOI_RESERVED:40,CANDIDATE_FROZEN:50,CANDIDATE_PROVEN:60,ZENODO_STAGED:70,PREVIEW_PROVEN:80,PERFORMANCE_PROVEN:90,GITHUB_RELEASE_DRAFT_READY:100,IRREVERSIBLE_GATE_PASS:110,ZENODO_PUBLISHED:120,PRODUCTION_PUBLISHED:130,HF_PUBLISHED:140,GITHUB_RELEASE_PUBLISHED:150,SOURCE_PUBLISHED:160,VERIFIED:170,COMPLETE:180};
const commitBound=new Set(['CANDIDATE_FROZEN','CANDIDATE_PROVEN','ZENODO_STAGED','PREVIEW_PROVEN','PERFORMANCE_PROVEN','GITHUB_RELEASE_DRAFT_READY','IRREVERSIBLE_GATE_PASS','ZENODO_PUBLISHED','PRODUCTION_PUBLISHED','HF_PUBLISHED','GITHUB_RELEASE_PUBLISHED','SOURCE_PUBLISHED','VERIFIED','COMPLETE']);
let proofs={...(current.proofs||{})};
let highestStage=current.highestStage||current.stage||null;
if(stage==='CANDIDATE_FROZEN'&&patch.sourceCommit&&current.candidateEpoch&&current.candidateEpoch!==patch.sourceCommit){proofs={};highestStage=null}
if(stage==='CANDIDATE_FROZEN'&&patch.sourceCommit&&!current.candidateEpoch){proofs={};highestStage=null}
if(commitBound.has(stage)){
  if(!/^[0-9a-f]{40}$/.test(String(patch.sourceCommit||'')))throw new Error(`${stage} requires exact sourceCommit`);
  proofs[stage]={at:now,...patch,sourceCommit:String(patch.sourceCommit)};
}
if((rank[stage]||0)>=(rank[highestStage]||0))highestStage=stage;
const next={...current,...patch,stage,lastEvent:stage,highestStage,updatedAt:now,proofs};
if(stage==='CANDIDATE_FROZEN'&&patch.sourceCommit)next.candidateEpoch=String(patch.sourceCommit);
next.history=[...(current.history||[]),{stage,at:now,...patch}];
await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(next,null,2)+'\\n');console.log(JSON.stringify(next,null,2));
"""
write("scripts/update-release-control.mjs",updater)

proofver = """import {readFile} from 'node:fs/promises';
const [ledgerFile,sourceCommit]=process.argv.slice(2);
if(!ledgerFile||!/^[0-9a-f]{40}$/.test(sourceCommit||''))throw new Error('Usage: node scripts/verify-release-proof-ledger.mjs <ledger> <sourceCommit>');
const x=JSON.parse(await readFile(ledgerFile,'utf8'));
if(x.candidateEpoch!==sourceCommit)throw new Error(`Ledger candidate epoch drift: ${x.candidateEpoch} != ${sourceCommit}`);
for(const stage of ['CANDIDATE_FROZEN','CANDIDATE_PROVEN','ZENODO_STAGED','PREVIEW_PROVEN','PERFORMANCE_PROVEN','GITHUB_RELEASE_DRAFT_READY']){
  const p=x.proofs?.[stage];if(!p||p.sourceCommit!==sourceCommit)throw new Error(`Missing exact-commit proof ${stage} for ${sourceCommit}`);
}
if(String(x.recordId||'')!=='21930954'||x.versionDoi!=='10.5281/zenodo.21930954')throw new Error('Ledger Zenodo identity drift');
console.log(JSON.stringify({releaseProofLedger:'PASS',sourceCommit,proofs:Object.keys(x.proofs||{}).length,recordId:String(x.recordId),versionDoi:x.versionDoi}));
"""
write("scripts/verify-release-proof-ledger.mjs",proofver)

# 4) Bind Zenodo draft/stage/publish to the exact frozen source commit and make post-publish retries idempotent
p=Path("scripts/zenodo_release.py"); s=p.read_text()
s=replace_once(
    s,
    "def stage(args,token):\n    release=load_release(); z=release['dataset']['zenodo']; record=str(z['recordId']); doi=z['versionDoi']\n",
    "def stage(args,token):\n    release=load_release(); z=release['dataset']['zenodo']; record=str(z['recordId']); doi=z['versionDoi']; source_commit=os.environ.get('SOURCE_COMMIT','').strip()\n    if len(source_commit)!=40 or any(c not in '0123456789abcdef' for c in source_commit): raise RuntimeError('SOURCE_COMMIT must bind Zenodo stage to exact Candidate C')\n",
    "Zenodo stage source commit"
)
s=replace_once(
    s,
    "    draft_url=f'{BASE}/deposit/depositions/{record}'; draft=call(token,'GET',draft_url)\n    if draft.get('submitted') is True: raise RuntimeError('Cannot stage an already-published draft')\n",
    "    draft_url=f'{BASE}/deposit/depositions/{record}'; draft=call(token,'GET',draft_url)\n    if draft.get('submitted') is True:\n        sources=exact_sources(); hashes={name:sha256(file) for name,file in sources.items()}; att=RUNTIME/'release-attestation.json'\n        if not att.exists() or json.loads(att.read_text()).get('sourceCommit')!=source_commit: raise RuntimeError('Release attestation is not bound to SOURCE_COMMIT before Zenodo public retry proof')\n        verified=verify_public_record(token,record,doi,release['release'],z['conceptDoi'],hashes)\n        state={'stage':'ZENODO_STAGED','release':release['release'],'recordId':record,'versionDoi':doi,'conceptDoi':z['conceptDoi'],'sourceCommit':source_commit,'files':len(sources),'sha256':hashes,'remoteSha256':dict(hashes),'alreadyPublished':True,'publicIntegrity':verified.get('integrity')}\n        write_state('zenodo-stage.json',state); print(json.dumps({k:v for k,v in state.items() if k not in ('sha256','remoteSha256')},separators=(',',':'))); return\n",
    "Zenodo stage idempotent public readback"
)
s=replace_once(
    s,
    "    sources=exact_sources(); hashes={}\n",
    "    sources=exact_sources(); att=RUNTIME/'release-attestation.json'\n    if not att.exists() or json.loads(att.read_text()).get('sourceCommit')!=source_commit: raise RuntimeError('Release attestation is not bound to SOURCE_COMMIT before Zenodo stage')\n    hashes={}\n",
    "Zenodo stage attestation binding"
)
s=replace_once(
    s,
    "    state={'stage':'ZENODO_STAGED','release':release['release'],'recordId':record,'versionDoi':doi,'conceptDoi':z['conceptDoi'],'files':len(sources),'sha256':hashes,'remoteSha256':remote_hashes}\n",
    "    state={'stage':'ZENODO_STAGED','release':release['release'],'recordId':record,'versionDoi':doi,'conceptDoi':z['conceptDoi'],'sourceCommit':source_commit,'files':len(sources),'sha256':hashes,'remoteSha256':remote_hashes}\n",
    "Zenodo stage ledger source commit"
)
s=replace_once(
    s,
    "def publish(args,token):\n    release=load_release(); z=release['dataset']['zenodo']; record=str(z['recordId']); doi=z['versionDoi']; draft_url=f'{BASE}/deposit/depositions/{record}'\n    staged=json.loads((RUNTIME/'zenodo-stage.json').read_text())\n    if staged.get('recordId')!=record or staged.get('versionDoi')!=doi or staged.get('release')!=release['release']: raise RuntimeError('Zenodo stage ledger mismatch')\n",
    "def publish(args,token):\n    release=load_release(); z=release['dataset']['zenodo']; record=str(z['recordId']); doi=z['versionDoi']; draft_url=f'{BASE}/deposit/depositions/{record}'; source_commit=os.environ.get('SOURCE_COMMIT','').strip()\n    staged=json.loads((RUNTIME/'zenodo-stage.json').read_text())\n    if staged.get('recordId')!=record or staged.get('versionDoi')!=doi or staged.get('release')!=release['release'] or staged.get('sourceCommit')!=source_commit: raise RuntimeError('Zenodo stage ledger mismatch or stale Candidate C binding')\n",
    "Zenodo publish source commit"
)
s=replace_once(
    s,
    "    if draft.get('submitted') is True: raise RuntimeError('Zenodo draft unexpectedly already published')\n    if prere.get('doi')!=doi or md.get('version')!=release['release']: raise RuntimeError('Zenodo identity drift before publish')\n",
    "    if draft.get('submitted') is True:\n        state=verify_public_record(token,record,doi,release['release'],z['conceptDoi'],staged['sha256']); state['idempotentAlreadyPublished']=True; state['sourceCommit']=source_commit\n        write_state('zenodo-published.json',state); print(json.dumps(state,separators=(',',':'))); return\n    if prere.get('doi')!=doi or md.get('version')!=release['release']: raise RuntimeError('Zenodo identity drift before publish')\n",
    "Zenodo publish idempotency"
)
p.write_text(s)

# 5) Atomic workflow: deterministic Step 12, full Cloudflare contract, safe ordering, proof ledger, idempotent HF tag.
p=Path(".github/workflows/ceiling-release.yml"); s=p.read_text()
s=replace_once(
    s,
    "const p=require('/tmp/cf.json');const r=p.result,c=r.source?.config||{};if(!p.success||r.production_branch!=='production/deploy'||c.preview_deployment_setting!=='custom'||c.preview_branch_includes?.[0]!=='staging/deploy')throw Error('Cloudflare production isolation drift');console.log('CLOUDFLARE_PREFLIGHT_PASS')",
    "const p=require('/tmp/cf.json');const r=p.result,c=r.source?.config||{};const inc=c.preview_branch_includes||[],exc=c.preview_branch_excludes||[];if(!p.success||r.production_branch!=='production/deploy'||c.deployments_enabled!==true||c.production_deployments_enabled!==true||c.preview_deployment_setting!=='custom'||inc.length!==1||inc[0]!=='staging/deploy'||exc.length!==0)throw Error('Cloudflare production/preview isolation drift');console.log('CLOUDFLARE_PREFLIGHT_PASS')",
    "Atomic CF preflight exact arrays"
)
s=replace_once(
    s,
    "          rm -rf /tmp/v122-repro\n          git worktree add --detach /tmp/v122-repro \"$SOURCE_COMMIT\"\n          (cd /tmp/v122-repro && npm ci --ignore-scripts && unset SOURCE_DATE_EPOCH SOURCE_COMMIT GITHUB_SHA || true && export CF_PAGES_COMMIT_SHA=\"$SOURCE_COMMIT\" && mkdir -p .release/runtime .release/huggingface && printf 'native-runtime-noise\\n' > .release/runtime/repro-noise.txt && printf 'native-hf-noise\\n' > .release/huggingface/repro-noise.txt && npm run release && node scripts/validate-visible-freeze.mjs dist/index.html && python - <<'PY'\n",
    "          REPRO_SHA=\"$SOURCE_COMMIT\"\n          REPRO_EPOCH=\"$SOURCE_DATE_EPOCH\"\n          export REPRO_SHA REPRO_EPOCH\n          rm -rf /tmp/v122-repro\n          git worktree add --detach /tmp/v122-repro \"$REPRO_SHA\"\n          (cd /tmp/v122-repro && npm ci --ignore-scripts && unset GITHUB_SHA || true && export SOURCE_COMMIT=\"$REPRO_SHA\" CF_PAGES_COMMIT_SHA=\"$REPRO_SHA\" SOURCE_DATE_EPOCH=\"$REPRO_EPOCH\" && mkdir -p .release/runtime .release/huggingface && printf 'native-runtime-noise\\n' > .release/runtime/repro-noise.txt && printf 'native-hf-noise\\n' > .release/huggingface/repro-noise.txt && npm run release && node scripts/validate-visible-freeze.mjs dist/index.html && python - <<'PY'\n",
    "Atomic Step12 canonical env"
)
s=replace_once(
    s,
    "          git push origin \"$SOURCE_COMMIT\":staging/deploy\n          node scripts/ensure-cloudflare-pages-git-deployment.mjs --verify-config\n          node scripts/ensure-cloudflare-pages-git-deployment.mjs\n",
    "          node scripts/ensure-cloudflare-pages-git-deployment.mjs --configure\n          node scripts/ensure-cloudflare-pages-git-deployment.mjs --verify-config\n          git push origin \"$SOURCE_COMMIT\":staging/deploy\n          node scripts/ensure-cloudflare-pages-git-deployment.mjs\n",
    "Atomic preview config-before-push"
)
s=replace_once(
    s,
    "          git push origin \"$SOURCE_COMMIT\":production/deploy\n          node scripts/ensure-cloudflare-pages-git-deployment.mjs --verify-config\n          node scripts/ensure-cloudflare-pages-git-deployment.mjs\n",
    "          node scripts/ensure-cloudflare-pages-git-deployment.mjs --configure\n          node scripts/ensure-cloudflare-pages-git-deployment.mjs --verify-config\n          git push origin \"$SOURCE_COMMIT\":production/deploy\n          node scripts/ensure-cloudflare-pages-git-deployment.mjs\n",
    "Atomic production config-before-push"
)
s=replace_once(
    s,
    "          done\n      - name: Prepare non-public GitHub Release draft against exact Candidate C\n",
    "          done\n          node scripts/update-release-control.mjs \"$LEDGER\" PERFORMANCE_PROVEN sourceCommit=$SOURCE_COMMIT lighthouseViewports=6\n          git -C /tmp/v122-control add .release/control/v1.2.2.json && git -C /tmp/v122-control commit -m 'Prove six-viewport v1.2.2 performance gate' && git -C /tmp/v122-control push origin HEAD:$CONTROL_BRANCH\n      - name: Prepare non-public GitHub Release draft against exact Candidate C\n",
    "Atomic performance proof"
)
s=replace_once(
    s,
    "          node scripts/validate-visible-freeze.mjs dist/index.html\n          test \"$(git rev-parse HEAD)\" = \"$SOURCE_COMMIT\"\n          test -z \"$(git status --porcelain)\"\n          node scripts/update-release-control.mjs \"$LEDGER\" IRREVERSIBLE_GATE_PASS sourceCommit=$SOURCE_COMMIT\n",
    "          node scripts/validate-visible-freeze.mjs dist/index.html\n          test \"$(git rev-parse HEAD)\" = \"$SOURCE_COMMIT\"\n          test -z \"$(git status --porcelain)\"\n          node scripts/verify-release-proof-ledger.mjs \"$LEDGER\" \"$SOURCE_COMMIT\"\n          node scripts/update-release-control.mjs \"$LEDGER\" IRREVERSIBLE_GATE_PASS sourceCommit=$SOURCE_COMMIT\n",
    "Atomic exact proof ledger gate"
)
s=replace_once(
    s,
    "          git -C .release/huggingface push origin HEAD:main\n          git -C .release/huggingface tag -f -a v1.2.2 -m 'Dr. Saeed Ghezelbash Public Knowledge Graph v1.2.2' \"$HF_SHA\"\n          git -C .release/huggingface push origin refs/tags/v1.2.2 --force\n",
    "          git -C .release/huggingface push origin HEAD:main\n          HF_TAG_OBJ=$(git -C .release/huggingface ls-remote origin refs/tags/v1.2.2 | awk '{print $1}')\n          if [ -z \"$HF_TAG_OBJ\" ]; then\n            git -C .release/huggingface tag -a v1.2.2 -m 'Dr. Saeed Ghezelbash Public Knowledge Graph v1.2.2' \"$HF_SHA\"\n            git -C .release/huggingface push origin refs/tags/v1.2.2\n          else\n            HF_TAG_PEELED=$(git -C .release/huggingface ls-remote origin 'refs/tags/v1.2.2^{}' | awk '{print $1}')\n            test \"${HF_TAG_PEELED:-$HF_TAG_OBJ}\" = \"$HF_SHA\"\n          fi\n          test \"$(git -C .release/huggingface ls-remote origin refs/heads/main | awk '{print $1}')\" = \"$HF_SHA\"\n",
    "Atomic immutable HF tag"
)
s=replace_once(
    s,
    "const r=require('/tmp/reserved.json'),e=require('./.release/runtime/zenodo-reservation.json');const doi=r.metadata?.prereserve_doi?.doi||r.doi;if(String(r.id)!==String(e.recordId)||doi!==e.versionDoi||r.submitted===true)throw Error('Persisted Zenodo reservation drift')",
    "const r=require('/tmp/reserved.json'),e=require('./.release/runtime/zenodo-reservation.json');const doi=r.metadata?.prereserve_doi?.doi||r.doi;if(String(r.id)!==String(e.recordId)||doi!==e.versionDoi)throw Error('Persisted Zenodo reservation drift');if(r.submitted===true&&String(r.metadata?.version||'').replace(/^v/,'')!=='1.2.2')throw Error('Persisted published Zenodo version drift');console.log(r.submitted===true?'ZENODO_RESERVATION_ALREADY_PUBLISHED_EXACT':'ZENODO_RESERVATION_DRAFT_EXACT')",
    "Atomic persisted Zenodo idempotency"
)
s=s.replace(
    '          test -z "$(git ls-remote --tags origin refs/tags/v1.2.2)"\n',
    '          REMOTE_GH_TAG=$(git ls-remote --tags origin refs/tags/v1.2.2 | awk \'{print $1}\')\n          if [ -n "$REMOTE_GH_TAG" ]; then git fetch origin refs/tags/v1.2.2:refs/tags/v1.2.2; test "$(git rev-list -n1 v1.2.2)" = "$SOURCE_COMMIT"; fi\n'
)
s=replace_once(s,"          npm run release:prepare\n","          node scripts/validate-release-controller.mjs\n          npm run release:prepare\n","Atomic controller self-validation")
p.write_text(s)

# 6) Finalizer: annotated HF tag must be peeled to its commit.
p=Path(".github/workflows/v122-release-finalizer.yml"); s=p.read_text()
s=replace_once(
    s,
    "          HF_TAG=$(git ls-remote \"https://huggingface.co/datasets/$HF_REPO\" refs/tags/v1.2.2 | awk '{print $1}')\n          test -n \"$HF_TAG\"\n          test \"$HF_TAG\" = \"$HF_RELEASE_SHA\"\n",
    "          HF_TAG_OBJ=$(git ls-remote \"https://huggingface.co/datasets/$HF_REPO\" refs/tags/v1.2.2 | awk '{print $1}')\n          HF_TAG_PEELED=$(git ls-remote \"https://huggingface.co/datasets/$HF_REPO\" 'refs/tags/v1.2.2^{}' | awk '{print $1}')\n          test -n \"$HF_TAG_OBJ\"\n          test \"${HF_TAG_PEELED:-$HF_TAG_OBJ}\" = \"$HF_RELEASE_SHA\"\n",
    "Finalizer annotated HF tag peel"
)
p.write_text(s)

# 7) Permanent trigger binder: makes the main release request commit an ancestor of Candidate C
binder = """name: Bind v1.2.2 release trigger to candidate

on:
  push:
    branches: [main]
    paths: [.release/release-request-v1.2.2.json]

permissions:
  contents: write

concurrency:
  group: v122-release-trigger-binding
  cancel-in-progress: false

jobs:
  bind:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          ref: release/v1.2.2-candidate
          fetch-depth: 0
          persist-credentials: true
      - name: Bind exact triggering main commit without changing candidate content
        shell: bash
        run: |
          set -euo pipefail
          git config user.name ghezelbaash-release-trigger-binder
          git config user.email actions@users.noreply.github.com
          git fetch origin main release/v1.2.2-candidate
          git reset --hard origin/release/v1.2.2-candidate
          git show "$GITHUB_SHA:.release/release-request-v1.2.2.json" > .release/release-request-v1.2.2.json
          git add .release/release-request-v1.2.2.json
          git diff --cached --quiet || git commit -m "Synchronize v1.2.2 release request $GITHUB_SHA"
          if ! git merge-base --is-ancestor "$GITHUB_SHA" HEAD; then
            git merge -s ours --no-edit "$GITHUB_SHA" -m "Bind v1.2.2 trigger $GITHUB_SHA to candidate"
          fi
          test "$(git show "$GITHUB_SHA:.release/release-request-v1.2.2.json")" = "$(cat .release/release-request-v1.2.2.json)"
          git push origin HEAD:release/v1.2.2-candidate
          echo "V122_TRIGGER_BOUND trigger=$GITHUB_SHA candidate=$(git rev-parse HEAD)"
"""
write(".github/workflows/v122-release-trigger-binder.yml",binder)

# 8) Controller-of-controller validator
validator = r"""import {readFile} from 'node:fs/promises';
const f=async p=>readFile(p,'utf8'),w=await f('.github/workflows/ceiling-release.yml'),cf=await f('scripts/ensure-cloudflare-pages-git-deployment.mjs'),z=await f('scripts/zenodo_release.py'),fin=await f('.github/workflows/v122-release-finalizer.yml'),gi=await f('.gitignore');
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};
must(!w.includes('unset SOURCE_DATE_EPOCH SOURCE_COMMIT GITHUB_SHA'),'Step12 still destroys canonical commit input');
must(w.includes('REPRO_SHA="$SOURCE_COMMIT"')&&w.includes('SOURCE_COMMIT="$REPRO_SHA" CF_PAGES_COMMIT_SHA="$REPRO_SHA" SOURCE_DATE_EPOCH="$REPRO_EPOCH"'),'Step12 canonical build input binding missing');
must(cf.includes('preview_branch_excludes:[]')&&cf.includes('s.previewBranchExcludes.length===0'),'Cloudflare wildcard preview exclusion remains');
const preview=w.indexOf('git push origin "$SOURCE_COMMIT":staging/deploy'),configure=w.lastIndexOf('node scripts/ensure-cloudflare-pages-git-deployment.mjs --configure',preview);
must(preview>0&&configure>0&&configure<preview,'Cloudflare Preview config is not proven before branch push');
must(!w.includes('tag -f -a v1.2.2')&&!w.includes('push origin refs/tags/v1.2.2 --force'),'Mutable HF release-tag path remains');
must(fin.includes("'refs/tags/v1.2.2^{}'"),'Finalizer does not peel annotated HF tag');
must(gi.split(/\r?\n/).includes('.release/huggingface/'),'HF runtime clone is not ignored');
must(z.includes("'sourceCommit':source_commit")&&z.includes("staged.get('sourceCommit')!=source_commit"),'Zenodo stage/publish is not bound to Candidate C');
must(w.includes('PERFORMANCE_PROVEN sourceCommit=$SOURCE_COMMIT'),'Performance proof is not durable');
must(w.includes('verify-release-proof-ledger.mjs "$LEDGER" "$SOURCE_COMMIT"'),'Irreversible gate lacks exact-commit proof ledger');
console.log(JSON.stringify({releaseControllerHardening:'PASS',step12:'canonical-input-bound',cloudflare:'include-only-preview',zenodo:'source-commit-bound-idempotent',hfTag:'immutable-peeled',ledger:'commit-bound-proofs',runtimeHygiene:'PASS'}));
"""
write("scripts/validate-release-controller.mjs",validator)

final_copy=Path(".release/control-plane/ceiling-release.v1.2.2.final.yml.txt")
if final_copy.exists(): final_copy.write_text(Path(".github/workflows/ceiling-release.yml").read_text())

req=Path(".release/release-request-v1.2.2.json")
if req.exists():
    r=req.read_text().replace('"mode": "maximum-integrated-two-phase"','"mode": "maximum-integrated-three-phase"')
    req.write_text(r)

print("V122_CONTROLLER_HARDENING_PATCH_APPLIED")
