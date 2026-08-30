import path from 'node:path';
import {appendFile,readFile,writeFile} from 'node:fs/promises';
import {buildLiveReputationArtifacts} from './lib/live-reputation-artifacts.mjs';
import {composeChangedReputation,evaluateGoogleReputation} from './lib/reputation-observation.mjs';

async function refreshGoogle(placeFile='/tmp/place.json',volatileFile='src/data/volatile-facts.json',releaseFile='src/data/release.json'){
  const [place,current,release]=await Promise.all([
    readFile(placeFile,'utf8').then(JSON.parse),
    readFile(volatileFile,'utf8').then(JSON.parse),
    readFile(releaseFile,'utf8').then(JSON.parse),
  ]);
  const evaluation=evaluateGoogleReputation({place,current,expectedPlaceId:release.clinic.placeId});
  const checkedAt=process.env.GOOGLE_CHECKED_AT||new Date().toISOString();
  if(Number.isNaN(Date.parse(checkedAt)))throw new Error('Invalid Google poll checked timestamp');

  if(evaluation.changed){
    const next=composeChangedReputation({current,evaluation,observedAt:checkedAt,release});
    await writeFile(volatileFile,JSON.stringify(next,null,2)+'\n');
    console.log('GOOGLE_REPUTATION_CHANGED',evaluation.rating,evaluation.reviewCount,checkedAt);
  }else{
    console.log('GOOGLE_REPUTATION_UNCHANGED',evaluation.rating,evaluation.reviewCount);
  }

  if(process.env.GITHUB_OUTPUT){
    await appendFile(process.env.GITHUB_OUTPUT,[
      `changed=${evaluation.changed}`,
      `rating=${evaluation.rating}`,
      `review_count=${evaluation.reviewCount}`,
      `checked_at=${checkedAt}`,
      `place_id=${evaluation.placeId}`,
      '',
    ].join('\n'));
  }
  console.log(JSON.stringify({googleReputationPoll:'PASS',...evaluation,lastSuccessfullyCheckedAt:checkedAt,publicMutation:evaluation.changed},null,2));
}

async function synchronizeHuggingFace(directory='.release/huggingface'){
  const hub=path.resolve(directory);
  const [release,volatile]=await Promise.all([
    readFile('src/data/release.json','utf8').then(JSON.parse),
    readFile('src/data/volatile-facts.json','utf8').then(JSON.parse),
  ]);
  const {csv,attestation,attestationJson}=buildLiveReputationArtifacts(release,volatile);
  await Promise.all([
    writeFile(path.join(hub,'live_observations.csv'),csv),
    writeFile(path.join(hub,'live-observation-attestation.json'),attestationJson),
  ]);
  console.log(JSON.stringify({hfLiveObservationSynchronized:true,...attestation},null,2));
}

const [command,...args]=process.argv.slice(2);
switch(command){
  case 'google':
    await refreshGoogle(...args);
    break;
  case 'sync-hf':
    await synchronizeHuggingFace(...args);
    break;
  default:
    throw new Error('Usage: node scripts/reputation.mjs <google|sync-hf> [options]');
}
