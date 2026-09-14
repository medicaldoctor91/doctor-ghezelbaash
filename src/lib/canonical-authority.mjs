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
  if (refs.length !== 1 || !refs[0])
    throw new Error(`Canonical authority requires one ${label}`);
  return refs[0];
};
const exactUrl = (value, pattern, label) => {
  const matches = asArray(value).filter(
    (item) => typeof item === "string" && pattern.test(item),
  );
  if (matches.length !== 1)
    throw new Error(`Canonical graph must define one ${label}`);
  return matches[0];
};
const quantityValue = (value, label) => {
  const numeric = Number(value?.value);
  if (!Number.isInteger(numeric) || numeric < 1)
    throw new Error(`Canonical graph must define one positive ${label}`);
  return numeric;
};
const exactKeys = (value, expected, label) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  )
    throw new Error(`${label} must contain only: ${expected.join(", ")}`);
};

export function assertReleaseLifecycleSource(release) {
  exactKeys(
    release,
    [
      "release",
      "dateModified",
      "canonicalUrl",
      "primaryEntity",
      "clinic",
      "dataset",
      "datasetRevisionDate",
      "currentSource",
    ],
    "Release lifecycle source",
  );
  exactKeys(release.primaryEntity, ["id"], "Release physician pointer");
  exactKeys(release.clinic, ["id"], "Release clinic pointer");
  exactKeys(
    release.dataset,
    ["id", "license", "github", "zenodo", "huggingFace"],
    "Release dataset lifecycle",
  );
}

export function assertAuthorityProfile(profile) {
  exactKeys(
    profile,
    [
      "reconciliationAliases",
      "retrievalVariants",
      "verifiedIdentityExpansion",
      "verifiedWebIdentityMesh",
    ],
    "Authority profile",
  );
}

export function assertClinicAssertionProvenance(provenance, clinicId) {
  exactKeys(
    provenance,
    [
      "schemaVersion",
      "entity",
      "ownerConfirmed",
      "truthVerifiedAt",
      "truthAuthority",
    ],
    "Clinic assertion provenance",
  );
  if (
    provenance.schemaVersion !== "1.0" ||
    provenance.entity !== clinicId ||
    provenance.ownerConfirmed !== true ||
    typeof provenance.truthVerifiedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(provenance.truthVerifiedAt) ||
    provenance.truthAuthority !== "owner-confirmed"
  )
    throw new Error("Clinic assertion provenance drift");
  return provenance;
}

/**
 * Resolve canonical graph facts needed by multiple consumers. This selector owns
 * graph traversal and relationship validation; callers should consume its result
 * rather than re-indexing the same semantic nodes independently.
 */
export function deriveCanonicalGraphFacts(release, graph) {
  if (
    typeof release?.canonicalUrl !== "string" ||
    !release.canonicalUrl ||
    typeof release?.primaryEntity?.id !== "string" ||
    !release.primaryEntity.id ||
    typeof release?.clinic?.id !== "string" ||
    !release.clinic.id ||
    !Array.isArray(graph?.["@graph"])
  )
    throw new Error("Canonical graph facts require release pointers + graph");

  const { byId } = indexCanonicalGraph(graph);
  const base = release.canonicalUrl;
  const requireNode = (id, label) => {
    const node = byId.get(id);
    if (!node) throw new Error(`Canonical authority missing ${label}: ${id}`);
    return node;
  };
  const person = requireNode(release.primaryEntity.id, "physician");
  const clinic = requireNode(release.clinic.id, "clinic");
  const page = requireNode(`${base}#webpage`, "WebPage");
  const website = requireNode(`${base}#website`, "WebSite");
  const address = requireNode(
    exactRef(clinic.address, "clinic address"),
    "clinic address",
  );
  const identifierNode = (owner, suffix, label) => {
    const id = `${base}#${suffix}`;
    const node = requireNode(id, label);
    const references = asArray(owner.identifier).map(refId);
    if (
      references.filter((reference) => reference === id).length !== 1 ||
      !asArray(node["@type"]).includes("PropertyValue")
    )
      throw new Error(
        `Canonical ${label} must be linked once from its owner as a PropertyValue`,
      );
    nonempty(node.value, label);
    return node;
  };
  const identifierValue = (owner, suffix, label) =>
    identifierNode(owner, suffix, label).value;

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

  const instagramUrl = exactUrl(
    person.sameAs,
    /^https:\/\/www\.instagram\.com\/[A-Za-z0-9._-]+\/?$/,
    "official Instagram profile",
  );
  const clinicIdentifierUrls = asArray(clinic.identifier)
    .map(refId)
    .filter(Boolean)
    .map((id) => byId.get(id)?.url)
    .filter((url) => typeof url === "string");
  const openStreetMapUrl = exactUrl(
    clinicIdentifierUrls,
    /^https:\/\/www\.openstreetmap\.org\/node\/\d+$/,
    "clinic OpenStreetMap identifier",
  );

  return Object.freeze({
    base,
    byId,
    person,
    clinic,
    page,
    website,
    address,
    reviewedBy,
    schemaVersion: nonempty(page.schemaVersion, "WebPage schemaVersion"),
    medicalReviewedAt: nonempty(page.lastReviewed, "WebPage lastReviewed"),
    instagramUrl,
    openStreetMapUrl,
    clinicHours: Object.freeze({
      open: hoursMatch[1],
      close: hoursMatch[2],
      fridayClosed,
    }),
    identifiers: Object.freeze({
      clinic: Object.freeze({
        placeId: identifierValue(
          clinic,
          "identifier-clinic-google-place-id",
          "clinic Google Place ID",
        ),
        cid: identifierValue(
          clinic,
          "identifier-clinic-google-maps-cid",
          "clinic Google Maps CID",
        ),
      }),
    }),
  });
}

