import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import {
  currentReleaseMetadataMismatches,
  releaseHistoryNodeId,
  selectCurrentReleaseBoundNodes,
} from "./lib/release-graph.mjs";
import { commitTextFiles } from "./lib/file-transaction.mjs";
import { canonicalizeRdfDocument } from "./lib/rdf-measurement.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((x) => {
    const [k, ...v] = x.replace(/^--/, "").split("=");
    return [k, v.join("=")];
  }),
);
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const refId = (value) => (typeof value === "string" ? value : value?.["@id"]);
const absent = (value, keys, label) => {
  for (const key of keys)
    must(!Object.hasOwn(value, key), `${label} must not define ${key}`);
};
const historyNode = (canonicalUrl, datasetId, entry) => ({
  "@id": releaseHistoryNodeId(canonicalUrl, entry.release),
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
      value: String(entry.recordId),
    },
  ],
  isPartOf: { "@id": datasetId },
  url: `https://doi.org/${entry.versionDoi}`,
});
const replaceExactly = (source, pattern, replacement, label) => {
  const matches = String(source).match(pattern) || [];
  must(
    matches.length === 1,
    `${label} must match exactly once; found ${matches.length}`,
  );
  return String(source).replace(pattern, replacement);
};
const dryRun = args["dry-run"] === "true" || args["dry-run"] === "1";

const [release, pkg, lock, graph, citationSource, codemeta] =
  await Promise.all([
    readJson("src/data/release.json"),
    readJson("package.json"),
    readJson("package-lock.json"),
    readJson("src/data/semantic/knowledge-graph.jsonld"),
    readFile("CITATION.cff", "utf8"),
    readJson("codemeta.json"),
  ]);

const z = release.dataset?.zenodo;
must(
  z && Array.isArray(z.releaseHistory),
  "Zenodo release truth requires releaseHistory[]",
);
const previousHistory = structuredClone(z.releaseHistory);
const old = {
  release: release.release,
  date: release.dateModified,
  recordId: String(z.recordId),
  versionDoi: z.versionDoi,
};
const next = {
  release: args.version,
  date: args.date,
  recordId: String(args["zenodo-record"] || ""),
  versionDoi: args["zenodo-doi"],
};
must(/^\d+\.\d+\.\d+$/.test(next.release || ""), "Invalid --version");
must(/^\d{4}-\d{2}-\d{2}$/.test(next.date || ""), "Invalid --date");
must(/^\d+$/.test(next.recordId), "Invalid --zenodo-record");
must(
  /^10\.5281\/zenodo\.\d+$/.test(next.versionDoi || ""),
  "Invalid --zenodo-doi",
);
must(next.versionDoi !== z.conceptDoi, "Concept DOI cannot be the Version DOI");
if (next.release === old.release) {
  must(
    next.versionDoi === old.versionDoi &&
      next.recordId === old.recordId &&
      next.date === old.date,
    "Idempotent promotion request drifted from current release",
  );
  console.log(
    JSON.stringify(
      { promoted: false, idempotent: true, current: old },
      null,
      2,
    ),
  );
  process.exit(0);
}

const existing = z.releaseHistory.find((x) => x.release === next.release);
if (existing)
  must(
    existing.versionDoi === next.versionDoi &&
      String(existing.recordId) === next.recordId &&
      existing.publicationDate === next.date,
    "Target release already exists with different identity",
  );
else
  z.releaseHistory.push({
    release: next.release,
    recordId: next.recordId,
    versionDoi: next.versionDoi,
    publicationDate: next.date,
  });
z.releaseHistory.sort(
  (a, b) =>
    a.publicationDate.localeCompare(b.publicationDate) ||
    a.release.localeCompare(b.release, undefined, { numeric: true }),
);
z.versionDoi = next.versionDoi;
z.recordId = next.recordId;
release.release = next.release;
release.dateModified = next.date;

pkg.version = next.release;
lock.version = next.release;
if (lock.packages?.[""]) lock.packages[""].version = next.release;

const nodes = graph["@graph"];
must(Array.isArray(nodes), "Canonical graph lacks @graph");
const byId = new Map(nodes.filter((x) => x?.["@id"]).map((x) => [x["@id"], x]));
must(
  byId.size === nodes.filter((x) => x?.["@id"]).length,
  "Canonical graph contains duplicate @id values",
);
const dataset = byId.get(release.dataset.id),
  project = byId.get(
    `${release.canonicalUrl}#doctor-ghezelbaash-structured-data-project`,
  ),
  github = byId.get(`${release.canonicalUrl}#project-github-source`),
  hf = byId.get(`${release.canonicalUrl}#project-huggingface-dataset`),
  zenodo = byId.get(`${release.canonicalUrl}#project-zenodo-release`),
  catalog = byId.get(`${release.canonicalUrl}#data-catalog`);
for (const [name, node] of Object.entries({
  dataset,
  project,
  github,
  hf,
  zenodo,
  catalog,
}))
  must(node, `Canonical graph node missing: ${name}`);

