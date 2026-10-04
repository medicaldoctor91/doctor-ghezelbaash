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

  const legacySources = new Set(legacyAliases.map((row) => row.source));
  assert.deepEqual(
    [...developmentSources].filter((source) => legacySources.has(source)),
    [],
    "A development-only path collides with an explicit legacy alias",
  );
  assert.deepEqual(
    [...developmentSources].filter((source) => canonicalSources.has(source)),
    [],
    "A development-only path collides with a canonical page",
  );

  // Reserve development-only paths while deriving metadata aliases so removing
  // them cannot accidentally expose a different representation on the same URL.
  const reservedSources = new Set(
    [...legacyAliases, ...developmentAliases].map((row) => row.source),
  );
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

  return {
    graph,
    lifecycle,
    canonical,
    legacyAliases,
    answerAliases,
    corpusAliases,
    developmentAliases,
    metadataAliases,
    namespaceAliases,
    finalRows,
    prePruneRows,
  };
}
