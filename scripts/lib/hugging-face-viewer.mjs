import { isDeepStrictEqual } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const must = (condition, message) => {
  if (!condition) throw new Error(`HF_VIEWER_INVALID ${message}`);
};
class NotReady extends Error {}
const same = (actual, expected, label) =>
  must(isDeepStrictEqual(actual, expected), `${label} differs from source`);
const sorted = (values) => [...values].sort();
const pair = (value) => `${value.config}|${value.split}`;

function featureType(type) {
  if (typeof type === "string") return type.replace(/^list<(.+)>$/, "list[$1]");
  if (Array.isArray(type) && type.length === 1) return `list[${featureType(type[0])}]`;
  if (["List", "Sequence", "LargeList"].includes(type?._type))
    return `list[${featureType(type.feature)}]`;
  if (type?._type === "Value" && typeof type.dtype === "string") return type.dtype;
  throw new Error("HF_VIEWER_INVALID unsupported feature type");
}

function expectedFeatures(config) {
  const features = Array.isArray(config.features)
    ? config.features
    : Object.entries(config.features || {}).map(([name, type]) => ({ name, type }));
  must(features.length > 0, `${config.name} source features missing`);
  const normalized = features.map(({ name, type }) => ({ name, type: featureType(type) }));
  must(new Set(normalized.map(({ name }) => name)).size === normalized.length,
    `${config.name} duplicate source features`);
  return normalized;
}

function verifyFeatures(response, config, label) {
  must(Array.isArray(response.features), `${label} features missing`);
  same(response.features.map(({ name, type }) => ({ name, type: featureType(type) })),
    config.features, `${label} features`);
}

function verifyRows(response, config, label, { exactIndices, predicate, total } = {}) {
  verifyFeatures(response, config, label);
  must(response.partial !== true, `${label} is partial`);
  must(Array.isArray(response.rows) && response.rows.length > 0, `${label} has no rows`);
  if (total !== undefined) same(response.num_rows_total, total, `${label} row count`);
  const indices = response.rows.map(({ row_idx }) => row_idx);
  must(new Set(indices).size === indices.length, `${label} duplicate row indices`);
  if (exactIndices) same(indices, exactIndices, `${label} row indices`);
  for (const item of response.rows) {
    must(Number.isInteger(item.row_idx) && item.row_idx >= 0 && item.row_idx < config.rows.length,
      `${label} invalid row index`);
    same(item.truncated_cells, [], `${label} truncated cells at ${item.row_idx}`);
    same(item.row, config.rows[item.row_idx], `${label} row ${item.row_idx}`);
    if (predicate) must(predicate(item.row), `${label} row ${item.row_idx} violates query`);
  }
}

function completed(response, label) {
  must(Array.isArray(response.failed), `${label} failure inventory missing`);
  must(response.failed.length === 0, `${label} failed jobs: ${response.failed.map((item) => `${item.config || "dataset"}/${item.kind || "unknown"}`).join(",")}`);
  must(Array.isArray(response.pending), `${label} pending inventory missing`);
  if (response.pending.length) throw new NotReady(`${label} pending jobs`);
  must(response.partial !== true, `${label} is partial`);
}

