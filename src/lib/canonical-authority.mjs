import { exactLanguageLiteral, identifierFor } from "./graph-core.mjs";
import {
  deriveCanonicalGraphFacts,
  deriveClinicOwnerConfirmation,
  selectCanonicalSocialImage,
} from "./canonical-graph-facts.mjs";

export {
  deriveCanonicalGraphFacts,
  deriveClinicOwnerConfirmation,
  selectCanonicalSocialImage,
};

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
const identifierValueFromFacts = (facts, owner, propertyID) => identifierFor(owner, facts.byId, propertyID).value;

export function deriveCanonicalAuthority(release, graph) {
  if (typeof release?.dataset?.id !== "string" || !release.dataset.id)
    throw new Error("Canonical authority requires a Dataset pointer");

  const facts = deriveCanonicalGraphFacts(release, graph);
  const clinicOwnerConfirmation = deriveClinicOwnerConfirmation(facts);
  const dataset = facts.byId.get(release.dataset.id);
  if (!dataset)
    throw new Error(`Canonical authority missing Dataset: ${release.dataset.id}`);

  const graphAliases = uniqueStrings(
    facts.person.alternateName,
    "physician alternateName",
  );
  const reconciliationAliases = uniqueStrings(
    facts.person["skos:altLabel"],
    "physician skos:altLabel",
  );
  const retrievalVariants = uniqueStrings(
    facts.person["skos:hiddenLabel"],
    "physician skos:hiddenLabel",
  );
  if (
    !graphAliases.length ||
    !reconciliationAliases.length ||
    !retrievalVariants.length
  )
    throw new Error("Canonical authority requires graph-owned lexical label sets");
  const graphAliasSet = new Set(graphAliases);
  for (const alias of reconciliationAliases)
    if (!graphAliasSet.has(alias))
      throw new Error(`Reconciliation alias is not a graph alternateName: ${alias}`);
  const hiddenSet = new Set(retrievalVariants);
  const overlap = reconciliationAliases.filter((label) => hiddenSet.has(label));
  if (overlap.length)
    throw new Error(
      `Canonical SKOS lexical labels overlap altLabel/hiddenLabel: ${overlap.join(", ")}`,
    );
  const nonOfficial = new Set([...reconciliationAliases, ...retrievalVariants]);
  const officialAliases = graphAliases.filter((alias) => !nonOfficial.has(alias));
  if (!officialAliases.length)
    throw new Error("Canonical authority requires graph-owned official aliases");

  const graphSameAs = uniqueStrings(facts.person.sameAs, "physician sameAs");
  const graphSameAsSet = new Set(graphSameAs);
  const verifiedWebIdentityMesh = graphSameAs;

  const personWikidata = identifierValueFromFacts(
    facts,
    facts.person,
    "Wikidata item ID",
    "physician Wikidata identifier",
  );
  const personOrcid = identifierValueFromFacts(
    facts,
    facts.person,
    "ORCID",
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
        "Google Knowledge Graph ID",
        "physician Google Knowledge Graph ID",
      ),
      wikidata: personWikidata,
      officialAliases: Object.freeze(officialAliases),
      retrievalVariants: Object.freeze(retrievalVariants),
      reconciliationAliases: Object.freeze(reconciliationAliases),
      irimc: identifierValueFromFacts(
        facts,
        facts.person,
        "Iran Medical Council code",
        "physician IRIMC",
      ),
      orcid: personOrcid,
      openAlex: identifierValueFromFacts(
        facts,
        facts.person,
        "OpenAlex author ID",
        "physician OpenAlex",
      ),
      semanticScholar: identifierValueFromFacts(
        facts,
        facts.person,
        "Semantic Scholar author ID",
        "physician Semantic Scholar",
      ),
      googleScholar: identifierValueFromFacts(
        facts,
        facts.person,
        "Google Scholar Author ID",
        "physician Google Scholar",
      ),
      verifiedWebIdentityMesh: Object.freeze(verifiedWebIdentityMesh),
    }),
    clinicAuthority: Object.freeze({
      id: release.clinic.id,
      googleLocalKgmid: identifierValueFromFacts(
        facts,
        facts.clinic,
        "Google Knowledge Graph ID",
        "clinic Google Knowledge Graph ID",
      ),
      placeId: facts.identifiers.clinic.placeId,
      cid: facts.identifiers.clinic.cid,
      postalCode: nonempty(facts.address.postalCode, "clinic postalCode"),
      hours: `Saturday–Thursday ${facts.clinicHours.open}–${facts.clinicHours.close}; Friday closed`,
      ...(facts.clinic.priceRange ? { priceRange: facts.clinic.priceRange } : {}),
      fridayClosed: facts.clinicHours.fridayClosed,
      ownerConfirmed: clinicOwnerConfirmation.ownerConfirmed,
      truthVerifiedAt: clinicOwnerConfirmation.truthVerifiedAt,
      truthAuthority: clinicOwnerConfirmation.truthAuthority,
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

export function composePublicationData(release, authority) {
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

/**
 * Read-only publication view derived from the canonical graph.
 * No entity facts are authored or persisted by this selector.
 */
export function derivePublicationData(release, graph) {
  const authority = deriveCanonicalAuthority(release, graph);
  return composePublicationData(release, authority);
}
