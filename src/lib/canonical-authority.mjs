import {
  exactLanguageLiteral,
  indexCanonicalGraph,
} from "./semantic-projection.mjs";

const asArray = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];
const refId = (value) =>
  value && typeof value === "object" && typeof value["@id"] === "string"
    ? value["@id"]
    : typeof value === "string"
      ? value
      : null;
const nonempty = (value, label) => {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Canonical authority requires ${label}`);
  return value;
};
const uniqueStrings = (value, label) => {
  const items = asArray(value).map((item) => nonempty(item, label));
  if (new Set(items).size !== items.length)
    throw new Error(`Canonical authority duplicate ${label}`);
  return items;
};
const exactRef = (value, label) => {
  const refs = asArray(value).map(refId).filter(Boolean);
  if (refs.length !== 1) throw new Error(`Canonical authority requires one ${label}`);
  return refs[0];
};

export function deriveCanonicalAuthority(release, graph, profile) {
  if (
    typeof release?.canonicalUrl !== "string" ||
    !release.canonicalUrl ||
    typeof release?.primaryEntity?.id !== "string" ||
    !release.primaryEntity.id ||
    typeof release?.clinic?.id !== "string" ||
    !release.clinic.id ||
    typeof release?.dataset?.id !== "string" ||
    !release.dataset.id ||
    !Array.isArray(graph?.["@graph"])
  )
    throw new Error("Canonical authority requires release pointers + graph");
  if (!profile || typeof profile !== "object" || Array.isArray(profile))
    throw new Error("Canonical authority requires an authority projection profile");

  const { byId } = indexCanonicalGraph(graph);
  const base = release.canonicalUrl;
  const requireNode = (id, label) => {
    const node = byId.get(id);
    if (!node) throw new Error(`Canonical authority missing ${label}: ${id}`);
    return node;
  };
  const identifierValue = (suffix, label) =>
    nonempty(requireNode(`${base}#${suffix}`, label).value, label);

  const person = requireNode(release.primaryEntity.id, "physician");
  const clinic = requireNode(release.clinic.id, "clinic");
  const dataset = requireNode(release.dataset.id, "Dataset");
  const page = requireNode(`${base}#webpage`, "WebPage");
  const website = requireNode(`${base}#website`, "WebSite");
  const address = requireNode(exactRef(clinic.address, "clinic address"), "clinic address");

  const reconciliationAliases = uniqueStrings(
    profile.reconciliationAliases,
    "reconciliation alias",
  );
  const retrievalVariants = uniqueStrings(
    profile.retrievalVariants,
    "retrieval variant",
  );
  const graphAliases = uniqueStrings(person.alternateName, "physician alternateName");
  const graphAliasSet = new Set(graphAliases);
  for (const alias of reconciliationAliases)
    if (!graphAliasSet.has(alias))
      throw new Error(`Reconciliation alias is not graph-owned: ${alias}`);
  const nonOfficial = new Set([...reconciliationAliases, ...retrievalVariants]);
  const officialAliases = graphAliases.filter((alias) => !nonOfficial.has(alias));
  if (!officialAliases.length)
    throw new Error("Canonical authority requires graph-owned official aliases");

  const graphSameAs = uniqueStrings(person.sameAs, "physician sameAs");
  const graphSameAsSet = new Set(graphSameAs);
  const verifiedWebIdentityMesh = uniqueStrings(
    profile.verifiedWebIdentityMesh,
    "identity-mesh URL",
  );
  for (const url of verifiedWebIdentityMesh)
    if (!graphSameAsSet.has(url))
      throw new Error(`Identity projection is not graph-owned: ${url}`);
  const verifiedIdentityExpansion = uniqueStrings(
    profile.verifiedIdentityExpansion,
    "identity-expansion URL",
  );
  const meshSet = new Set(verifiedWebIdentityMesh);
  for (const url of verifiedIdentityExpansion)
    if (!meshSet.has(url))
      throw new Error(`Identity expansion is outside the verified mesh: ${url}`);

  const personWikidata = identifierValue(
    "identifier-person-wikidata",
    "physician Wikidata identifier",
  );
  const personOrcid = identifierValue("identifier-person-orcid", "physician ORCID");
  const wikidataIri = `https://www.wikidata.org/entity/${personWikidata}`;
  if (!/^Q[1-9]\d*$/.test(personWikidata) || !graphSameAsSet.has(wikidataIri))
    throw new Error("Canonical physician Wikidata identity drift");

  const datasetCreator = exactRef(dataset.creator, "Dataset creator");
  const datasetPublisher = exactRef(dataset.publisher, "Dataset publisher");
  if (
    datasetCreator !== release.primaryEntity.id ||
    datasetPublisher !== release.primaryEntity.id
  )
    throw new Error("Canonical Dataset creator/publisher is not the physician");
  const datasetAbout = new Set(asArray(dataset.about).map(refId).filter(Boolean));
  if (
    !datasetAbout.has(release.primaryEntity.id) ||
    !datasetAbout.has(release.clinic.id)
  )
    throw new Error("Canonical Dataset about topology lacks physician or clinic");

  const openingHours = nonempty(clinic.openingHours, "clinic openingHours");
  const hoursMatch = openingHours.match(/^Sa-Th (\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (!hoursMatch)
    throw new Error(`Unsupported canonical clinic openingHours: ${openingHours}`);
  const friday = requireNode(`${base}#clinic-friday-closed`, "Friday closure");
  const fridayClosed =
    friday.dayOfWeek === "https://schema.org/Friday" &&
    friday.opens === "00:00" &&
    friday.closes === "00:00";
  if (!fridayClosed) throw new Error("Canonical Friday closure drift");

  const reviewedBy = exactRef(page.reviewedBy, "WebPage reviewedBy");
  if (reviewedBy !== release.primaryEntity.id)
    throw new Error("Canonical WebPage reviewer is not the physician");

  const clinicAssertionProvenance = profile.clinicAssertionProvenance;
  if (
    clinicAssertionProvenance?.ownerConfirmed !== true ||
    typeof clinicAssertionProvenance?.truthVerifiedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(clinicAssertionProvenance.truthVerifiedAt) ||
    clinicAssertionProvenance?.truthAuthority !== "owner-confirmed"
  )
    throw new Error("Clinic assertion provenance policy drift");

  return Object.freeze({
    person,
    clinic,
    dataset,
    page,
    website,
    primaryEntity: Object.freeze({
      id: release.primaryEntity.id,
      name: exactLanguageLiteral(person.name, "en", "Canonical physician name"),
      googleKnowledgeGraphId: identifierValue(
        "identifier-person-google-kgid",
        "physician Google Knowledge Graph ID",
      ),
      wikidata: personWikidata,
      officialAliases: Object.freeze(officialAliases),
      retrievalVariants: Object.freeze(retrievalVariants),
      reconciliationAliases: Object.freeze(reconciliationAliases),
      verifiedIdentityExpansion: Object.freeze(verifiedIdentityExpansion),
      irimc: identifierValue("identifier-person-irimc", "physician IRIMC"),
      orcid: personOrcid,
      openAlex: identifierValue("identifier-person-openalex", "physician OpenAlex"),
      semanticScholar: identifierValue(
        "identifier-person-semantic-scholar",
        "physician Semantic Scholar",
      ),
      googleScholar: identifierValue(
        "identifier-person-google-scholar",
        "physician Google Scholar",
      ),
      verifiedWebIdentityMesh: Object.freeze(verifiedWebIdentityMesh),
    }),
    clinicAuthority: Object.freeze({
      id: release.clinic.id,
      googleLocalKgmid: identifierValue(
        "identifier-clinic-google-kgid",
        "clinic Google Knowledge Graph ID",
      ),
      placeId: identifierValue("identifier-clinic-google-place-id", "clinic Google Place ID"),
      cid: identifierValue("identifier-clinic-google-maps-cid", "clinic Google Maps CID"),
      postalCode: nonempty(address.postalCode, "clinic postalCode"),
      hours: `Saturday–Thursday ${hoursMatch[1]}–${hoursMatch[2]}; Friday closed`,
      ownerConfirmed: clinicAssertionProvenance.ownerConfirmed,
      truthVerifiedAt: clinicAssertionProvenance.truthVerifiedAt,
      priceRange: nonempty(clinic.priceRange, "clinic priceRange"),
      fridayClosed,
      truthAuthority: clinicAssertionProvenance.truthAuthority,
    }),
    datasetAuthority: Object.freeze({
      id: release.dataset.id,
      name: nonempty(dataset.name, "Dataset name"),
      creator: datasetCreator,
      creatorWikidata: personWikidata,
      creatorOrcid: personOrcid,
      publisher: datasetPublisher,
      supportingClinic: release.clinic.id,
    }),
    reviewedBy,
    schemaVersion: nonempty(page.schemaVersion, "WebPage schemaVersion"),
    medicalReviewedAt: nonempty(page.lastReviewed, "WebPage lastReviewed"),
  });
}

/**
 * Builds the legacy release-shaped runtime view from one graph-owned semantic
 * authority plus release/provenance metadata. This is a projection, never an
 * authored semantic source.
 */
export function hydrateReleaseAuthority(release, graph, profile) {
  const authority = deriveCanonicalAuthority(release, graph, profile);
  return Object.freeze({
    ...release,
    primaryEntity: Object.freeze({
      ...release.primaryEntity,
      ...authority.primaryEntity,
    }),
    clinic: Object.freeze({
      ...release.clinic,
      ...authority.clinicAuthority,
    }),
    dataset: Object.freeze({
      ...release.dataset,
      ...authority.datasetAuthority,
    }),
    reviewedBy: authority.reviewedBy,
    schemaVersion: authority.schemaVersion,
    medicalReviewedAt: authority.medicalReviewedAt,
  });
}
