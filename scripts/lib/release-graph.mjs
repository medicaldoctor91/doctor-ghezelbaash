import { dateValue, validCalendarDate } from "../../src/lib/graph-dates.mjs";

export const validRevisionDate = validCalendarDate;

// The continuing Dataset has its own recorded revision date. The release date
// identifies the immutable DOI snapshot and must never move with a live build.
export function datasetRevisionDate(graphOrNodes, release) {
  const nodes = Array.isArray(graphOrNodes) ? graphOrNodes : graphOrNodes?.["@graph"] || [];
  const dataset = nodes.find((node) => node?.["@id"] === release.dataset.id);
  const revision = dateValue(dataset?.dateModified), releaseDate = dateValue(release.dateModified);
  if (!validRevisionDate(releaseDate) ||
      !validRevisionDate(revision) ||
      revision < releaseDate)
    throw new Error("Current Dataset revision date must be recorded on or after its base release date");
  return revision;
}
