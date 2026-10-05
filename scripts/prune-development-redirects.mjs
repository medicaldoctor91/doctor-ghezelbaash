import assert from "node:assert/strict";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { renderStaticRewrites } from "./lib/redirect-registry.mjs";
import { derivePublicRedirectPolicy } from "./lib/public-redirect-policy.mjs";

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] || "dist");
const policy = await derivePublicRedirectPolicy(root);
const developmentSources = new Set(policy.developmentAliases.map((row) => row.source));

const redirectsPath = path.join(dist, "_redirects");
const source = await readFile(redirectsPath, "utf8");
const sourceLines = source.trim().split(/\r?\n/).filter(Boolean);
const sourceRows = sourceLines.map((line) => {
  const [rowSource, target, rawStatus] = line.split(/\s+/);
  return { source: rowSource, target, statusCode: Number(rawStatus) };
});
renderStaticRewrites(sourceRows);

for (const alias of policy.developmentAliases) {
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
for (const sourcePath of policy.neverPublishedDevelopmentPaths) {
  assert(
    !sourceRows.some((row) => row.source === sourcePath),
    `Never-published development path was generated before pruning: ${sourcePath}`,
  );
}

const expectedFinal = renderStaticRewrites(policy.finalRows);
const prunedRows = sourceRows.filter((row) => !developmentSources.has(row.source));
assert.equal(
  renderStaticRewrites(prunedRows),
  expectedFinal,
  "Pruning development aliases changed something outside the reviewed public redirect policy",
);

await writeFile(redirectsPath, expectedFinal, "utf8");
assert.equal(await readFile(redirectsPath, "utf8"), expectedFinal);

console.log(
  JSON.stringify(
    {
      redirectPruning: "PASS",
      removedDevelopmentPaths: policy.removedDevelopmentPaths.length,
      prunedGeneratedDevelopmentAliases: policy.developmentAliases.length,
      neverPublishedDevelopmentPaths: policy.neverPublishedDevelopmentPaths.length,
      removedAnswerAliases: policy.answerAliases.length,
      removedCorpusAliases: policy.corpusAliases.length,
      retainedLegacyAliases: policy.legacyAliases.length,
      retainedMetadataAliases: policy.metadataAliases.length,
      retainedMachineNamespaces: policy.namespaceAliases.length,
      finalRules: policy.finalRows.length,
    },
    null,
    2,
  ),
);