function verifyStatistics(response, config) {
  const label = `${config.name} statistics`;
  must(response.partial === false, `${label} must cover the complete split`);
  same(response.num_examples, config.rows.length, `${label} examples`);
  must(Array.isArray(response.statistics), `${label} columns missing`);
  same(sorted(response.statistics.map((item) => item.column_name)),
    sorted(config.features.map((item) => item.name)), `${label} columns`);
  for (const item of response.statistics) {
    const type = config.features.find(({ name }) => name === item.column_name).type;
    const values = config.rows.map((row) => row[item.column_name]);
    const nonNull = values.filter((value) => value !== null);
    const stats = item.column_statistics;
    must(stats && typeof stats === "object", `${label} missing ${item.column_name}`);
    same(stats.nan_count, values.length - nonNull.length, `${label} ${item.column_name} null count`);
    if (type.startsWith("list[")) {
      same(item.column_type, "list", `${label} ${item.column_name} type`);
      if (nonNull.length) {
        same(stats.min, Math.min(...nonNull.map((value) => value.length)), `${label} ${item.column_name} minimum length`);
        same(stats.max, Math.max(...nonNull.map((value) => value.length)), `${label} ${item.column_name} maximum length`);
      }
    } else if (type === "string") {
      must(["string_label", "string_text", "datetime"].includes(item.column_type),
        `${label} ${item.column_name} is not a string statistic`);
    }
    if (item.column_type === "string_label") {
      const frequencies = Object.create(null);
      for (const value of nonNull) Object.defineProperty(frequencies, value, {
        value: (frequencies[value] ?? 0) + 1, writable: true, configurable: true, enumerable: true,
      });
      same(Object.entries(stats.frequencies || {}).sort(), Object.entries(frequencies).sort(), `${label} ${item.column_name} frequencies`);
      same(stats.n_unique, Object.keys(frequencies).length, `${label} ${item.column_name} distinct values`);
    }
  }
}

function verifyCroissant(response, configs) {
  must(Array.isArray(response.recordSet), "Croissant recordSet missing");
  for (const config of configs) {
    // A split enumeration is metadata, not a dataset config. Match the actual
    // RecordSet and inspect its source columns instead of counting RecordSets.
    const matches = response.recordSet.filter((item) => item["@id"] === config.name);
    must(matches.length === 1 && matches[0].dataType !== "cr:Split",
      `Croissant data RecordSet missing ${config.name}`);
    const fields = matches[0].field;
    must(Array.isArray(fields), `Croissant fields missing ${config.name}`);
    same(sorted(fields.filter((field) => field.source?.extract?.column)
      .map((field) => field.source.extract.column)),
    sorted(config.features.map((field) => field.name)), `Croissant ${config.name} columns`);
  }
}

/** Verify public hosted behavior against complete, locally validated access rows.
 * Authentication is deliberately not sent: public data must work anonymously.
 * Only explicit HF cache/index readiness is retried; parser, authentication,
 * schema, row, digest and unclassified server failures immediately fail closed.
 */
