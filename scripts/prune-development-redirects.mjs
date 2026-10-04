import assert from "node:assert/strict";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { readCanonicalInputs } from "../src/lib/canonical-inputs.mjs";
import {
  canonicalPaths,
  redirectRows,
  urlForHtmlId,
} from "../src/lib/url-architecture.mjs";
import { deriveCanonicalAnswerTopology } from "../src/lib/answer-projection.mjs";
import {
  canonicalHostAliasRows,
  canonicalMetadataAliasRows,
  loadAliasRegistry,
  machineNamespaceAliasRows,
  renderStaticRewrites,
} from "./lib/redirect-registry.mjs";

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] || "dist");
const { graph, lifecycle } = readCanonicalInputs(root);

const legacyAliases = canonicalHostAliasRows(await loadAliasRegistry(root));
const answerAliases = deriveCanonicalAnswerTopology(graph, lifecycle).answers.map(
  (record) => ({
    source: "/" + record.htmlId,
    target: urlForHtmlId(record.htmlId),
    statusCode: 301,
  }),
);
const corpusAliases = redirectRows();
const developmentAliases = [...answerAliases, ...corpusAliases];
const developmentSources = new Set(developmentAliases.map((row) => row.source));
assert.equal(
  developmentSources.size,
  developmentAliases.length,
  "Development-only URL inventory contains duplicate paths",
);

const legacySources = new Set(legacyAliases.map((row) => row.source));
const collisions = [...developmentSources].filter((source) => legacySources.has(source));
assert.deepEqual(
  collisions,
  [],
  "A development-only path collides with an explicit legacy alias",
);

const canonicalSurface = new Set(canonicalPaths());
assert.deepEqual(
  [...developmentSources].filter((source) => canonicalSurface.has(source)),
  [],
  "A development-only path collides with a canonical page",
);

const redirectsPath = path.join(dist, "_redirects");
const source = await readFile(redirectsPath, "utf8");
const sourceLines = source.trim().split(/\r?\n/).filter(Boolean);
const sourceRows = sourceLines.map((line) => {
  const [rowSource, target, rawStatus] = line.split(/\s+/);
  return { source: rowSource, target, statusCode: Number(rawStatus) };
});
renderStaticRewrites(sourceRows);

for (const alias of developmentAliases) {
  assert(
    sourceRows.some(
      (row) =>
        row.source === alias.source &&
        row.target === alias.target &&
        row.statusCode === alias.statusCode,
    ),
    `Expected generated development alias is missing before pruning: ${alias.source}`,
  );
}

const registeredBeforePrune = new Set(
  [...legacyAliases, ...developmentAliases].map((row) => row.source),
);
const contentSources = new Set(canonicalPaths().filter((route) => route !== "/"));
const metadataAliases = canonicalMetadataAliasRows(graph, lifecycle.canonicalUrl).filter(
  ({ source: metadataSource }) =>
    !contentSources.has(metadataSource) &&
    !registeredBeforePrune.has(metadataSource),
);
const namespaceAliases = machineNamespaceAliasRows();
const expectedFinalRows = [
  ...legacyAliases,
  ...metadataAliases,
  ...namespaceAliases,
];
const expectedFinal = renderStaticRewrites(expectedFinalRows);
const prunedRows = sourceRows.filter((row) => !developmentSources.has(row.source));
const pruned = renderStaticRewrites(prunedRows);
assert.equal(
  pruned,
  expectedFinal,
  "Pruning development aliases changed something outside the reviewed public redirect policy",
);

await writeFile(redirectsPath, expectedFinal, "utf8");
assert.equal(await readFile(redirectsPath, "utf8"), expectedFinal);

console.log(
  JSON.stringify(
    {
      redirectPruning: "PASS",
      removedDevelopmentAliases: developmentAliases.length,
      removedAnswerAliases: answerAliases.length,
      removedCorpusAliases: corpusAliases.length,
      retainedLegacyAliases: legacyAliases.length,
      retainedMetadataAliases: metadataAliases.length,
      retainedMachineNamespaces: namespaceAliases.length,
      finalRules: expectedFinalRows.length,
    },
    null,
    2,
  ),
);