const identifierValueFromFacts = (facts, owner, suffix, label) => {
  const id = `${facts.base}#${suffix}`;
  const node = facts.byId.get(id);
  const references = asArray(owner.identifier).map(refId);
  if (
    !node ||
    references.filter((reference) => reference === id).length !== 1 ||
    !asArray(node["@type"]).includes("PropertyValue")
  )
    throw new Error(
      `Canonical ${label} must be linked once from its owner as a PropertyValue`,
    );
  return nonempty(node.value, label);
};

export function selectCanonicalSocialImage(release, graph) {
  if (!Array.isArray(graph?.["@graph"]))
    throw new Error("Canonical social image requires graph nodes");
  const canonicalOrigin = new URL(release.canonicalUrl).origin;
  const candidates = graph["@graph"].filter((node) => {
    const types = asArray(node?.["@type"]);
    return (
      types.includes("ImageObject") &&
      Number(node?.width?.value) === 1200 &&
      Number(node?.height?.value) === 630 &&
      typeof node?.contentUrl === "string" &&
      new URL(node.contentUrl).origin === canonicalOrigin
    );
  });
  if (candidates.length !== 1)
    throw new Error(
      `Canonical graph must define exactly one 1200x630 social ImageObject; found ${candidates.length}`,
    );
  const [image] = candidates;
  return Object.freeze({
    contentUrl: nonempty(image.contentUrl, "social ImageObject contentUrl"),
    encodingFormat: nonempty(
      image.encodingFormat,
      "social ImageObject encodingFormat",
    ),
    width: quantityValue(image.width, "social ImageObject width"),
    height: quantityValue(image.height, "social ImageObject height"),
  });
}