export async function verifyHuggingFaceViewer({
  repo, configs: suppliedConfigs, expectedRevision, fetchImpl = fetch, sleep = delay,
  log = (message) => console.error(message), maxAttempts = 6,
  retryDelayMs = 10000, requestTimeoutMs = 60000,
  baseUrl = "https://datasets-server.huggingface.co",
  croissantUrl = `https://huggingface.co/api/datasets/${repo}/croissant`,
}) {
  must(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo), "invalid repository");
  must(expectedRevision === undefined || /^[a-f0-9]{40}$/.test(expectedRevision), "invalid expected revision");
  must(Number.isInteger(maxAttempts) && maxAttempts >= 1 && maxAttempts <= 10, "invalid retry attempts");
  must(Number.isInteger(retryDelayMs) && retryDelayMs >= 0 && retryDelayMs <= 60000, "invalid retry delay");
  must(Number.isInteger(requestTimeoutMs) && requestTimeoutMs >= 1 && requestTimeoutMs <= 60000, "invalid request timeout");
  must(Array.isArray(suppliedConfigs) && suppliedConfigs.length > 0, "source configs missing");
  const configs = suppliedConfigs.map((config) => {
    must(/^[a-z][a-z0-9_]*$/.test(config.name), "invalid source config name");
    must(Array.isArray(config.rows) && config.rows.length > 0, `${config.name} source rows missing`);
    const features = expectedFeatures(config);
    for (const row of config.rows) same(sorted(Object.keys(row)), sorted(features.map(({ name }) => name)), `${config.name} source row fields`);
    must(typeof config.search?.query === "string" && /^[A-Za-z]{3,}$/.test(config.search.query),
      `${config.name} requires a source-backed single-word Latin search probe`);
    const { column, value } = config.filter || {};
    must(features.some((feature) => feature.name === column && feature.type === "string") && typeof value === "string",
      `${config.name} requires a string equality filter probe`);
    must(config.rows.some((row) => row[column] === value), `${config.name} filter probe has no source rows`);
    must(config.rows.some((row) => Object.values(row).some((item) => typeof item === "string" && item.toLowerCase().includes(config.search.query.toLowerCase()))),
      `${config.name} search probe has no source text`);
    return { ...config, features };
  });
  must(new Set(configs.map(({ name }) => name)).size === configs.length, "duplicate source config");
  const expectedPairs = sorted(configs.map(({ name }) => `${name}|train`));
  const names = sorted(configs.map(({ name }) => name));
  let requestCount = 0;
  let retries = 0;
  const request = async (endpoint, params, validate, fullUrl) => {
    const url = fullUrl || `${baseUrl}/${endpoint}?${new URLSearchParams({ dataset: repo, ...params })}`;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        requestCount++;
        const response = await fetchImpl(url, {
          headers: { "accept": "application/json", "cache-control": "no-cache", "user-agent": "ghezelbaash-hf-viewer-verifier/1.0" },
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
        let body;
        try { body = await response.json(); }
        catch { throw new Error(`HF_VIEWER_INVALID ${endpoint} non-JSON response, status ${response.status}`); }
        must(body && typeof body === "object" && !Array.isArray(body), `${endpoint} invalid JSON object`);
        const revision = response.headers.get("x-revision");
        // The official Dataset Server sends X-Revision for cached responses.
        // A known older revision can still contain the old parser failure; that
        // is cache readiness, never evidence about the newly published commit.
        if (expectedRevision && /^[a-f0-9]{40}$/.test(revision || "") && revision !== expectedRevision &&
            ![401, 403].includes(response.status))
          throw new NotReady(`${endpoint} ${params.config || "dataset"} cached revision ${revision}`);
        if (!response.ok || body.error) {
          const code = response.headers.get("x-error-code") || body.error_code;
          const loading = body.error === "the dataset index is loading, this can take a minute";
          const pending = ["ResponseNotReady", "CachedResponseNotFound"].includes(code);
          if (![401, 403].includes(response.status) && !body.cause_exception && (loading || pending))
            throw new NotReady(`${endpoint} ${params.config || "dataset"} ${loading ? "index loading" : code}`);
          throw new Error(`HF_VIEWER_INVALID ${endpoint} ${params.config || "dataset"} status ${response.status}, code ${code || body.cause_exception || "unclassified"}`);
        }
        validate(body);
        return body;
      } catch (error) {
        if (!(error instanceof NotReady)) throw error;
        if (attempt === maxAttempts) throw new Error(`HF_VIEWER_NOT_READY exhausted=${maxAttempts} ${error.message}`);
        retries++;
        log(`HF_VIEWER_WAIT attempt=${attempt}/${maxAttempts} delayMs=${retryDelayMs} ${error.message}`);
        await sleep(retryDelayMs);
      }
    }
  };
  // Independent aggregate endpoints can be queried concurrently. allSettled
  // drains every request before surfacing a failure so none outlive this check.
  const parallel = async (tasks) => {
    const results = await Promise.allSettled(tasks);
    const failed = results.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
    return results.map((result) => result.value);
  };
  await parallel([
    request("is-valid", {}, (body) => {
      for (const key of ["viewer", "preview", "search", "filter", "statistics"])
        must(body[key] === true, `is-valid ${key} unavailable`);
    }),
    request("splits", {}, (body) => {
      completed(body, "splits");
      must(Array.isArray(body.splits), "splits list missing");
      same(sorted(body.splits.map(pair)), expectedPairs, "split inventory");
      must(body.splits.every((item) => item.dataset === repo), "split repository mismatch");
    }),
    request("parquet", {}, (body) => {
      completed(body, "parquet");
      must(Array.isArray(body.parquet_files), "Parquet files missing");
      same(sorted(new Set(body.parquet_files.map(pair))), expectedPairs, "Parquet config inventory");
      must(new Set(body.parquet_files.map((item) => item.url)).size === body.parquet_files.length, "duplicate Parquet URL");
      for (const item of body.parquet_files) {
        must(item.dataset === repo && Number.isInteger(item.size) && item.size > 0, "Parquet file identity or size invalid");
        const url = new URL(item.url);
        must(url.origin === "https://huggingface.co" && decodeURIComponent(url.pathname).startsWith(`/datasets/${repo}/resolve/`), "Parquet URL outside repository");
      }
    }),
    request("size", {}, (body) => {
      completed(body, "size");
      must(body.size?.dataset?.dataset === repo && Array.isArray(body.size.configs) && Array.isArray(body.size.splits), "size inventory missing");
      same(sorted(body.size.configs.map((item) => item.config)), names, "size config inventory");
      same(sorted(body.size.splits.map(pair)), expectedPairs, "size split inventory");
      same(body.size.dataset.num_rows, configs.reduce((sum, config) => sum + config.rows.length, 0), "dataset row count");
      for (const config of configs) for (const entries of [body.size.configs, body.size.splits]) {
        const entry = entries.find((item) => item.config === config.name);
        must(entry.dataset === repo, `${config.name} size repository mismatch`);
        same(entry.num_rows, config.rows.length, `${config.name} size row count`);
        same(entry.num_columns, config.features.length, `${config.name} size column count`);
      }
    }),
  ]);
  const reports = await parallel(configs.map(async (config) => {
    const params = { config: config.name, split: "train" };
    const matches = config.rows.filter((row) => row[config.filter.column] === config.filter.value).length;
    await parallel([
      request("first-rows", params, (body) => {
        same([body.dataset, body.config, body.split], [repo, config.name, "train"], `${config.name} preview identity`);
        verifyRows(body, config, `${config.name} first-rows`);
        same(body.rows.map((item) => item.row_idx), body.rows.map((_, index) => index), `${config.name} preview sequence`);
      }),
      request("rows", { ...params, offset: config.rows.length - 1, length: 1 }, (body) =>
        verifyRows(body, config, `${config.name} final row`, { exactIndices: [config.rows.length - 1], total: config.rows.length })),
      request("statistics", params, (body) => verifyStatistics(body, config)),
      request("search", { ...params, query: config.search.query, offset: 0, length: 3 }, (body) => {
        verifyRows(body, config, `${config.name} search`, { predicate: (row) => Object.values(row).some((value) =>
          typeof value === "string" && value.toLowerCase().includes(config.search.query.toLowerCase())) });
        must(Number.isInteger(body.num_rows_total) && body.num_rows_total >= body.rows.length,
          `${config.name} search total invalid`);
      }),
      request("filter", { ...params, where: `"${config.filter.column.replaceAll('"', '""')}"='${config.filter.value.replaceAll("'", "''")}'`, offset: 0, length: 3 }, (body) =>
        verifyRows(body, config, `${config.name} filter`, {
          total: matches, predicate: (row) => row[config.filter.column] === config.filter.value,
        })),
    ]);
    return { config: config.name, split: "train", rows: config.rows.length, columns: config.features.length,
      preview: "PASS", finalRow: "PASS", statistics: "PASS", search: "PASS", filter: "PASS" };
  }));
  await request("croissant", {}, (body) => verifyCroissant(body, configs), croissantUrl);
  return { status: "PASS", repo, aggregateInventory: "EXACT", croissant: "PASS", configs: reports, requestCount, readinessRetries: retries };
}
