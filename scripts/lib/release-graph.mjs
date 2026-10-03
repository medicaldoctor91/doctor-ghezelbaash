export const revisionLiteral = (value) => value?.["@value"] ?? value;

export function validRevisionDate(value) {
  const resolved = revisionLiteral(value);
  if (typeof resolved !== "string") return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(resolved))
    return Number.isFinite(Date.parse(`${resolved}T00:00:00Z`)) &&
      new Date(`${resolved}T00:00:00Z`).toISOString().slice(0, 10) === resolved;
  if (/^\d{4}-\d{2}-\d{2}T/.test(resolved))
    return Number.isFinite(Date.parse(resolved)) &&
      new Date(resolved).toISOString().slice(0, 10) === resolved.slice(0, 10);
  return false;
}

export function revisionDay(value) {
  const resolved = revisionLiteral(value);
  return validRevisionDate(resolved) ? resolved.slice(0, 10) : null;
}

export function revisionSortValue(value) {
  const resolved = revisionLiteral(value);
  if (!validRevisionDate(resolved)) return Number.NaN;
  return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(resolved) ? `${resolved}T00:00:00Z` : resolved);
}

// The continuing Dataset has its own recorded revision date. The release date
// identifies the immutable DOI snapshot and must never move with a live build.
export function datasetRevisionDate(graphOrNodes, release) {
  const nodes = Array.isArray(graphOrNodes) ? graphOrNodes : graphOrNodes?.["@graph"] || [];
  const dataset = nodes.find((node) => node?.["@id"] === release.dataset.id);
  const releaseDate = revisionLiteral(release.dateModified);
  const revisionDate = revisionLiteral(dataset?.dateModified);
  if (!validRevisionDate(releaseDate) ||
      !validRevisionDate(revisionDate) ||
      revisionDay(revisionDate) < revisionDay(releaseDate))
    throw new Error("Current Dataset revision date must be recorded on or after its base release date");
  return revisionDate;
}
