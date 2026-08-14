import {readFile} from 'node:fs/promises';
const [ledgerFile,sourceCommit]=process.argv.slice(2);
if(!ledgerFile||!/^[0-9a-f]{40}$/.test(sourceCommit||''))throw new Error('Usage: node scripts/verify-release-proof-ledger.mjs <ledger> <sourceCommit>');
const x=JSON.parse(await readFile(ledgerFile,'utf8'));
if(x.candidateEpoch!==sourceCommit)throw new Error(`Ledger candidate epoch drift: ${x.candidateEpoch} != ${sourceCommit}`);
for(const stage of ['CANDIDATE_FROZEN','CANDIDATE_PROVEN','ZENODO_STAGED','PREVIEW_PROVEN','PERFORMANCE_PROVEN','GITHUB_RELEASE_DRAFT_READY']){
  const p=x.proofs?.[stage];if(!p||p.sourceCommit!==sourceCommit)throw new Error(`Missing exact-commit proof ${stage} for ${sourceCommit}`);
}
if(String(x.recordId||'')!=='21930954'||x.versionDoi!=='10.5281/zenodo.21930954')throw new Error('Ledger Zenodo identity drift');
console.log(JSON.stringify({releaseProofLedger:'PASS',sourceCommit,proofs:Object.keys(x.proofs||{}).length,recordId:String(x.recordId),versionDoi:x.versionDoi}));
