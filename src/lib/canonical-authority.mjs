import { exactLanguageLiteral } from "./graph-core.mjs";
import {
  deriveCanonicalGraphFacts,
  selectCanonicalSocialImage,
} from "./canonical-graph-facts.mjs";

export { deriveCanonicalGraphFacts, selectCanonicalSocialImage };

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
