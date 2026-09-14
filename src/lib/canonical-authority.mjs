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
  const refs = asArray(value).map(refId);
  if (refs.length !== 1 || !refs[0]) throw new Error(`Canonical authority requires one ${label}`);
  return refs[0];
};

export function assertReleaseLifecycleSource(release) {
  const exactKeys = (value, expected, label) => {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).length !== expected.length ||
        expected.some((key) => !Object.hasOwn(value, key)))
      throw new Error(`${label} must contain only: ${expected.join(", ")}`);
  };
  exactKeys(release, ["release", "dateModified", "canonicalUrl", "primaryEntity", "clinic", "dataset", "datasetRevisionDate", "currentSource"], "Release lifecycle source");
  exactKeys(release.primaryEntity, ["id"], "Release physician pointer");
  exactKeys(release.clinic, ["id"], "Release clinic pointer");
  exactKeys(release.dataset, ["id", "license", "github", "zenodo", "huggingFace"], "Release dataset lifecycle");
}

export function deriveCanonicalAuthority(release, graph, profile) {
  assertReleaseLifecycleSource(release);
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
  const person = requireNode(release.primaryEntity.id, "physician");
  const clinic = requireNode(release.clinic.id, "clinic");
  const dataset = requireNode(release.dataset.id, "Dataset");
  const page = requireNode(`${base}#webpage`, "WebPage");
  const website = requireNode(`${base}#website`, "WebSite");
  const address = requireNode(exactRef(clinic.address, "clinic address"), "clinic address");
  const identifierValue = (owner, suffix, label) => {
    const id = `${base}#${suffix}`;
    const node = requireNode(id, label);
    const references = asArray(owner.identifier).map(refId);
    if (references.filter((reference) => reference === id).length !== 1 ||
        !asArray(node["@type"]).includes("PropertyValue"))
      throw new Error(`Canonical ${label} must be linked once from its owner as a PropertyValue`);
    return nonempty(node.value, label);
  };

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
    person,
    "identifier-person-wikidata",
    "physician Wikidata identifier",
  );
  const personOrcid = identifierValue(person, "identifier-person-orcid", "physician ORCID");
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
    asArray(clinic.openingHoursSpecification).map(refId).includes(friday["@id"]) &&
    asArray(friday["@type"]).includes("OpeningHoursSpecification") &&
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
        person,
        "identifier-person-google-kgid",
        "physician Google Knowledge Graph ID",
      ),
      wikidata: personWikidata,
      officialAliases: Object.freeze(officialAliases),
      retrievalVariants: Object.freeze(retrievalVariants),
      reconciliationAliases: Object.freeze(reconciliationAliases),
      verifiedIdentityExpansion: Object.freeze(verifiedIdentityExpansion),
      irimc: identifierValue(person, "identifier-person-irimc", "physician IRIMC"),
      orcid: personOrcid,
      openAlex: identifierValue(person, "identifier-person-openalex", "physician OpenAlex"),
      semanticScholar: identifierValue(
        person,
        "identifier-person-semantic-scholar",
        "physician Semantic Scholar",
      ),
      googleScholar: identifierValue(
        person,
        "identifier-person-google-scholar",
        "physician Google Scholar",
      ),
      verifiedWebIdentityMesh: Object.freeze(verifiedWebIdentityMesh),
    }),
    clinicAuthority: Object.freeze({
      id: release.clinic.id,
      googleLocalKgmid: identifierValue(
        clinic,
        "identifier-clinic-google-kgid",
        "clinic Google Knowledge Graph ID",
      ),
      placeId: identifierValue(clinic, "identifier-clinic-google-place-id", "clinic Google Place ID"),
      cid: identifierValue(clinic, "identifier-clinic-google-maps-cid", "clinic Google Maps CID"),
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
 * Publication consumers need both entity facts and release metadata. Compose
 * that read model explicitly from disjoint owners, without overriding authored
 * facts or mutating the lifecycle source. This result is never saved as source.
 */
export function derivePublicationData(release, graph, profile) {
  const authority = deriveCanonicalAuthority(release, graph, profile);
  return Object.freeze({
    release: release.release,
    dateModified: release.dateModified,
    canonicalUrl: release.canonicalUrl,
    primaryEntity: authority.primaryEntity,
    clinic: authority.clinicAuthority,
    dataset: Object.freeze({
      id: authority.datasetAuthority.id,
      license: release.dataset.license,
      github: release.dataset.github,
      zenodo: release.dataset.zenodo,
      huggingFace: release.dataset.huggingFace,
      name: authority.datasetAuthority.name,
      creator: authority.datasetAuthority.creator,
      creatorWikidata: authority.datasetAuthority.creatorWikidata,
      creatorOrcid: authority.datasetAuthority.creatorOrcid,
      publisher: authority.datasetAuthority.publisher,
      supportingClinic: authority.datasetAuthority.supportingClinic,
    }),
    datasetRevisionDate: release.datasetRevisionDate,
    currentSource: release.currentSource,
    reviewedBy: authority.reviewedBy,
    schemaVersion: authority.schemaVersion,
    medicalReviewedAt: authority.medicalReviewedAt,
  });
}
