import test from "node:test";
import assert from "node:assert/strict";
import { consolidateContentRedirectTargets } from "../lib/redirect-registry.mjs";

const canonicalUrl = "https://www.ghezelbaash.ir/";
const record = (path, indexable, ancestors = []) => ({
  path,
  indexable,
  navigation: { ancestors: ancestors.map((ancestor) => ({ path: ancestor })) },
});

test("permanent redirects bypass NOINDEX descendants while preserving their deep target as a fragment", () => {
  const records = [
    record("/topic", true),
    record("/detail", false, ["/topic"]),
    record("/deep", false, ["/topic", "/detail"]),
    record("/translated", true, ["/topic", "/detail"]),
  ];
  const rows = [
    { source: "/old-detail", target: "/detail", statusCode: 301 },
    { source: "/old-deep", target: "/deep", statusCode: 308 },
    { source: "/old-translated", target: "/translated", statusCode: 301 },
    { source: "/graph", target: "/graph.jsonld", statusCode: 200 },
    { source: "/legacy-home", target: "/", statusCode: 301 },
  ];
  const result = consolidateContentRedirectTargets(rows, records, canonicalUrl);
  assert.equal(result.retargeted, 2);
  assert.deepEqual(result.rows, [
    { source: "/old-detail", target: "/topic#detail", statusCode: 301 },
    { source: "/old-deep", target: "/topic#deep", statusCode: 308 },
    { source: "/old-translated", target: "/translated", statusCode: 301 },
    { source: "/graph", target: "/graph.jsonld", statusCode: 200 },
    { source: "/legacy-home", target: "/", statusCode: 301 },
  ]);
});

test("NOINDEX redirect targets fail closed when no promoted authored ancestor exists", () => {
  const records = [record("/orphan", false)];
  assert.throws(() => consolidateContentRedirectTargets(
    [{ source: "/old-orphan", target: "/orphan", statusCode: 301 }],
    records,
    canonicalUrl,
  ), /no promoted authored ancestor/i);
});

test("redirect consolidation rejects unclassified or duplicate route inventories", () => {
  assert.throws(() => consolidateContentRedirectTargets([], [{ path: "/x", navigation: { ancestors: [] } }], canonicalUrl),
    /uniquely classified authored routes/);
  assert.throws(() => consolidateContentRedirectTargets([], [record("/x", true), record("/x", false)], canonicalUrl),
    /uniquely classified authored routes/);
});
