const literal = (value) => value?.["@value"] ?? value;

const comparableLiteral = (value) => {
  const resolved = literal(value);
  // Legacy projection code compares/sorts revision values after validation.
  // Give JSON-LD value objects the same primitive lexical value without adding
  // enumerable data or changing their serialized canonical representation.
  if (value && typeof value === "object" && !Array.isArray(value) &&
      typeof resolved === "string" && Object.isExtensible(value) &&
      !Object.prototype.hasOwnProperty.call(value, Symbol.toPrimitive))
    Object.defineProperty(value, Symbol.toPrimitive, {
      value: () => resolved,
      enumerable: false,
      configurable: true,
    });
  return resolved;
};

export function validRevisionDate(value) {
  const resolved = comparableLiteral(value);
  if (typeof resolved !== "string") return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(resolved))
    return Number.isFinite(Date.parse(`${resolved}T00:00:00Z`)) &&
      new Date(`${resolved}T00:00:00Z`).toISOString().slice(0, 10) === resolved;
  if (/^\d{4}-\d{2}-\d{2}T/.test(resolved))
    return Number.isFinite(Date.parse(resolved)) &&
      new Date(resolved).toISOString().slice(0, 10) === resolved.slice(0, 10);
  return false;
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
