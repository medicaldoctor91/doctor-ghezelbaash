import { indexCanonicalGraph } from "./graph-core.mjs";

const SCHEMA_VERSION = "2.0";
const SOURCE = "Google Places API (New)";
const RATING_SUFFIX = "observation-clinic-google-maps-rating-current";
const REVIEW_COUNT_SUFFIX = "observation-clinic-google-maps-review-count-current";
const EVIDENCE_SUFFIX = "evidence-google-maps-clinic";

const values = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];
const refId = (value) =>
  value && typeof value === "object" && typeof value["@id"] === "string"
    ? value["@id"]
    : typeof value === "string"
      ? value
      : null;
const types = (node) => values(node?.["@type"]);
const isIsoSecond = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) &&
  !Number.isNaN(Date.parse(value));
const exactRef = (value, label) => {
  const refs = values(value).map(refId).filter(Boolean);
  if (refs.length !== 1) throw new Error(`${label} requires one reference`);
  return refs[0];
};

const requireObservation = (byId, id, { entityId, property, evidenceId }) => {
  const node = byId.get(id);
  if (
    !node ||
    !types(node).includes("Observation") ||
    exactRef(node.observationAbout, `${id} observationAbout`) !== entityId ||
    node.measuredProperty !== property ||
    node.measurementMethod !== SOURCE ||
    exactRef(node["prov:wasDerivedFrom"], `${id} prov:wasDerivedFrom`) !== evidenceId ||
    !isIsoSecond(node.observationDate)
  )
    throw new Error(`Canonical Google Maps reputation observation drift: ${id}`);
  return node;
};

export function validateReputationObservation(graph, release) {
  if (!Array.isArray(graph?.["@graph"]))
    throw new Error("Clinic reputation requires the canonical graph");
  const canonicalUrl = String(release?.canonicalUrl || "");
  const entity = release?.clinic?.id;
  const placeId = release?.clinic?.placeId;
  if (!/^https:\/\/www\.ghezelbaash\.ir\/$/.test(canonicalUrl) || !entity)
    throw new Error("Clinic reputation requires canonical publication identity");
  const { byId } = indexCanonicalGraph(graph);
  const ratingNode = requireObservation(
    byId,
    `${canonicalUrl}#${RATING_SUFFIX}`,
    {
      entityId: entity,
      property: "https://schema.org/ratingValue",
      evidenceId: `${canonicalUrl}#${EVIDENCE_SUFFIX}`,
    },
  );
  const reviewNode = requireObservation(
    byId,
    `${canonicalUrl}#${REVIEW_COUNT_SUFFIX}`,
    {
      entityId: entity,
      property: "https://schema.org/reviewCount",
      evidenceId: `${canonicalUrl}#${EVIDENCE_SUFFIX}`,
    },
  );
  const rating = Number(ratingNode.value);
  const reviewCount = Number(reviewNode.value);
  if (
    ratingNode.observationDate !== reviewNode.observationDate ||
    Number(ratingNode.maxValue) !== 5 ||
    !Number.isFinite(rating) ||
    rating < 1 ||
    rating > 5 ||
    !Number.isSafeInteger(reviewCount) ||
    reviewCount < 1
  )
    throw new Error("Canonical Google Maps reputation values drift");
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    source: SOURCE,
    entity,
    placeId,
    rating,
    reviewCount,
    valueObservedAt: ratingNode.observationDate,
    ratingNodeId: ratingNode["@id"],
    reviewCountNodeId: reviewNode["@id"],
  });
}

export function evaluateGoogleReputation({ place, current, release }) {
  if (!current || typeof current !== "object")
    throw new Error("Current canonical Google Maps reputation is required");
  const rating = Number(place?.rating);
  const reviewCount = Number(place?.userRatingCount);
  if (
    place?.id !== release.clinic.placeId ||
    place?.businessStatus !== "OPERATIONAL" ||
    place?.movedPlace ||
    place?.movedPlaceId ||
    !Number.isFinite(rating) ||
    rating < 1 ||
    rating > 5 ||
    !Number.isSafeInteger(reviewCount) ||
    reviewCount < 1
  )
    throw new Error("Google Places reputation response is invalid");
  return Object.freeze({
    rating,
    reviewCount,
    changed:
      rating !== Number(current.rating) ||
      reviewCount !== Number(current.reviewCount),
  });
}

export function applyReputationObservation(graph, { evaluation, release, observedAt }) {
  if (!evaluation?.changed)
    throw new Error("Refusing to apply an unchanged reputation observation");
  if (!isIsoSecond(observedAt))
    throw new Error("Google Maps reputation observation time is invalid");
  const next = structuredClone(graph);
  const { byId } = indexCanonicalGraph(next);
  const ratingNode = byId.get(
    `${release.canonicalUrl}#${RATING_SUFFIX}`,
  );
  const reviewNode = byId.get(
    `${release.canonicalUrl}#${REVIEW_COUNT_SUFFIX}`,
  );
  if (!ratingNode || !reviewNode)
    throw new Error("Canonical Google Maps reputation nodes are missing");
  ratingNode.value = evaluation.rating;
  ratingNode.observationDate = observedAt;
  reviewNode.value = evaluation.reviewCount;
  reviewNode.observationDate = observedAt;
  validateReputationObservation(next, release);
  return next;
}

export function assertRenderedClinicReputation(html, { graph, release, mapsUrl }) {
  const canonical = validateReputationObservation(graph, release);
  const url = new URL(mapsUrl);
  if (url.protocol !== "https:")
    throw new Error("Clinic Maps URL must use HTTPS");
  const source = String(html);
  const escapedUrl = url.href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const checks = [
    new RegExp(`data-clinic-reputation[^>]*data-rating=["']${canonical.rating}["'][^>]*data-review-count=["']${canonical.reviewCount}["']`, "i"),
    new RegExp(`data-clinic-rating[^>]*value=["']${canonical.rating}["']`, "i"),
    new RegExp(`data-clinic-review-count[^>]*value=["']${canonical.reviewCount}["']`, "i"),
    new RegExp(`href=["']${escapedUrl}["']`, "i"),
  ];
  if (checks.some((pattern) => !pattern.test(source)))
    throw new Error("Rendered clinic reputation block drift");
  return true;
}

export const reputationObservationContract = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  source: SOURCE,
  sourceFile: "src/data/semantic/knowledge-graph.jsonld",
  ratingNodeSuffix: RATING_SUFFIX,
  reviewCountNodeSuffix: REVIEW_COUNT_SUFFIX,
  refreshCron: "23 */6 * * *",
  upstreamCallsPerRun: 1,
});
