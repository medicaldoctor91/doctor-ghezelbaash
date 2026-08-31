import path from "node:path";
import { readFile } from "node:fs/promises";
import { deriveCanonicalSemanticSets } from "../src/lib/semantic-projection.mjs";

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] || "dist");
const release = JSON.parse(
  await readFile(path.join(root, "src/data/release.json"), "utf8"),
);
const graph = JSON.parse(
  await readFile(
    path.join(root, "src/data/semantic/knowledge-graph.jsonld"),
    "utf8",
  ),
);
const { services } = deriveCanonicalSemanticSets(graph, release);
const fail = (message) => {
  throw new Error(message);
};
const readDistJson = async (file) =>
  JSON.parse(await readFile(path.join(dist, file), "utf8"));
const Z = release.dataset.zenodo;
const history = Z.releaseHistory;
const datasetLandingPage = `https://doi.org/${Z.versionDoi}`;

if (
  !Array.isArray(history) ||
  !history.length ||
  history.some(
    (entry) =>
      typeof entry?.publicationDate !== "string" || !entry.publicationDate,
  )
)
  fail("Release history lacks a publication date");
const currentHistory = history.find(
  (entry) => entry.release === release.release,
);
if (
  !currentHistory ||
  currentHistory.versionDoi !== Z.versionDoi ||
  String(currentHistory.recordId) !== String(Z.recordId) ||
  currentHistory.publicationDate !== release.dateModified
)
  fail("Current release/history identity drift");

const serviceIds = new Set(services.map((item) => item.id));
if (!serviceIds.size) fail("Graph-derived offered-service set is empty");

const matrix = JSON.parse(
  await readFile(
    path.join(root, ".generated/projections/current-release-matrix.json"),
    "utf8",
  ),
);
const dataPackage = await readDistJson("datapackage.json");
const croissant = await readDistJson("croissant.json");

const expectedMatrix = {
  release: release.release,
  conceptDoi: Z.conceptDoi,
  versionDoi: Z.versionDoi,
  recordId: String(Z.recordId),
  datasetIri: release.dataset.id,
  personWikidata: release.primaryEntity.wikidata,
  clinicWikidata: release.dataset.supportingClinicWikidata,
};
for (const [key, value] of Object.entries(expectedMatrix))
  if (String(matrix[key]) !== String(value))
    fail(`Current matrix ${key} drift`);
if (
  matrix.servicesWithAliasCoverage !== serviceIds.size ||
  matrix.serviceCount !== serviceIds.size
)
  fail(
    `Service retrieval coverage drift matrix=${matrix.servicesWithAliasCoverage}/${matrix.serviceCount} derived=${serviceIds.size}`,
  );

if (
  dataPackage.version !== release.release ||
  !String(dataPackage.title || "").startsWith(release.dataset.name) ||
  dataPackage.homepage !== datasetLandingPage
)
  fail("Data Package current identity/landing-page drift");
if (
  croissant.version !== release.release ||
  croissant.name !== release.dataset.name ||
  croissant.url !== datasetLandingPage
)
  fail("Croissant current identity/landing-page drift");

const dcat = await readFile(path.join(dist, "dcat.ttl"), "utf8");
if (
  !dcat.includes(release.dataset.name) ||
  !dcat.includes(release.release) ||
  !dcat.includes(`dcat:landingPage <${datasetLandingPage}>`)
)
  fail("DCAT current Dataset/release/landing-page identity drift");
for (const file of ["answers.txt", "llms.txt", "llms-full.txt", "index.md"]) {
  const text = await readFile(path.join(dist, file), "utf8");
  if (!text.includes(release.release))
    fail(`Current release marker missing from ${file}`);
}

console.log(
  JSON.stringify({
    currentContextScanner: "PASS",
    release: release.release,
    conceptDoi: Z.conceptDoi,
    versionDoi: Z.versionDoi,
    recordId: String(Z.recordId),
    history: history.map((entry) => entry.release),
    offeredServiceCount: serviceIds.size,
    serviceCoverage: `${matrix.servicesWithAliasCoverage}/${matrix.serviceCount}`,
  }),
);
