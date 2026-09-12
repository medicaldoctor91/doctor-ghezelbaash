// This gate covers observed local regressions, not Lighthouse's simulated score
// or real-user Core Web Vitals. Keep form factors separate throughout scoring.
export const PERFORMANCE_PROFILES = [
  { id: "mobile", viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true },
  { id: "desktop", viewport: { width: 1440, height: 936 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];
export const PERFORMANCE_SAMPLES = 3;

const budgetMetrics = {
  fcp: "maxFcpMs",
  lcp: "maxLcpMs",
  cls: "maxCls",
  inp: "maxInpMs",
  tbt: "maxTbtMs",
  scriptDuration: "maxScriptDurationMs",
  javascriptBytes: "maxJavaScriptBytes",
  cssBytes: "maxDeferredCssBytes",
  fontBytes: "maxFontBytes",
  fontLoadMs: "maxFontLoadMs",
  initialImageBytes: "maxInitialImageBytes",
};
const finite = (value, positive = false) =>
  Number.isFinite(value) && (positive ? value > 0 : value >= 0);
const invalid = (message) => { throw new Error(`Invalid performance evidence: ${message}`); };

function assertBytes(value, label, positive = false) {
  if (!Number.isSafeInteger(value) || !finite(value, positive)) invalid(label);
}

export function summarizeResourceBytes(resources) {
  if (!Array.isArray(resources)) invalid("missing resource inventory");
  const totals = { requestCount: resources.length, transferSize: 0, encodedBodySize: 0, decodedBodySize: 0 };
  for (const [index, resource] of resources.entries()) {
    for (const key of ["transferSize", "encodedBodySize", "decodedBodySize"]) {
      assertBytes(resource?.[key], `resource ${index} ${key}`);
      // Count each observed request, including repeated URLs. A cached response
      // can legitimately report zero transfer; never substitute decoded bytes.
      totals[key] += resource[key];
    }
  }
  return totals;
}

export function uniqueResourceTransferBytes(resources) {
  summarizeResourceBytes(resources);
  const assets = new Map();
  for (const resource of resources) {
    if (typeof resource.name !== "string" || !resource.name) invalid("resource URL");
    // Preserve the pre-existing unique-asset budget. Taking the largest actual
    // transfer prevents an earlier cache entry from hiding a later download.
    assets.set(resource.name, Math.max(assets.get(resource.name) ?? 0, resource.transferSize));
  }
  return [...assets.values()].reduce((sum, bytes) => sum + bytes, 0);
}

export function assertPerformanceRun(run) {
  const label = `${run?.profile ?? "unknown"} run ${run?.run ?? "unknown"}`;
  if (!PERFORMANCE_PROFILES.some(({ id }) => id === run?.profile)) invalid(`${label}: unknown profile`);
  if (!Number.isInteger(run.run) || run.run < 1 || run.run > PERFORMANCE_SAMPLES) invalid(`${label}: sample number`);
  for (const key of [...Object.keys(budgetMetrics), "interactionWallMs"]) {
    if (!finite(run[key], key === "fcp" || key === "lcp")) invalid(`${label}: missing or invalid ${key}`);
  }
  if (run.eventTimingSupported !== true) invalid(`${label}: Event Timing API unavailable`);
  for (const key of ["lcp", "cls", "longTasks"])
    if (run.observationSupport?.[key] !== true) invalid(`${label}: ${key} observer unavailable`);
  if (run.fontStatus !== "loaded" || !Number.isInteger(run.fontCount) || run.fontCount < 1)
    invalid(`${label}: font loading did not settle`);
  if (typeof run.finalUrl !== "string" || !/^https?:\/\//u.test(run.finalUrl)) invalid(`${label}: final URL`);
  const document = run.document;
  if (!document || document.url !== run.finalUrl || document.status !== 200)
    invalid(`${label}: missing or invalid main document`);
  if (typeof document.contentEncoding !== "string" || !document.contentEncoding ||
      typeof document.protocol !== "string" || !document.protocol)
    invalid(`${label}: document response conditions`);
  for (const key of ["transferSize", "encodedBodySize", "decodedBodySize"])
    assertBytes(document[key], `${label}: document ${key}`, true);
  if (document.transferSize < document.encodedBodySize) invalid(`${label}: document transfer smaller than body`);
  if (!finite(document.responseStart, true) || !finite(document.responseEnd, true) ||
      document.responseEnd < document.responseStart) invalid(`${label}: incomplete document timing`);
  if (!run.initialAssets || !Number.isSafeInteger(run.initialAssets.requestCount) || run.initialAssets.requestCount < 0)
    invalid(`${label}: initial asset inventory`);
  for (const key of ["transferSize", "encodedBodySize", "decodedBodySize"])
    assertBytes(run.initialAssets[key], `${label}: initial assets ${key}`);
}

export function summarizePerformance(values) {
  if (!values.length || values.some((value) => !finite(value))) invalid("empty or invalid metric samples");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  // Do not round before evaluating a budget (notably CLS near 0.1).
  return {
    median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    min: sorted[0],
    max: sorted.at(-1),
  };
}

export function evaluatePerformanceGate(runs, budgets) {
  if (!Array.isArray(runs)) invalid("runs must be an array");
  for (const [metric, key] of Object.entries(budgetMetrics))
    if (!finite(budgets?.[key], true)) invalid(`missing or invalid budget ${key} for ${metric}`);
  for (const run of runs) assertPerformanceRun(run);
  const profiles = {};
  const failures = [];
  for (const profile of PERFORMANCE_PROFILES) {
    const samples = runs.filter((run) => run.profile === profile.id);
    if (samples.length !== PERFORMANCE_SAMPLES || new Set(samples.map(({ run }) => run)).size !== PERFORMANCE_SAMPLES)
      invalid(`${profile.id}: expected ${PERFORMANCE_SAMPLES} distinct samples`);
    const metrics = Object.fromEntries(
      [...Object.keys(budgetMetrics), "interactionWallMs"].map((key) => [key, summarizePerformance(samples.map((run) => run[key]))]),
    );
    for (const [metric, key] of Object.entries(budgetMetrics)) {
      if (metrics[metric].median > budgets[key])
        failures.push({ profile: profile.id, metric, median: metrics[metric].median, budget: budgets[key] });
    }
    const byteSummary = (key) => Object.fromEntries(
      ["transferSize", "encodedBodySize", "decodedBodySize"].map((field) =>
        [field, summarizePerformance(samples.map((run) => run[key][field]))]),
    );
    profiles[profile.id] = {
      ...profile,
      samples: samples.length,
      metrics,
      document: byteSummary("document"),
      initialAssets: byteSummary("initialAssets"),
      initialPage: Object.fromEntries(["transferSize", "encodedBodySize", "decodedBodySize"].map((field) =>
        [field, summarizePerformance(samples.map((run) => run.document[field] + run.initialAssets[field]))])),
    };
  }
  return { profiles, failures, integrity: failures.length ? "FAIL" : "PASS" };
}
