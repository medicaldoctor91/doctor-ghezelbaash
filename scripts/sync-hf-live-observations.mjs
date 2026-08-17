import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {buildLiveReputationArtifacts} from './lib/live-reputation-artifacts.mjs';

const hub=path.resolve(process.argv[2]||'.release/huggingface');
const release=JSON.parse(await readFile('src/data/release.json','utf8'));
const volatile=JSON.parse(await readFile('src/data/volatile-facts.json','utf8'));
const {csv,attestation,attestationJson}=buildLiveReputationArtifacts(release,volatile);

await writeFile(path.join(hub,'live_observations.csv'),csv);
await writeFile(path.join(hub,'live-observation-attestation.json'),attestationJson);
console.log(JSON.stringify({hfLiveObservationSynchronized:true,...attestation},null,2));
