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
 * Enforces ownership of the physician's public Wikidata identifier.
 * release.json owns the identifier, while the graph projects it onto the
 * physician and matching PropertyValue node.
 */
export function validateCoreEntityIdentity({ release, nodes }) {
  if (!Array.isArray(nodes))
    fail("Core entity identity validation requires graph nodes");
  const personQ = String(release?.primaryEntity?.wikidata || "");
  if (!/^Q[1-9]\d*$/.test(personQ))
    fail("Physician Wikidata identifier is invalid");

  const byId = new Map(
    nodes
      .filter((node) => typeof node?.["@id"] === "string")
      .map((node) => [node["@id"], node]),
  );
  const person = byId.get(release.primaryEntity.id);
  const clinic = byId.get(release.clinic.id);
  if (!person || !clinic) fail("Core Person/Clinic identity nodes are missing");

  const personIri = `https://www.wikidata.org/entity/${personQ}`;
  const wikidataIris = (node) =>
    asArray(node.sameAs)
      .map(refId)
      .filter((value) =>
        /^https:\/\/www\.wikidata\.org\/entity\/Q[1-9]\d*$/.test(value || ""),
      )
      .sort();
  if (!exactValues(wikidataIris(person), [personIri]))
    fail("Physician Wikidata sameAs ownership drift");

  const verifyIdentifier = (entity, nodeId, value, url, label) => {
    if (!asArray(entity.identifier).map(refId).includes(nodeId))
      fail(`${label} does not reference its Wikidata PropertyValue`);
    const node = byId.get(nodeId);
    if (
      !node ||
      node.propertyID !== "Wikidata item ID" ||
      node.value !== value ||
      node.url !== url
    )
      fail(`${label} Wikidata PropertyValue drift`);
  };
  verifyIdentifier(
    person,
    `${release.canonicalUrl}#identifier-person-wikidata`,
    personQ,
    personIri,
    "Physician",
  );

  const releaseMesh = asArray(release.primaryEntity.verifiedWebIdentityMesh)
    .filter((value) =>
      /^https:\/\/www\.wikidata\.org\/entity\/Q[1-9]\d*$/.test(value),
    )
    .sort();
  if (!exactValues(releaseMesh, [personIri]))
    fail("Release physician identity mesh Wikidata ownership drift");
  return Object.freeze({ personQ, personIri });
}
