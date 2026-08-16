import {createHash} from 'node:crypto';

export function deriveIdentityFingerprint(release){
  const person=release?.primaryEntity||{};
  const clinic=release?.clinic||{};
  const dataset=release?.dataset||{};
  return {
    canonicalName:person.name,
    wikidata:person.wikidata,
    googleKnowledgeGraphId:person.googleKnowledgeGraphId,
    irimc:person.irimc,
    orcid:person.orcid,
    openAlex:person.openAlex,
    semanticScholar:person.semanticScholar,
    googleScholar:person.googleScholar,
    clinic:{
      wikidata:dataset.supportingClinicWikidata,
      googleLocalKgmid:clinic.googleLocalKgmid,
      placeId:clinic.placeId,
      cid:clinic.cid,
      postalCode:clinic.postalCode
    },
    verifiedWebIdentityMesh:[...(person.verifiedWebIdentityMesh||[])]
  };
}

export function hashIdentityFingerprint(release){
  return createHash('sha256').update(JSON.stringify(deriveIdentityFingerprint(release))).digest('hex');
}

export function assertIdentityFingerprintSource(release){
  const fingerprint=deriveIdentityFingerprint(release);
  const required=[
    ['canonicalName',fingerprint.canonicalName],['wikidata',fingerprint.wikidata],
    ['googleKnowledgeGraphId',fingerprint.googleKnowledgeGraphId],['irimc',fingerprint.irimc],
    ['orcid',fingerprint.orcid],['openAlex',fingerprint.openAlex],
    ['semanticScholar',fingerprint.semanticScholar],['googleScholar',fingerprint.googleScholar],
    ['clinic.wikidata',fingerprint.clinic.wikidata],['clinic.googleLocalKgmid',fingerprint.clinic.googleLocalKgmid],
    ['clinic.placeId',fingerprint.clinic.placeId],['clinic.cid',fingerprint.clinic.cid],
    ['clinic.postalCode',fingerprint.clinic.postalCode]
  ];
  for(const [label,value] of required)if(typeof value!=='string'||!value.trim())throw new Error(`Identity fingerprint source missing ${label}`);
  if(!fingerprint.verifiedWebIdentityMesh.length)throw new Error('Identity fingerprint source missing verified web identity mesh');
  return fingerprint;
}
