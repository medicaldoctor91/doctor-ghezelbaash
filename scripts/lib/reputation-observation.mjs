const finiteRating=v=>Number.isFinite(Number(v))&&Number(v)>=1&&Number(v)<=5;
const validCount=v=>Number.isInteger(Number(v))&&Number(v)>=0;

export function evaluateGoogleReputation({place,current,expectedPlaceId}){
  if(!place||typeof place!=='object')throw new Error('Google Place payload missing');
  if(!current||typeof current!=='object')throw new Error('Canonical volatile reputation source missing');
  if(place.id!==expectedPlaceId||current.placeId!==expectedPlaceId)throw new Error('Google Place identity drift');
  if(place.movedPlace||place.movedPlaceId)throw new Error('Google Place moved/merged: reconciliation required');
  if(place.businessStatus&&place.businessStatus!=='OPERATIONAL')throw new Error(`Google businessStatus changed: ${place.businessStatus}`);
  if(!finiteRating(place.rating)||!validCount(place.userRatingCount))throw new Error('Malformed Google reputation fields');
  const rating=Number(place.rating),reviewCount=Number(place.userRatingCount);
  return {placeId:expectedPlaceId,rating,reviewCount,changed:Number(current.rating)!==rating||Number(current.reviewCount)!==reviewCount};
}

export function composeChangedReputation({current,evaluation,observedAt,release}){
  if(!evaluation.changed)throw new Error('Refusing to compose unchanged reputation tuple');
  if(Number.isNaN(Date.parse(observedAt)))throw new Error('Invalid reputation observation timestamp');
  const source='Google Places API (New)';
  return {
    ...current,
    release:release.release,
    entity:release.clinic.id,
    placeId:evaluation.placeId,
    rating:evaluation.rating,
    reviewCount:evaluation.reviewCount,
    valueObservedAt:observedAt,
    source,
    facts:(current.facts||[]).map(f=>{
      if(f.property==='ratingValue')return {...f,entity:release.clinic.id,placeId:evaluation.placeId,value:evaluation.rating,observedAt,source};
      if(f.property==='reviewCount')return {...f,entity:release.clinic.id,placeId:evaluation.placeId,value:evaluation.reviewCount,observedAt,source};
      return f;
    })
  };
}
