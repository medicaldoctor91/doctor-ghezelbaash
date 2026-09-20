import assert from "node:assert/strict";
import { verifyHuggingFaceViewer } from "./lib/hugging-face-viewer.mjs";

const repo = "owner/example";
const configs = [
  {
    name: "entity_facts",
    features: [{ name: "value", type: "string" }, { name: "version", type: "string" }],
    rows: [{ value: "Dr Ghezelbash", version: "1.3.3" }, { value: "Clinic Ghezelbash", version: "1.3.3" }, { value: "", version: "1.2.0" }],
    search: { query: "Ghezelbash" }, filter: { column: "version", value: "1.3.3" },
  },
  {
    name: "query_matrix",
    features: [{ name: "query", type: "string" }, { name: "release", type: "string" }, { name: "refs", type: "list<string>" }],
    rows: [{ query: "Dr Ghezelbash", release: "1.3.3", refs: ["evidence:one", "evidence:two"] }, { query: "Ghezelbash clinic", release: "1.3.3", refs: null }],
    search: { query: "Ghezelbash" }, filter: { column: "release", value: "1.3.3" },
  },
];
const type = (name) => name === "list<string>"
  ? { _type: "List", feature: { _type: "Value", dtype: "string" } }
  : { _type: "Value", dtype: name };
const features = (config) => config.features.map((item, feature_idx) => ({ feature_idx, name: item.name, type: type(item.type) }));
const rows = (config, indices, total = config.rows.length) => ({
  features: features(config), num_rows_total: total, partial: false,
  rows: indices.map((row_idx) => ({ row_idx, row: config.rows[row_idx], truncated_cells: [] })),
});
const inventory = configs.map(({ name }) => ({ dataset: repo, config: name, split: "train" }));
const aggregate = { pending: [], failed: [], partial: false };
function fixture(url) {
  const endpoint = url.pathname.split("/").pop();
  const config = configs.find(({ name }) => name === url.searchParams.get("config"));
  if (endpoint === "is-valid") return { preview: true, viewer: true, search: true, filter: true, statistics: true };
  if (endpoint === "splits") return { ...aggregate, splits: inventory };
  if (endpoint === "parquet") return { ...aggregate, parquet_files: inventory.map((item) => ({ ...item,
    filename: "0000.parquet", size: 200, url: `https://huggingface.co/datasets/${repo}/resolve/refs%2Fconvert%2Fparquet/${item.config}/train/0000.parquet` })) };
  if (endpoint === "size") {
    const sizes = configs.map((item) => ({ dataset: repo, config: item.name, num_rows: item.rows.length, num_columns: item.features.length }));
    return { ...aggregate, size: { dataset: { dataset: repo, num_rows: 5 }, configs: sizes, splits: sizes.map((item) => ({ ...item, split: "train" })) } };
  }
  if (endpoint === "croissant") return { recordSet: configs.flatMap((item) => [
    { "@id": `${item.name}_splits`, dataType: "cr:Split", field: [{ "@id": `${item.name}_splits/split` }] },
    { "@id": item.name, field: item.features.map((field) => ({ source: { extract: { column: field.name } } })) },
  ]) };
  if (endpoint === "first-rows") return { ...rows(config, config.rows.map((_, i) => i)), dataset: repo, config: config.name, split: "train", truncated: true };
  if (endpoint === "rows") return rows(config, [Number(url.searchParams.get("offset"))]);
  if (endpoint === "search" || endpoint === "filter") {
    const indices = config.rows.flatMap((row, index) => (
      endpoint === "search" ? JSON.stringify(row).includes(config.search.query) : row[config.filter.column] === config.filter.value
    ) ? [index] : []);
    return rows(config, indices.slice(0, 3), indices.length);
  }
  if (endpoint === "statistics") return {
    partial: false, num_examples: config.rows.length,
    statistics: config.features.map((feature) => {
      const values = config.rows.map((row) => row[feature.name]);
      const nonNull = values.filter((value) => value !== null);
      const frequencies = Object.fromEntries([...new Set(nonNull)].map((value) => [value, nonNull.filter((item) => item === value).length]));
      return { column_name: feature.name, column_type: feature.type === "string" ? "string_label" : "list", column_statistics: {
        nan_count: values.length - nonNull.length,
        ...(feature.type === "string" ? { frequencies, n_unique: Object.keys(frequencies).length }
          : { min: Math.min(...nonNull.map((value) => value.length)), max: Math.max(...nonNull.map((value) => value.length)) }),
      } };
    }),
  };
  throw new Error(`Unexpected fixture endpoint ${endpoint}`);
}
function run(mutate = () => undefined, options = {}) {
  const counts = new Map();
  const sleeps = [];
  const promise = verifyHuggingFaceViewer({ repo, configs, maxAttempts: 3, retryDelayMs: 1,
    log: () => {}, sleep: async (ms) => { sleeps.push(ms); },
    fetchImpl: async (input) => {
      const url = new URL(input);
      const key = `${url.pathname.split("/").pop()}/${url.searchParams.get("config") || ""}`;
      counts.set(key, (counts.get(key) || 0) + 1);
      const body = structuredClone(fixture(url));
      return mutate({ key, url, body, count: counts.get(key) }) || Response.json(body);
    }, ...options,
  });
  return { promise, counts, sleeps };
}

