import assert from "node:assert/strict";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import {
  canonicalPaths,
  redirectRows,
  urlForHtmlId,
} from "../../src/lib/url-architecture.mjs";
import { deriveCanonicalAnswerTopology } from "../../src/lib/answer-projection.mjs";
import {
  canonicalHostAliasRows,
  canonicalMetadataAliasRows,
  loadAliasRegistry,
  machineNamespaceAliasRows,
  renderStaticRewrites,
} from "./redirect-registry.mjs";

const neverPublishedDevelopmentPaths = Object.freeze([
  "/saeed-ghezelbash",
]);

export async function derivePublicRedirectPolicy(root = process.cwd()) {
  const { graph, lifecycle } = readCanonicalInputs(root);
  const canonical = canonicalPaths();
  const canonicalSources = new Set(canonical.filter((route) => route !== "/"));

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
  for (const source of neverPublishedDevelopmentPaths) {
    assert(!developmentSources.has(source), `Never-published path returned to source URL topology: ${source}`);
    assert(!canonicalSources.has(source), `Never-published path became canonical: ${source}`);
  }

  const removedDevelopmentPaths = [
    ...developmentSources,
    ...neverPublishedDevelopmentPaths,
  ];
  assert.equal(
    new Set(removedDevelopmentPaths).size,
    removedDevelopmentPaths.length,
    "Removed development URL inventory contains duplicate paths",
  );

  const legacySources = new Set(legacyAliases.map((row) => row.source));
  assert.deepEqual(
    removedDevelopmentPaths.filter((source) => legacySources.has(source)),
    [],
    "A development-only path collides with an explicit legacy alias",
  );
  assert.deepEqual(
    removedDevelopmentPaths.filter((source) => canonicalSources.has(source)),
    [],
    "A development-only path collides with a canonical page",
  );

  // Reserve every removed development path while deriving metadata aliases so
  // cleanup cannot accidentally expose a different representation on that URL.
  const reservedSources = new Set([
    ...legacyAliases.map((row) => row.source),
    ...removedDevelopmentPaths,
  ]);
  const metadataAliases = canonicalMetadataAliasRows(graph, lifecycle.canonicalUrl).filter(
    ({ source }) => !canonicalSources.has(source) && !reservedSources.has(source),
  );
  const namespaceAliases = machineNamespaceAliasRows();

  const finalRows = [
    ...legacyAliases,
    ...metadataAliases,
    ...namespaceAliases,
  ];
  const prePruneRows = [
    ...legacyAliases,
    ...answerAliases,
    ...corpusAliases,
    ...metadataAliases,
    ...namespaceAliases,
  ];

  renderStaticRewrites(finalRows);
  renderStaticRewrites(prePruneRows);
  for (const source of neverPublishedDevelopmentPaths) {
    assert(!prePruneRows.some((row) => row.source === source), `Never-published path was materialized: ${source}`);
    assert(!finalRows.some((row) => row.source === source), `Never-published path leaked into public policy: ${source}`);
  }

  return {
    graph,
    lifecycle,
    canonical,
    legacyAliases,
    answerAliases,
    corpusAliases,
    developmentAliases,
    neverPublishedDevelopmentPaths,
    removedDevelopmentPaths,
    metadataAliases,
    namespaceAliases,
    finalRows,
    prePruneRows,
  };
}