const datasetDescription = [
  "Canonical first-party Dr. Saeed Ghezelbash Public Knowledge Graph Dataset for the physician and supporting clinic.",
  "GitHub is its version-controlled source, Zenodo is immutable DOI preservation, and Hugging Face is its AI/retrieval distribution layer; these access points are related resources, not identity-equivalent entities.",
].join(" ");
const projectDescription = (version) =>
  `Version-controlled source project for Version ${version} of the Dr. Saeed Ghezelbash Public Knowledge Graph. GitHub is source, Zenodo is immutable DOI preservation, and Hugging Face is AI/retrieval distribution.`;
const githubDescription = (version) =>
  `Version-controlled GitHub source for Version ${version} of the canonical Dr. Saeed Ghezelbash Public Knowledge Graph; it is a source repository, not an identity-equivalent Dataset.`;
const hfDescription = (version) =>
  `AI and retrieval distribution of Version ${version} of the physician-owned Dr. Saeed Ghezelbash Public Knowledge Graph, with a release-faithful Core and an evidence-bound canonical-entity resolution matrix.`;
const zenodoDescription = (version) =>
  `Immutable DOI-preserved Version ${version} distribution of the canonical Dr. Saeed Ghezelbash Public Knowledge Graph Dataset.`;
const catalogDescription =
  "First-party machine-readable catalog for the Dr. Saeed Ghezelbash Public Knowledge Graph, preserving physician-first identity and explicit source, preservation and AI/retrieval roles.";
const encodings = [
  "application/ld+json",
  "text/turtle",
  "text/csv",
  "text/plain",
  "application/json",
  "application/xml",
  "application/jsonl",
];

// Static topology is source truth. Promotion rejects drift and advances release-bound values only.
must(
  dataset["@type"] === "Dataset" &&
    dataset.version === old.release &&
    dataset.dateModified === old.date &&
    dataset.description === datasetDescription,
  "Canonical Dataset shape/release drift",
);
absent(dataset, ["sameAs", "url"], "Canonical Dataset");
const expectedIdentifiers = [
  release.dataset.id,
  {
    "@type": "PropertyValue",
    propertyID: "Zenodo Concept DOI",
    name: "Zenodo Concept DOI for the continuing Dataset lineage",
    value: z.conceptDoi,
    url: `https://doi.org/${z.conceptDoi}`,
  },
  {
    "@type": "PropertyValue",
    propertyID: "Zenodo Version DOI",
    name: `Zenodo Version DOI ${old.release}`,
    value: old.versionDoi,
    url: `https://doi.org/${old.versionDoi}`,
  },
];
must(
  isDeepStrictEqual(dataset.identifier, expectedIdentifiers),
  "Canonical Dataset identifier shape/release drift",
);
must(
  project["@type"] === "CreativeWork" &&
    project.version === old.release &&
    project.dateModified === old.date &&
    project.description === projectDescription(old.release),
  "Canonical project shape/release drift",
);
must(
  github["@type"] === "SoftwareSourceCode" &&
    github.version === old.release &&
    github.dateModified === old.date &&
    github.url === release.dataset.github.repository &&
    github.codeRepository === release.dataset.github.repository &&
    refId(github.isPartOf) === project["@id"] &&
    github.description === githubDescription(old.release),
  "Canonical GitHub source shape/release drift",
);
absent(github, ["contentUrl"], "Canonical GitHub source");
must(
  hf["@type"] === "DataDownload" &&
    hf.version === old.release &&
    hf.dateModified === old.date &&
    hf.url === release.dataset.huggingFace.dataset &&
    isDeepStrictEqual(hf.encodingFormat, encodings) &&
    hf.description === hfDescription(old.release),
  "Canonical Hugging Face distribution shape/release drift",
);
absent(
  hf,
  ["contentUrl", "additionalType"],
  "Canonical Hugging Face distribution",
);
must(
  zenodo["@type"] === "DataDownload" &&
    zenodo.version === old.release &&
    zenodo.datePublished === old.date &&
    zenodo.dateModified === old.date &&
    zenodo.name ===
      `Dr. Saeed Ghezelbash Public Knowledge Graph — Zenodo preservation distribution ${old.release}` &&
    zenodo.url === `https://doi.org/${old.versionDoi}` &&
    zenodo.identifier === `DOI:${old.versionDoi}` &&
    zenodo.sameAs === `https://zenodo.org/records/${old.recordId}` &&
    zenodo.description === zenodoDescription(old.release),
  "Canonical Zenodo distribution shape/release drift",
);
absent(
  zenodo,
  ["contentUrl", "codeRepository"],
  "Canonical Zenodo distribution",
);
must(
  catalog["@type"] === "DataCatalog" &&
    catalog.version === old.release &&
    catalog.dateModified === old.date &&
    catalog.name ===
      "Dr. Saeed Ghezelbash Public Knowledge Graph — Data Catalog" &&
    catalog.description === catalogDescription &&
    catalog.url === `${release.canonicalUrl}dcat.ttl`,
  "Canonical DataCatalog shape/release drift",
);

