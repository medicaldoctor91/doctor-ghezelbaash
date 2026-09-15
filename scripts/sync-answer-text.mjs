import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import {
  deriveCanonicalAnswerProjection,
  deriveCanonicalAnswerTopology,
  extractVisibleAnswerTexts,
  normalizeProjectedText,
  validateProjectedAnswerHtml,
} from "../src/lib/answer-projection.mjs";

const root = process.cwd();
const graphPath = path.join(root, "src/data/semantic/knowledge-graph.jsonld");
const pagePath = path.join(root, "src/content-source/page.md");
const releasePath = path.join(root, "src/data/release.json");
const write = process.argv.includes("--write");
const check = process.argv.includes("--check") || !write;

const [graphSource, page, release] = await Promise.all([
  readFile(graphPath, "utf8"),
  readFile(pagePath, "utf8"),
  readFile(releasePath, "utf8").then(JSON.parse),
]);
const graph = JSON.parse(graphSource);
const topology = deriveCanonicalAnswerTopology(graph, release);
const visible = extractVisibleAnswerTexts(page, topology);
const visibleById = new Map(
  visible.answers.map((record) => [record.answerId, record.text]),
);
const graphById = new Map(
  graph["@graph"].map((node) => [node["@id"], node]),
);

const drift = [];
for (const record of topology.answers) {
  const node = graphById.get(record.answerId);
  const expected = visibleById.get(record.answerId);
  const actual = normalizeProjectedText(node?.text);
  if (actual !== expected) {
    drift.push(record.answerId);
    if (write) node.text = expected;
  }
}

if (check && drift.length)
  throw new Error(
    `Canonical Answer.text mirror drift (${drift.length}): ${drift.slice(0, 8).join(", ")}`,
  );

if (write && drift.length) {
  await writeFile(graphPath, JSON.stringify(graph, null, 2) + "\n", "utf8");
  const projection = deriveCanonicalAnswerProjection(graph, release);
  validateProjectedAnswerHtml(page, projection);
}

console.log(
  JSON.stringify(
    {
      answerTextAuthority: "src/content-source/page.md",
      graphMirror: "src/data/semantic/knowledge-graph.jsonld#Answer.text",
      answers: topology.answers.length,
      mode: write ? "write" : "check",
      changed: drift.length,
      integrity: "PASS",
    },
    null,
    2,
  ),
);
