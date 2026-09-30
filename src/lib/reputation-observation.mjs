import { indexCanonicalGraph } from "./graph-core.mjs";

const SCHEMA_VERSION = "3.0";
const SOURCE = "Google Places API (New)";
const XSD_DATETIME = "http://www.w3.org/2001/XMLSchema#dateTime";

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
const explicitDateTime = (value) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    value["@type"] !== XSD_DATETIME ||
    !isIsoSecond(value["@value"])
  )
    return null;
  return value["@value"];
};
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
    !explicitDateTime(node.observationDate)
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
  const candidates = graph["@graph"].filter((node) => types(node).includes("Observation") &&
    refId(node.observationAbout) === entity && node.measuredProperty === "https://schema.org/ratingValue" && node.measurementMethod === SOURCE);
  if (candidates.length !== 1) throw new Error("Canonical clinic requires one recorded rating observation");
  const observation = candidates[0];
  const evidenceId = exactRef(observation["prov:wasDerivedFrom"], "rating source");
  if (!byId.has(evidenceId)) throw new Error("Canonical rating source is missing");
  const ratingNode = requireObservation(byId, observation["@id"], {
    entityId: entity, property: "https://schema.org/ratingValue", evidenceId,
  });
  const rating = Number(ratingNode.value);
  const ratingObservedAt = explicitDateTime(ratingNode.observationDate);
  if (
    Number(ratingNode.maxValue) !== 5 ||
    !Number.isFinite(rating) ||
    rating < 1 ||
    rating > 5
  )
    throw new Error("Canonical Google Maps rating value drift");

  return Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    source: SOURCE,
    entity,
    placeId,
    rating,
    valueObservedAt: ratingObservedAt,
    ratingNodeId: ratingNode["@id"],
  });
}