const healthy = await run().promise;
assert.equal(healthy.status, "PASS");
assert.equal(healthy.configs.length, 2);
assert.equal(healthy.requestCount, 15);

// Regression: global validity and split enumeration can be green while one
// config has failed CSV parsing and no Parquet export. That must never pass.
await assert.rejects(run(({ key, body }) => {
  if (key === "parquet/") { body.parquet_files.pop(); body.failed.push({ config: "query_matrix", kind: "config-parquet" }); }
}).promise, /parquet failed jobs: query_matrix/);
await assert.rejects(run(({ key, body }) => {
  if (key === "size/") body.size.configs[1].num_rows--;
}).promise, /query_matrix size row count/);
await assert.rejects(run(({ key, body }) => {
  if (key === "first-rows/query_matrix") body.features[2].type = type("string");
}).promise, /query_matrix first-rows features/);
await assert.rejects(run(({ key, body }) => {
  if (key === "rows/query_matrix") body.rows[0].row.refs = [];
}).promise, /query_matrix final row row 1/);
await assert.rejects(run(({ key, body }) => {
  if (key === "statistics/query_matrix") body.statistics[2].column_statistics.nan_count = 0;
}).promise, /query_matrix statistics refs null count/);
await assert.rejects(run(({ key, body }) => {
  if (key === "filter/entity_facts") body.rows = rows(configs[0], [2]).rows;
}).promise, /violates query/);
await assert.rejects(run(({ key, body }) => {
  if (key === "croissant/") body.recordSet = body.recordSet.filter((item) => item["@id"] !== "query_matrix");
}).promise, /Croissant data RecordSet missing query_matrix/);

