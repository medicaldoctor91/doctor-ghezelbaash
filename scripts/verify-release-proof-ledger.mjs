import {readFile} from 'node:fs/promises';
const [ledgerFile,sourceCommit]=process.argv.slice(2);
if(!ledgerFile||!/^[0-9a-f]{40}$/.test(sourceCommit||''))throw new Error('Usage: node scripts/verify-release-proof-ledger.mjs <ledger> <sourceCommit>');
const x=JSON.parse(await readFile(ledgerFile,'utf8'));
const release=JSON.parse(await readFile('src/data/release.json','utf8'));
const terminal=new Set(['ZENODO_PUBLISHED','PRODUCTION_PUBLISHED','HF_PUBLISHED','GITHUB_RELEASE_PUBLISHED','VERIFIED','COMPLETE']);
if(!terminal.has(x.stage)){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));const today=`${parts.year}-${parts.month}-${parts.day}`;if(release.dateModified!==today)throw new Error(`RELEASE_DATE_ROLLOVER_REQUIRED source=${release.dateModified} Tehran=${today}; keep DOI ${release.dataset?.zenodo?.versionDoi||''} and rebuild a new exact Candidate C`);}
if(x.candidateEpoch!==sourceCommit)throw new Error(`Ledger candidate epoch drift: ${x.candidateEpoch} != ${sourceCommit}`);
for(const stage of ['CANDIDATE_FROZEN','CANDIDATE_PROVEN','ZENODO_STAGED','PREVIEW_PROVEN','PERFORMANCE_PROVEN','GITHUB_RELEASE_DRAFT_READY']){
  const p=x.proofs?.[stage];if(!p||p.sourceCommit!==sourceCommit)throw new Error(`Missing exact-commit proof ${stage} for ${sourceCommit}`);
}
if(String(x.recordId||'')!==String(release.dataset?.zenodo?.recordId||'')||x.versionDoi!==release.dataset?.zenodo?.versionDoi||x.releaseDate!==release.dateModified)throw new Error('Ledger/source release identity drift');
console.log(JSON.stringify({releaseProofLedger:'PASS',sourceCommit,proofs:Object.keys(x.proofs||{}).length,recordId:String(x.recordId),versionDoi:x.versionDoi}));
