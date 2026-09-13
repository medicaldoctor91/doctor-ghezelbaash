const asArray = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];
const refId = (value) => (typeof value === "string" ? value : value?.["@id"]);
const fail = (message) => {
  throw new Error(message);
};
const exactValues = (actual, expected) =>
  actual.length === expected.length &&
  actual.every((value, index) => value === expected[index]);

/**
 * Enforces the physician's public Wikidata identity from the canonical graph.
 * release.json supplies only stable entity pointers and the canonical URL;
 * the identifier value itself is graph-owned.
 */
export function validateCoreEntityIdentity({ release, nodes }) {
  if (!Array.isArray(nodes))
    fail("Core entity identity validation requires graph nodes");
  if (
    typeof release?.canonicalUrl !== "string" ||
    !release.canonicalUrl ||
    typeof release?.primaryEntity?.id !== "string" ||
    !release.primaryEntity.id ||
    typeof release?.clinic?.id !== "string" ||
    !release.clinic.id
  )
    fail("Core entity identity validation requires canonical entity pointers");

  const byId = new Map(
    nodes
      .filter((node) => typeof node?.["@id"] === "string")
      .map((node) => [node["@id"], node]),
  );
  const person = byId.get(release.primaryEntity.id);
  const clinic = byId.get(release.clinic.id);
  if (!person || !clinic) fail("Core Person/Clinic identity nodes are missing");

  const identifierId = `${release.canonicalUrl}#identifier-person-wikidata`;
  const identifier = byId.get(identifierId);
  if (!asArray(person.identifier).map(refId).includes(identifierId))
    fail("Physician does not reference its Wikidata PropertyValue");
  const personQ = String(identifier?.value || "");
  if (
    !identifier ||
    identifier.propertyID !== "Wikidata item ID" ||
    !/^Q[1-9]\d*$/.test(personQ)
  )
    fail("Physician Wikidata PropertyValue drift");
  const personIri = `https://www.wikidata.org/entity/${personQ}`;
  if (identifier.url !== personIri)
    fail("Physician Wikidata PropertyValue URL drift");

  const wikidataIris = (node) =>
    asArray(node.sameAs)
      .map(refId)
      .filter((value) =>
        /^https:\/\/www\.wikidata\.org\/entity\/Q[1-9]\d*$/.test(value || ""),
      )
      .sort();
  if (!exactValues(wikidataIris(person), [personIri]))
    fail("Physician Wikidata sameAs ownership drift");
  return Object.freeze({ personQ, personIri });
}
