import { readFile } from "node:fs/promises";
import { commitTextFiles } from "./lib/file-transaction.mjs";
import { releaseHistoryNodeId } from "./lib/release-graph.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  }),
);
const required = ["release", "record", "doi", "date", "target-release"];
for (const key of required)
  if (!args[key]) throw new Error(`Missing --${key}`);
if (!/^\d+\.\d+\.\d+$/.test(args.release) || !/^\d+\.\d+\.\d+$/.test(args["target-release"]))
  throw new Error("Zenodo history reconciliation requires semantic versions");
if (!/^\d+$/.test(args.record)) throw new Error("Invalid predecessor record ID");
if (!/^10\.5281\/zenodo\.\d+$/.test(args.doi)) throw new Error("Invalid predecessor Version DOI");
if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("Invalid predecessor publication date");
const semver = (value) => value.split(".").map(Number);
const compare = (left, right) => {
  const a = semver(left), b = semver(right);
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
};
if (compare(args.release, args["target-release"]) >= 0)
  throw new Error("Predecessor must sort before the target release");

const releasePath = "src/data/release.json";
const graphPath = "src/data/semantic/knowledge-graph.jsonld";
const release = JSON.parse(await readFile(releasePath, "utf8"));
const graph = JSON.parse(await readFile(graphPath, "utf8"));
const history = release.dataset?.zenodo?.releaseHistory;
if (!Array.isArray(history) || !Array.isArray(graph["@graph"]))
  throw new Error("Canonical release history or graph is missing");
if (compare(release.release, args.release) >= 0)
  throw new Error("Factual predecessor must be newer than the current canonical source release");
if (compare(args["target-release"], release.release) <= 0)
  throw new Error("Target release must be newer than current canonical source release");

const entry = {
  release: args.release,
  recordId: String(args.record),
  versionDoi: args.doi,
  publicationDate: args.date,
};
const sameIdentity = (value) =>
  value.release === entry.release &&
  String(value.recordId) === entry.recordId &&
  value.versionDoi === entry.versionDoi &&
  value.publicationDate === entry.publicationDate;
const existing = history.find((value) => value.release === entry.release);
if (existing && !sameIdentity(existing))
  throw new Error("Existing factual predecessor has a conflicting immutable identity");
for (const value of history) {
  if (String(value.recordId) === entry.recordId && value.release !== entry.release)
    throw new Error("Predecessor record ID is already assigned to another release");
  if (value.versionDoi === entry.versionDoi && value.release !== entry.release)
    throw new Error("Predecessor Version DOI is already assigned to another release");
}
if (!existing) history.push(entry);
history.sort(
  (left, right) =>
    left.publicationDate.localeCompare(right.publicationDate) || compare(left.release, right.release),
);

const dataset = graph["@graph"].find((node) => node?.["@id"] === release.dataset.id);
if (!dataset) throw new Error("Canonical Dataset graph node missing");
const nodeId = releaseHistoryNodeId(release.canonicalUrl, entry.release);
const expectedNode = {
  "@id": nodeId,
  "@type": "Dataset",
  name: `Dr. Saeed Ghezelbash Public Knowledge Graph — Version ${entry.release}`,
  version: entry.release,
  datePublished: entry.publicationDate,
  identifier: [
    {
      "@type": "PropertyValue",
      propertyID: "Zenodo Version DOI",
      value: entry.versionDoi,
      url: `https://doi.org/${entry.versionDoi}`,
    },
    {
      "@type": "PropertyValue",
      propertyID: "Zenodo Record ID",
      value: entry.recordId,
    },
  ],
  isPartOf: { "@id": release.dataset.id },
  url: `https://doi.org/${entry.versionDoi}`,
};
const graphExisting = graph["@graph"].find((node) => node?.["@id"] === nodeId);
if (graphExisting && JSON.stringify(graphExisting) !== JSON.stringify(expectedNode))
  throw new Error("Existing factual predecessor graph node conflicts with immutable Zenodo identity");
if (!graphExisting) graph["@graph"].push(expectedNode);

dataset.citation = history.map((value) => ({
  "@id": releaseHistoryNodeId(release.canonicalUrl, value.release),
}));

await commitTextFiles([
  {
    file: releasePath,
    content: `${JSON.stringify(release, null, 2)}\n`,
  },
  {
    file: graphPath,
    content: `${JSON.stringify(graph, null, 2)}\n`,
  },
]);
console.log(
  JSON.stringify(
    {
      reconciled: true,
      predecessor: entry,
      targetRelease: args["target-release"],
      currentCanonicalRelease: release.release,
      releaseHistoryEntries: history.length,
    },
    null,
    2,
  ),
);
