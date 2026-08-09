import path from 'node:path';
import {readFile} from 'node:fs/promises';
const root=process.cwd();
const data=path.join(root,'src/data');
const release=JSON.parse(await readFile(path.join(data,'release.json'),'utf8'));
const inv=JSON.parse(await readFile(path.join(data,'release-invariants.json'),'utf8'));
const snapshot=JSON.parse(await readFile(path.join(data,'evidence-snapshot.json'),'utf8'));
const registry=JSON.parse(await readFile(path.join(data,'evidence-registry.json'),'utf8'));
const volatile=JSON.parse(await readFile(path.join(data,'volatile-facts.json'),'utf8'));
const fail=m=>{throw new Error(m)};
if(snapshot.release!==release.release||registry.release!==release.release||volatile.release!==release.release)fail('Evidence/volatile release drift');
const d0=new Date(`${snapshot.observedAt}T00:00:00Z`),d1=new Date(`${release.dateModified}T00:00:00Z`);const age=(d1-d0)/86400000;
if(age<0||age>inv.evidenceSnapshotMaxAgeDays)fail(`Evidence snapshot age ${age}d exceeds ${inv.evidenceSnapshotMaxAgeDays}`);
const tierA=registry.evidence.filter(x=>x.tier==='A');if(tierA.length<8)fail('Tier-A evidence registry unexpectedly sparse');
for(const e of tierA){if(!/^https:\/\//.test(e.url)||!e.verifiedAt||!e.liveStatus)fail(`Invalid Tier-A evidence ${e.id}`);if(!snapshot.entries.some(x=>x.id===e.id))fail(`Tier-A evidence absent from snapshot ${e.id}`)}
const rating=volatile.facts.find(x=>x.property==='ratingValue'),reviews=volatile.facts.find(x=>x.property==='reviewCount');if(rating?.value!==5||reviews?.value!==164)fail('Verified Google Maps reputation snapshot drift');
if(rating.placeId!==release.clinic.placeId||reviews.placeId!==release.clinic.placeId)fail('Volatile fact Place ID drift');
console.log(JSON.stringify({valid:true,release:release.release,tierAEvidence:tierA.length,snapshotEntries:snapshot.entries.length,volatileFacts:volatile.facts.length,observedAt:snapshot.observedAt},null,2));
