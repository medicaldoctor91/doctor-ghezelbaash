const literal = (value) => value?.["@value"] ?? value;

export function validRevisionDate(value) {
  const resolved = literal(value);
  return typeof resolved === "string" && /^\d{4}-\d{2}-\d{2}$/.test(resolved) &&
    Number.isFinite(Date.parse(`${resolved}T00:00:00Z`)) &&
    new Date(`${resolved}T00:00:00Z`).toISOString().slice(0, 10) === resolved;
}

// The continuing Dataset has its own recorded revision date. The release date
// identifies the immutable DOI snapshot and must never move with a live build.
export function datasetRevisionDate(graphOrNodes, release) {
  const nodes = Array.isArray(graphOrNodes) ? graphOrNodes : graphOrNodes?.["@graph"] || [];
  const dataset = nodes.find((node) => node?.["@id"] === release.dataset.id);
  const releaseDate = literal(release.dateModified);
  const revisionDate = literal(dataset?.dateModified);
  if (!validRevisionDate(releaseDate) ||
      !validRevisionDate(revisionDate) ||
      revisionDate < releaseDate)
    throw new Error("Current Dataset revision date must be recorded on or after its base release date");
  return revisionDate;
}
