import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const hub=path.resolve(process.argv[2]||'.release/huggingface'),release=JSON.parse(await readFile('src/data/release.json','utf8')),volatile=JSON.parse(await readFile('src/data/volatile-facts.json','utf8')),sha=s=>createHash('sha256').update(s).digest('hex');
const rating=Number(volatile.rating),reviewCount=Number(volatile.reviewCount);if(!(rating>=1&&rating<=5)||!Number.isInteger(reviewCount)||reviewCount<0||volatile.placeId!==release.clinic.placeId||Number.isNaN(Date.parse(volatile.valueObservedAt)))throw new Error('Invalid live reputation source');
const csv=`entity,place_id,rating,userRatingCount,valueObservedAt,source,baseRelease\n"${release.clinic.id}","${release.clinic.placeId}",${rating},${reviewCount},"${volatile.valueObservedAt}","Google Places API (New)","${release.release}"\n`;
const attestation={schemaVersion:'1.0',baseRelease:release.release,entity:release.clinic.id,placeId:release.clinic.placeId,rating,reviewCount,valueObservedAt:volatile.valueObservedAt,source:'Google Places API (New)',canonicalObservationUrl:`${release.canonicalUrl}live-observations.jsonld`,csvSha256:sha(csv)};
await writeFile(path.join(hub,'live_observations.csv'),csv);await writeFile(path.join(hub,'live-observation-attestation.json'),JSON.stringify(attestation,null,2)+'\n');console.log(JSON.stringify({hfLiveObservationSynchronized:true,...attestation},null,2));