const loading = run(({ key, count }) => {
  if (key === "search/query_matrix" && count < 3)
    return Response.json({ error: "the dataset index is loading, this can take a minute" }, { status: 500 });
});
assert.equal((await loading.promise).readinessRetries, 2);
assert.equal(loading.counts.get("search/query_matrix"), 3);
assert.equal(loading.sleeps.length, 2);
const rebuilding = run(({ key, count }) => {
  if (key === "search/query_matrix" && count === 1)
    return Response.json({ error: "The dataset index is corrupted and being rebuilt: invalid database" },
      { status: 500, headers: { "x-error-code": "UnprocessableIndexError" } });
  if (key === "search/query_matrix" && count === 2)
    return Response.json({ error: "the dataset index is loading, this may take longer than usual" }, { status: 500 });
});
assert.equal((await rebuilding.promise).readinessRetries, 2);
assert.equal(rebuilding.counts.get("search/query_matrix"), 3);
const rebuildExhausted = run(({ key }) => {
  if (key === "search/query_matrix")
    return Response.json({ error: "The dataset index is corrupted and being rebuilt: invalid database" },
      { status: 500, headers: { "x-error-code": "UnprocessableIndexError" } });
});
await assert.rejects(rebuildExhausted.promise, /HF_VIEWER_NOT_READY exhausted=3/);
assert.equal(rebuildExhausted.counts.get("search/query_matrix"), 3);
await assert.rejects(run(({ key, count, body }) => {
  if (key === "search/query_matrix" && count === 1)
    return Response.json({ error: "The dataset index is corrupted and being rebuilt: invalid database" },
      { status: 500, headers: { "x-error-code": "UnprocessableIndexError" } });
  if (key === "search/query_matrix") body.rows[0].row.query = "incorrect result";
}).promise, /query_matrix search row 0 differs from source/);
const wrongEndpointRebuild = run(({ key }) => {
  if (key === "first-rows/query_matrix")
    return Response.json({ error: "The dataset index is corrupted and being rebuilt: invalid database" },
      { status: 500, headers: { "x-error-code": "UnprocessableIndexError" } });
});
await assert.rejects(wrongEndpointRebuild.promise, /HF_VIEWER_INVALID/);
assert.equal(wrongEndpointRebuild.counts.get("first-rows/query_matrix"), 1);
const pending = run(({ key, body, count }) => {
  if (key === "parquet/" && count === 1) body.pending.push({ config: "query_matrix", kind: "config-parquet" });
});
assert.equal((await pending.promise).readinessRetries, 1);
const exhausted = run(({ key }) => {
  if (key === "search/query_matrix") return Response.json({ error: "the dataset index is loading, this can take a minute" }, { status: 500 });
});
await assert.rejects(exhausted.promise, /HF_VIEWER_NOT_READY exhausted=3/);
assert.equal(exhausted.counts.get("search/query_matrix"), 3);

for (const response of [
  () => Response.json({ error: "Cannot extract features", cause_exception: "ParserError" }, { status: 500 }),
  () => Response.json({ error: "Unsupported query" }, { status: 500 }),
  () => Response.json({ error: "Unknown index failure" }, { status: 500, headers: { "x-error-code": "UnprocessableIndexError" } }),
  () => Response.json({ error: "The dataset index is corrupted and being rebuilt: invalid database" },
    { status: 403, headers: { "x-error-code": "UnprocessableIndexError" } }),
  () => new Response("<html>Internal Server Error</html>", { status: 500 }),
  () => Response.json({ error: "the dataset index is loading, this can take a minute" }, { status: 403 }),
]) {
  const failed = run(({ key }) => key === "search/query_matrix" ? response() : undefined);
  await assert.rejects(failed.promise, /HF_VIEWER_INVALID/);
  assert.equal(failed.counts.get("search/query_matrix"), 1);
  assert.equal(failed.sleeps.length, 0);
}
const digest = run(({ key }) => { if (key === "search/query_matrix") throw new Error("Repr-Digest mismatch"); });
await assert.rejects(digest.promise, /Repr-Digest mismatch/);
assert.equal(digest.counts.get("search/query_matrix"), 1);
const staleCache = run(({ key, count }) => {
  if (key === "first-rows/query_matrix" && count === 1)
    return Response.json({ error: "Cannot extract features", cause_exception: "ParserError" },
      { status: 500, headers: { "x-revision": "a".repeat(40) } });
}, { expectedRevision: "b".repeat(40) });
assert.equal((await staleCache.promise).readinessRetries, 1);
const currentParserFailure = run(({ key }) => {
  if (key === "first-rows/query_matrix")
    return Response.json({ error: "Cannot extract features", cause_exception: "ParserError" },
      { status: 500, headers: { "x-revision": "b".repeat(40) } });
}, { expectedRevision: "b".repeat(40) });
await assert.rejects(currentParserFailure.promise, /ParserError/);
assert.equal(currentParserFailure.counts.get("first-rows/query_matrix"), 1);
console.log("HF_VIEWER_VERIFICATION_PASS completeness, schema, lists, source rows, statistics, retrieval, Croissant, retry boundaries");
