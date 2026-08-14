import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const [file,stage,...pairs]=process.argv.slice(2);if(!file||!stage)throw new Error('Usage: node scripts/update-release-control.mjs <file> <stage> [key=value...]');
let current={};try{current=JSON.parse(await readFile(file,'utf8'))}catch{}
const patch={};for(const pair of pairs){const i=pair.indexOf('=');if(i<1)throw new Error(`Invalid ledger pair ${pair}`);const k=pair.slice(0,i),raw=pair.slice(i+1);patch[k]=/^(true|false)$/.test(raw)?raw==='true':/^\d+$/.test(raw)?raw:raw}
const now=new Date().toISOString();
if(stage==='PREFLIGHT_STARTED'){
  const sourceRelease=JSON.parse(await readFile('src/data/release.json','utf8'));
  if(patch.targetVersion&&patch.targetVersion!==sourceRelease.release)throw new Error(`PREFLIGHT targetVersion/source drift ${patch.targetVersion} != ${sourceRelease.release}`);
  patch.releaseDate=sourceRelease.dateModified;
}

const rank={SOURCE_PROMOTED:5,PREFLIGHT_STARTED:10,PREFLIGHTED:20,REPUTATION_FROZEN:30,DOI_RESERVED:40,CANDIDATE_FROZEN:50,CANDIDATE_PROVEN:60,ZENODO_STAGED:70,PREVIEW_PROVEN:80,PERFORMANCE_PROVEN:90,GITHUB_RELEASE_DRAFT_READY:100,IRREVERSIBLE_GATE_PASS:110,ZENODO_PUBLISHED:120,PRODUCTION_PUBLISHED:130,HF_PUBLISHED:140,GITHUB_RELEASE_PUBLISHED:150,SOURCE_PUBLISHED:160,VERIFIED:170,COMPLETE:180};
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
await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(next,null,2)+'\n');console.log(JSON.stringify(next,null,2));
