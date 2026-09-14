import { indexCanonicalGraph } from "./semantic-projection.mjs";

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
