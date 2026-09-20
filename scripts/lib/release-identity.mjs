import { createHash } from "node:crypto";

function deriveIdentityFingerprint(release) {
  const person = release?.primaryEntity || {};
  const clinic = release?.clinic || {};
  return {
    canonicalName: person.name,
    wikidata: person.wikidata,
    googleKnowledgeGraphId: person.googleKnowledgeGraphId,
    irimc: person.irimc,
    orcid: person.orcid,
    openAlex: person.openAlex,
    semanticScholar: person.semanticScholar,
    googleScholar: person.googleScholar,
    clinic: {
      googleLocalKgmid: clinic.googleLocalKgmid,
      placeId: clinic.placeId,
      cid: clinic.cid,
      postalCode: clinic.postalCode,
    },
    verifiedWebIdentityMesh: [...(person.verifiedWebIdentityMesh || [])],
  };
}

export function hashIdentityFingerprint(release) {
  return createHash("sha256")
    .update(JSON.stringify(deriveIdentityFingerprint(release)))
    .digest("hex");
}
