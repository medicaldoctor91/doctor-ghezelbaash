import { readFile, writeFile } from "node:fs/promises";

const [nextDate] = process.argv.slice(2);
const fail = (message) => {
  throw new Error(message);
};

if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate || "")) {
  fail("Usage: node scripts/set-medical-review.mjs YYYY-MM-DD");
}
const parsed = new Date(`${nextDate}T00:00:00Z`);
if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== nextDate) {
  fail(`Invalid medical-review date: ${nextDate}`);
}

const releasePath = "src/data/release.json";
const graphPath = "src/data/semantic/knowledge-graph.jsonld";
const [releaseRaw, graphRaw] = await Promise.all([
  readFile(releasePath, "utf8"),
  readFile(graphPath, "utf8"),
]);
const release = JSON.parse(releaseRaw);
const graph = JSON.parse(graphRaw);

if (!release?.canonicalUrl || !release?.primaryEntity?.id) {
  fail("Release identity contract is incomplete");
}
if (release.reviewedBy !== release.primaryEntity.id) {
  fail("reviewedBy must remain bound to the canonical physician entity");
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(release.medicalReviewedAt || "")) {
  fail("Current medicalReviewedAt is invalid");
}
if (nextDate < release.medicalReviewedAt) {
  fail(`Medical review date must be monotonic: ${release.medicalReviewedAt} -> ${nextDate}`);
}

const nodes = graph?.["@graph"];
if (!Array.isArray(nodes)) fail("Canonical graph lacks @graph");
const webpageId = `${release.canonicalUrl}#webpage`;
const webpageNodes = nodes.filter((node) => node?.["@id"] === webpageId);
if (webpageNodes.length !== 1) {
  fail(`Expected exactly one canonical WebPage node: ${webpageId}`);
}
const webpage = webpageNodes[0];
if (webpage.lastReviewed !== release.medicalReviewedAt) {
  fail(
    `Medical-review source drift: release=${release.medicalReviewedAt} graph=${webpage.lastReviewed}`,
  );
}

const previous = release.medicalReviewedAt;
release.medicalReviewedAt = nextDate;
webpage.lastReviewed = nextDate;

const releaseOut = `${JSON.stringify(release, null, 2)}\n`;
const graphOut = `${JSON.stringify(graph, null, 2)}\n`;
await Promise.all([
  writeFile(releasePath, releaseOut),
  writeFile(graphPath, graphOut),
]);

const [releaseCheck, graphCheck] = await Promise.all([
  readFile(releasePath, "utf8").then(JSON.parse),
  readFile(graphPath, "utf8").then(JSON.parse),
]);
const graphWebpage = graphCheck["@graph"].find((node) => node?.["@id"] === webpageId);
if (
  releaseCheck.medicalReviewedAt !== nextDate ||
  graphWebpage?.lastReviewed !== nextDate ||
  releaseCheck.reviewedBy !== releaseCheck.primaryEntity.id
) {
  fail("Medical-review read-back verification failed");
}

console.log(
  JSON.stringify(
    {
      medicalReviewUpdated: previous !== nextDate,
      previous,
      current: nextDate,
      reviewedBy: releaseCheck.reviewedBy,
      webpage: webpageId,
      changedFiles: [releasePath, graphPath],
    },
    null,
    2,
  ),
);
