import { indexCanonicalGraph, identifierFor } from "./graph-core.mjs";

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
  const profile = requireNode(exactRef(person.mainEntityOfPage, "physician mainEntityOfPage"), "ProfilePage");
  if (!asArray(profile["@type"]).includes("ProfilePage") || profile.mainEntity?.["@id"] !== person["@id"])
    throw new Error("Canonical physician ProfilePage must describe the physician");
  const page = requireNode(base + "webpage", "canonical medical WebPage");
  if (!asArray(page["@type"]).includes("MedicalWebPage") || asArray(page["@type"]).includes("ProfilePage"))
    throw new Error("Canonical homepage must be a MedicalWebPage, not a ProfilePage");
  const website = requireNode(exactRef(page.isPartOf, "WebPage isPartOf"), "WebSite");
  const address = requireNode(
    exactRef(clinic.address, "clinic address"),
    "clinic address",
  );
  const hours = asArray(clinic.openingHoursSpecification).map((ref) => requireNode(exactRef(ref, "opening hours"), "opening hours"));
  const weekdaySpecs = hours.filter((node) => asArray(node.dayOfWeek).includes("https://schema.org/Saturday"));
  const fridaySpecs = hours.filter((node) => asArray(node.dayOfWeek).includes("https://schema.org/Friday"));
  if (weekdaySpecs.length !== 1 || fridaySpecs.length !== 1)
    throw new Error("Canonical clinic requires its weekday and Friday specifications");
  const [weekdayHours] = weekdaySpecs;
  const [friday] = fridaySpecs;
  const clock = (value) => {
    const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] || 0) > 59)
      throw new Error(`Invalid canonical opening time: ${value}`);
    return { text: `${match[1]}:${match[2]}`, seconds: Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0) };
  };
  const open = clock(weekdayHours.opens), close = clock(weekdayHours.closes);
  const fridayClosed = clock(friday.opens).seconds === 0 && clock(friday.closes).seconds === 0;
  const weekdays = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"].map((day) => `https://schema.org/${day}`);
  if (open.seconds >= close.seconds || !fridayClosed ||
      weekdays.length !== asArray(weekdayHours.dayOfWeek).length ||
      weekdays.some((day) => !asArray(weekdayHours.dayOfWeek).includes(day)) ||
      clinic.openingHours !== `Sa-Th ${open.text}-${close.text}`)
    throw new Error("Canonical clinic opening-hour representations disagree");

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
    profile,
    page,
    website,
    address,
    reviewedBy,
    schemaVersion: nonempty(page.schemaVersion, "WebPage schemaVersion"),
    medicalReviewedAt: nonempty(page.lastReviewed, "WebPage lastReviewed"),
    instagramUrl,
    openStreetMapUrl,
    clinicHours: Object.freeze({
      open: open.text,
      close: close.text,
      fridayClosed,
    }),
    weekdayHours,
    fridayClosure: friday,
    identifiers: Object.freeze({
      clinic: Object.freeze({
        placeId: identifierFor(clinic, byId, "Google Place ID").value,
        cid: identifierFor(clinic, byId, "Google Maps CID").value,
      }),
    }),
  });
}


/**
 * Resolve provenance that is intentionally absent from compact head projections.
 * Call this only with facts derived from the full canonical graph.
 */
export function deriveClinicOwnerConfirmation(facts) {
  const { base, byId, person, clinic, weekdayHours, fridayClosure } = facts || {};
  if (
    typeof base !== "string" ||
    !(byId instanceof Map) ||
    !person?.["@id"] ||
    !clinic?.["@id"] ||
    !weekdayHours?.["@id"] ||
    !fridayClosure?.["@id"]
  )
    throw new Error("Clinic owner confirmation requires canonical graph facts");

  const expectedConfirmationAbout = [clinic["@id"], weekdayHours["@id"], fridayClosure["@id"]];
  const claims = asArray(clinic.subjectOf).map(refId).map((id) => byId.get(id)).filter((node) =>
    asArray(node?.["@type"]).includes("Claim") && refId(node.author) === person["@id"] &&
    expectedConfirmationAbout.every((id) => asArray(node.about).map(refId).includes(id)));
  if (claims.length !== 1) throw new Error("Canonical clinic requires one owner-confirmed operating-facts claim");
  const [ownerConfirmation] = claims;
  const confirmationAbout = asArray(ownerConfirmation.about).map(refId);
  const ownerConfirmationDate = nonempty(
    ownerConfirmation.dateCreated,
    "owner-confirmed clinic claim dateCreated",
  );
  if (
    !asArray(ownerConfirmation["@type"]).includes("Claim") ||
    exactRef(ownerConfirmation.author, "owner-confirmed clinic claim author") !==
      person["@id"] ||
    !/^\d{4}-\d{2}-\d{2}$/.test(ownerConfirmationDate) ||
    confirmationAbout.length !== expectedConfirmationAbout.length ||
    expectedConfirmationAbout.some(
      (id) => confirmationAbout.filter((candidate) => candidate === id).length !== 1,
    ) ||
    asArray(clinic.subjectOf)
      .map(refId)
      .filter((id) => id === ownerConfirmation["@id"]).length !== 1 ||
    !asArray(person.owns).map(refId).includes(clinic["@id"])
  )
    throw new Error("Canonical owner-confirmed clinic provenance drift");

  return Object.freeze({
    id: ownerConfirmation["@id"],
    ownerConfirmed: true,
    truthVerifiedAt: ownerConfirmationDate,
    truthAuthority: "owner-confirmed",
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