export function deriveCanonicalAuthority(release, graph, profile) {
  assertReleaseLifecycleSource(release);
  assertAuthorityProfile(profile);
  if (typeof release?.dataset?.id !== "string" || !release.dataset.id)
    throw new Error("Canonical authority requires a Dataset pointer");

  const facts = deriveCanonicalGraphFacts(release, graph);
  const dataset = facts.byId.get(release.dataset.id);
  if (!dataset)
    throw new Error(`Canonical authority missing Dataset: ${release.dataset.id}`);

  const reconciliationAliases = uniqueStrings(
    profile.reconciliationAliases,
    "reconciliation alias",
  );
  const retrievalVariants = uniqueStrings(
    profile.retrievalVariants,
    "retrieval variant",
  );
  const graphAliases = uniqueStrings(
    facts.person.alternateName,
    "physician alternateName",
  );
  const graphAliasSet = new Set(graphAliases);
  for (const alias of reconciliationAliases)
    if (!graphAliasSet.has(alias))
      throw new Error(`Reconciliation alias is not graph-owned: ${alias}`);
  const nonOfficial = new Set([...reconciliationAliases, ...retrievalVariants]);
  const officialAliases = graphAliases.filter((alias) => !nonOfficial.has(alias));
  if (!officialAliases.length)
    throw new Error("Canonical authority requires graph-owned official aliases");

  const graphSameAs = uniqueStrings(facts.person.sameAs, "physician sameAs");
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

  const personWikidata = identifierValueFromFacts(
    facts,
    facts.person,
    "identifier-person-wikidata",
    "physician Wikidata identifier",
  );
  const personOrcid = identifierValueFromFacts(
    facts,
    facts.person,
    "identifier-person-orcid",
    "physician ORCID",
  );
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

  return Object.freeze({
    facts,
    person: facts.person,
    clinic: facts.clinic,
    dataset,
    page: facts.page,
    website: facts.website,
    primaryEntity: Object.freeze({
      id: release.primaryEntity.id,
      name: exactLanguageLiteral(
        facts.person.name,
        "en",
        "Canonical physician name",
      ),
      googleKnowledgeGraphId: identifierValueFromFacts(
        facts,
        facts.person,
        "identifier-person-google-kgid",
        "physician Google Knowledge Graph ID",
      ),
      wikidata: personWikidata,
      officialAliases: Object.freeze(officialAliases),
      retrievalVariants: Object.freeze(retrievalVariants),
      reconciliationAliases: Object.freeze(reconciliationAliases),
      verifiedIdentityExpansion: Object.freeze(verifiedIdentityExpansion),
      irimc: identifierValueFromFacts(
        facts,
        facts.person,
        "identifier-person-irimc",
        "physician IRIMC",
      ),
      orcid: personOrcid,
      openAlex: identifierValueFromFacts(
        facts,
        facts.person,
        "identifier-person-openalex",
        "physician OpenAlex",
      ),
      semanticScholar: identifierValueFromFacts(
        facts,
        facts.person,
        "identifier-person-semantic-scholar",
        "physician Semantic Scholar",
      ),
      googleScholar: identifierValueFromFacts(
        facts,
        facts.person,
        "identifier-person-google-scholar",
        "physician Google Scholar",
      ),
      verifiedWebIdentityMesh: Object.freeze(verifiedWebIdentityMesh),
    }),
    clinicAuthority: Object.freeze({
      id: release.clinic.id,
      googleLocalKgmid: identifierValueFromFacts(
        facts,
        facts.clinic,
        "identifier-clinic-google-kgid",
        "clinic Google Knowledge Graph ID",
      ),
      placeId: facts.identifiers.clinic.placeId,
      cid: facts.identifiers.clinic.cid,
      postalCode: nonempty(facts.address.postalCode, "clinic postalCode"),
      hours: `Saturday–Thursday ${facts.clinicHours.open}–${facts.clinicHours.close}; Friday closed`,
      priceRange: nonempty(facts.clinic.priceRange, "clinic priceRange"),
      fridayClosed: facts.clinicHours.fridayClosed,
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
    reviewedBy: facts.reviewedBy,
    schemaVersion: facts.schemaVersion,
    medicalReviewedAt: facts.medicalReviewedAt,
  });
}

export function composePublicationData(release, authority, clinicProvenance) {
  const provenance = assertClinicAssertionProvenance(
    clinicProvenance,
    release.clinic.id,
  );
  return Object.freeze({
    release: release.release,
    dateModified: release.dateModified,
    canonicalUrl: release.canonicalUrl,
    primaryEntity: authority.primaryEntity,
    clinic: Object.freeze({
      ...authority.clinicAuthority,
      ownerConfirmed: provenance.ownerConfirmed,
      truthVerifiedAt: provenance.truthVerifiedAt,
      truthAuthority: provenance.truthAuthority,
    }),
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

/**
 * Compatibility read model for publication consumers that still expect release
 * lifecycle and semantic authority in one object. It is derived, immutable and
 * never persisted back to the lifecycle source.
 */
export function derivePublicationData(
  release,
  graph,
  profile,
  clinicProvenance,
) {
  const authority = deriveCanonicalAuthority(release, graph, profile);
  return composePublicationData(release, authority, clinicProvenance);
}