const releaseBound = selectCurrentReleaseBoundNodes(nodes, release.dataset.id);
must(
  releaseBound.length > 0,
  "No current release-bound graph distributions were selected",
);
const releaseBoundDrift = currentReleaseMetadataMismatches(nodes, {
  datasetId: release.dataset.id,
  release: old.release,
  dateModified: old.date,
});
must(
  !releaseBoundDrift.length,
  `Current release-bound graph metadata drift: ${releaseBoundDrift.map((x) => x.id).join(", ")}`,
);
for (const h of previousHistory) {
  const expected = historyNode(release.canonicalUrl, release.dataset.id, h);
  must(
    isDeepStrictEqual(byId.get(expected["@id"]), expected),
    `Release-history graph shape drift: ${h.release}`,
  );
}
const previousCitation = previousHistory.map((h) => ({
  "@id": releaseHistoryNodeId(release.canonicalUrl, h.release),
}));
must(
  isDeepStrictEqual(dataset.citation, previousCitation),
  "Dataset release-history citations drift",
);

dataset.version = next.release;
dataset.dateModified = next.date;
dataset.identifier = [
  expectedIdentifiers[0],
  expectedIdentifiers[1],
  {
    "@type": "PropertyValue",
    propertyID: "Zenodo Version DOI",
    name: `Zenodo Version DOI ${next.release}`,
    value: next.versionDoi,
    url: `https://doi.org/${next.versionDoi}`,
  },
];
project.description = projectDescription(next.release);
github.description = githubDescription(next.release);
hf.description = hfDescription(next.release);
zenodo.name = `Dr. Saeed Ghezelbash Public Knowledge Graph — Zenodo preservation distribution ${next.release}`;
zenodo.url = `https://doi.org/${next.versionDoi}`;
zenodo.identifier = `DOI:${next.versionDoi}`;
zenodo.datePublished = next.date;
zenodo.sameAs = `https://zenodo.org/records/${next.recordId}`;
zenodo.description = zenodoDescription(next.release);
for (const node of [project, github, catalog]) {
  node.version = next.release;
  node.dateModified = next.date;
}
for (const node of releaseBound) {
  node.version = next.release;
  node.dateModified = next.date;
}

if (!existing) {
  const added = historyNode(release.canonicalUrl, release.dataset.id, {
    release: next.release,
    recordId: next.recordId,
    versionDoi: next.versionDoi,
    publicationDate: next.date,
  });
  must(
    !byId.has(added["@id"]),
    `Release-history graph node already exists: ${next.release}`,
  );
  nodes.push(added);
  byId.set(added["@id"], added);
}
dataset.citation = z.releaseHistory.map((h) => ({
  "@id": releaseHistoryNodeId(release.canonicalUrl, h.release),
}));

// Measure the promoted graph before constructing the transaction.
const rdfMeasurement = await canonicalizeRdfDocument(graph);

let citation = citationSource;
citation = replaceExactly(
  citation,
  /^version: .+$/m,
  `version: ${next.release}`,
  "CITATION version",
);
citation = replaceExactly(
  citation,
  /^date-released: .+$/m,
  `date-released: ${next.date}`,
  "CITATION release date",
);
citation = replaceExactly(
  citation,
  /^doi: .+$/m,
  `doi: ${next.versionDoi}`,
  "CITATION DOI",
);
codemeta.softwareVersion = next.release;
codemeta.dateModified = next.date;
must(
  codemeta.subjectOf && typeof codemeta.subjectOf === "object",
  "CodeMeta subjectOf is required for release promotion",
);
codemeta.subjectOf.version = next.release;
codemeta.subjectOf.identifier = `https://doi.org/${next.versionDoi}`;
codemeta.subjectOf.name = "Dr. Saeed Ghezelbash Public Knowledge Graph";

// No repository file is touched before the complete promotion candidate above has been constructed and validated.
const writes = [
  { file: "src/data/release.json", content: json(release) },
  { file: "package.json", content: json(pkg) },
  { file: "package-lock.json", content: json(lock) },
  { file: "src/data/semantic/knowledge-graph.jsonld", content: json(graph) },
  { file: "CITATION.cff", content: citation },
  { file: "codemeta.json", content: json(codemeta) },
];

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        promoted: false,
        dryRun: true,
        prepared: true,
        from: old,
        to: next,
        conceptDoi: z.conceptDoi,
        history: z.releaseHistory,
        releaseBoundNodes: releaseBound.length,
        externalRdfTripleCount: rdfMeasurement.triples,
        files: writes.map((x) => x.file),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const transaction = await commitTextFiles(writes);
console.log(
  JSON.stringify(
    {
      promoted: true,
      transactional: true,
      transactionId: transaction.transactionId,
      from: old,
      to: next,
      conceptDoi: z.conceptDoi,
      history: z.releaseHistory,
      releaseBoundNodes: releaseBound.length,
      externalRdfTripleCount: rdfMeasurement.triples,
      files: transaction.committed,
    },
    null,
    2,
  ),
);
