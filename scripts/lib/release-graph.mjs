const asArray = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];
const refId = (value) => (typeof value === "string" ? value : value?.["@id"]);

export function nodeTypes(node) {
  return new Set(asArray(node?.["@type"]).filter(Boolean));
}

export function validRevisionDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

// The continuing Dataset has its own recorded revision date. The release date
// identifies the immutable DOI snapshot and must never move with a live build.
export function datasetRevisionDate(graphOrNodes, release) {
  const nodes = Array.isArray(graphOrNodes) ? graphOrNodes : graphOrNodes?.["@graph"] || [];
  const dataset = nodes.find((node) => node?.["@id"] === release.dataset.id);
  if (!validRevisionDate(release.dateModified) ||
      !validRevisionDate(dataset?.dateModified) ||
      dataset.dateModified < release.dateModified)
    throw new Error("Current Dataset revision date must be recorded on or after its base release date");
  return dataset.dateModified;
}

export function revisionDateInRange(value, releaseDate, datasetDate) {
  return validRevisionDate(value) && value >= releaseDate && value <= datasetDate;
}

function isCurrentReleaseBoundNode(node, datasetId) {
  const types = nodeTypes(node);
  return (
    (types.has("DataDownload") && refId(node?.isPartOf) === datasetId) ||
    (types.has("DigitalDocument") && refId(node?.isBasedOn) === datasetId)
  );
}

export function selectCurrentReleaseBoundNodes(graphOrNodes, datasetId) {
  const nodes = Array.isArray(graphOrNodes)
    ? graphOrNodes
    : graphOrNodes?.["@graph"] || [];
  return nodes.filter((node) => isCurrentReleaseBoundNode(node, datasetId));
}

export function currentReleaseMetadataMismatches(
  graphOrNodes,
  { datasetId, release, dateModified, datasetDateModified = dateModified, frozenVersionDoi },
) {
  if (!validRevisionDate(dateModified) || !validRevisionDate(datasetDateModified) ||
      datasetDateModified < dateModified)
    throw new Error("Invalid base release/current Dataset revision dates");
  return selectCurrentReleaseBoundNodes(graphOrNodes, datasetId)
    .filter(
      (node) => node.version !== release ||
        // Individual resources may be unchanged since an earlier revision.
        // A DOI snapshot is different: its date stays exactly release-bound.
        (frozenVersionDoi && node.url === `https://doi.org/${frozenVersionDoi}`
          ? node.dateModified !== dateModified
          : !revisionDateInRange(node.dateModified, dateModified, datasetDateModified)),
    )
    .map((node) => ({
      id: node["@id"],
      version: node.version ?? null,
      dateModified: node.dateModified ?? null,
    }));
}

export function releaseHistoryNodeId(canonicalUrl, release) {
  return `${canonicalUrl}graph.jsonld#release-${String(release).replaceAll(".", "-")}`;
}
