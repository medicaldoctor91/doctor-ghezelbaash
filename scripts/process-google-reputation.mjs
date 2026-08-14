import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {evaluateGoogleReputation,composeChangedReputation} from './lib/reputation-observation.mjs';

const placeFile=process.argv[2]||'/tmp/place.json';
const volatileFile=process.argv[3]||'src/data/volatile-facts.json';
const releaseFile=process.argv[4]||'src/data/release.json';
const [place,current,release]=await Promise.all([
  readFile(placeFile,'utf8').then(JSON.parse),
  readFile(volatileFile,'utf8').then(JSON.parse),
  readFile(releaseFile,'utf8').then(JSON.parse)
]);
const expectedPlaceId=release.clinic.placeId;
const evaluation=evaluateGoogleReputation({place,current,expectedPlaceId});
const checkedAt=process.env.GOOGLE_CHECKED_AT||new Date().toISOString();
if(Number.isNaN(Date.parse(checkedAt)))throw new Error('Invalid Google poll checked timestamp');
if(evaluation.changed){
  const next=composeChangedReputation({current,evaluation,observedAt:checkedAt,release});
  await writeFile(volatileFile,JSON.stringify(next,null,2)+'\n');
  console.log('GOOGLE_REPUTATION_CHANGED',evaluation.rating,evaluation.reviewCount,checkedAt);
}else console.log('GOOGLE_REPUTATION_UNCHANGED',evaluation.rating,evaluation.reviewCount);
const output=process.env.GITHUB_OUTPUT;
if(output)await appendFile(output,`changed=${evaluation.changed}\nrating=${evaluation.rating}\nreview_count=${evaluation.reviewCount}\nchecked_at=${checkedAt}\nplace_id=${evaluation.placeId}\n`);
console.log(JSON.stringify({googleReputationPoll:'PASS',...evaluation,lastSuccessfullyCheckedAt:checkedAt,publicMutation:evaluation.changed},null,2));
