import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateGoogleReputation,composeChangedReputation} from './lib/reputation-observation.mjs';

const [release,current]=await Promise.all([
  readFile('src/data/release.json','utf8').then(JSON.parse),
  readFile('src/data/volatile-facts.json','utf8').then(JSON.parse)
]);
const expectedPlaceId=release.clinic.placeId;
const unchangedPlace={id:expectedPlaceId,rating:current.rating,userRatingCount:current.reviewCount,businessStatus:'OPERATIONAL'};
const unchanged=evaluateGoogleReputation({place:unchangedPlace,current,expectedPlaceId});
assert.equal(unchanged.changed,false);
assert.equal(JSON.stringify(current),JSON.stringify(JSON.parse(await readFile('src/data/volatile-facts.json','utf8'))),'Unchanged fixture mutated canonical volatile source');

const changedPlace={...unchangedPlace,userRatingCount:Number(current.reviewCount)+1};
const changed=evaluateGoogleReputation({place:changedPlace,current,expectedPlaceId});
assert.equal(changed.changed,true);
const observedAt='2026-08-14T12:34:56.000Z';
const next=composeChangedReputation({current,evaluation:changed,observedAt,release});
assert.equal(next.reviewCount,Number(current.reviewCount)+1);
assert.equal(next.rating,Number(current.rating));
assert.equal(next.valueObservedAt,observedAt);
assert.equal(next.release,release.release);
assert.equal(next.entity,release.clinic.id);
assert.equal(next.placeId,expectedPlaceId);
assert.equal(next.facts.find(x=>x.property==='ratingValue')?.entity,release.clinic.id);
assert.equal(next.facts.find(x=>x.property==='reviewCount')?.value,Number(current.reviewCount)+1);
assert.equal(current.valueObservedAt,(JSON.parse(await readFile('src/data/volatile-facts.json','utf8'))).valueObservedAt,'Synthetic changed fixture leaked into canonical source');

assert.throws(()=>evaluateGoogleReputation({place:{...unchangedPlace,id:'wrong-place'},current,expectedPlaceId}),/identity drift/);
assert.throws(()=>evaluateGoogleReputation({place:{...unchangedPlace,movedPlace:'places/new'},current,expectedPlaceId}),/moved\/merged/);
assert.throws(()=>evaluateGoogleReputation({place:{...unchangedPlace,rating:null},current,expectedPlaceId}),/Malformed/);
assert.throws(()=>evaluateGoogleReputation({place:{...unchangedPlace,businessStatus:'CLOSED_PERMANENTLY'},current,expectedPlaceId}),/businessStatus/);
assert.throws(()=>composeChangedReputation({current,evaluation:unchanged,observedAt,release}),/unchanged/);
console.log(JSON.stringify({reputationObservationFixtures:'PASS',unchangedNoMutation:true,syntheticChanged:true,wrongPlaceAbort:true,movedAbort:true,malformedAbort:true,clinicTarget:release.clinic.id}));
