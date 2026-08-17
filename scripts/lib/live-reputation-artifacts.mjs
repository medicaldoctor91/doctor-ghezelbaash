import {createHash} from 'node:crypto';

const sha256=value=>createHash('sha256').update(value).digest('hex');

export const huggingFaceDatasetRepo=release=>{
  const url=release?.dataset?.huggingFace?.dataset||'';
  const prefix='https://huggingface.co/datasets/';
  if(!url.startsWith(prefix)||url.length<=prefix.length)throw new Error('Invalid Hugging Face dataset URL in release contract');
  return url.slice(prefix.length).replace(/\/$/,'');
};

export const buildLiveReputationArtifacts=(release,volatile)=>{
  const rating=Number(volatile?.rating),reviewCount=Number(volatile?.reviewCount),observedAt=volatile?.valueObservedAt;
  if(!(rating>=1&&rating<=5)||!Number.isInteger(reviewCount)||reviewCount<0||volatile?.placeId!==release?.clinic?.placeId||Number.isNaN(Date.parse(observedAt||'')))throw new Error('Invalid live reputation source');
  const csv=`entity,place_id,rating,userRatingCount,valueObservedAt,source,baseRelease\n"${release.clinic.id}","${release.clinic.placeId}",${rating},${reviewCount},"${observedAt}","Google Places API (New)","${release.release}"\n`;
  const attestation={schemaVersion:'1.0',baseRelease:release.release,entity:release.clinic.id,placeId:release.clinic.placeId,rating,reviewCount,valueObservedAt:observedAt,source:'Google Places API (New)',canonicalObservationUrl:`${release.canonicalUrl}live-observations.jsonld`,csvSha256:sha256(csv)};
  return {rating,reviewCount,observedAt,csv,attestation,attestationJson:JSON.stringify(attestation,null,2)+'\n'};
};
