import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { assertPerformanceRun, evaluatePerformanceGate, summarizePerformance, summarizeResourceBytes, uniqueResourceTransferBytes } from "./lib/performance-gate.mjs";

const budgets = JSON.parse(await readFile(new URL("../src/data/release-invariants.json", import.meta.url), "utf8"));
const sample = (profile, run) => ({
  profile, run, finalUrl: "http://127.0.0.1:1234/",
  fcp: 400, lcp: 600, cls: 0.01, inp: 16, tbt: 0, scriptDuration: 20,
  javascriptBytes: 10000, cssBytes: 43000, fontBytes: 80000, fontLoadMs: 10,
  initialImageBytes: 30000, interactionWallMs: 100, eventTimingSupported: true,
  observationSupport: { lcp: true, cls: true, longTasks: true },
  fontStatus: "loaded", fontCount: 1,
  document: {
    url: "http://127.0.0.1:1234/", status: 200, contentEncoding: "identity", protocol: "http/1.1",
    transferSize: 1940300, encodedBodySize: 1940000, decodedBodySize: 1940000,
    responseStart: 1, responseEnd: 40,
  },
  initialAssets: { requestCount: 4, transferSize: 74000, encodedBodySize: 72800, decodedBodySize: 72800 },
});
const samples = () => ["mobile", "desktop"].flatMap((profile) => [1, 2, 3].map((run) => sample(profile, run)));

test("budgets and byte evidence are reported independently for both profiles", () => {
  const result = evaluatePerformanceGate(samples(), budgets);
  assert.equal(result.integrity, "PASS");
  assert.equal(result.profiles.mobile.samples, 3);
  assert.equal(result.profiles.desktop.samples, 3);
  assert.equal(result.profiles.mobile.initialPage.transferSize.median, 2014300);
  assert.equal(result.profiles.mobile.document.decodedBodySize.median, 1940000);
  assert.equal(result.profiles.mobile.initialAssets.encodedBodySize.median, 72800);
});

test("a passing pooled median cannot hide a failing mobile median", () => {
  const runs = samples();
  runs.filter(({ profile }) => profile === "mobile").forEach((run, index) => { run.lcp = [600, 3000, 3200][index]; });
  // This is the previous gate's upper-middle pooling rule: it would pass.
  assert.equal(runs.map(({ lcp }) => lcp).sort((a, b) => a - b)[3], 600);
  const result = evaluatePerformanceGate(runs, budgets);
  assert.equal(result.integrity, "FAIL");
  assert.deepEqual(result.failures, [{ profile: "mobile", metric: "lcp", median: 3000, budget: 2500 }]);
});

test("FCP has its own gate even when LCP still passes", () => {
  const runs = samples();
  runs.filter(({ profile }) => profile === "mobile").forEach((run) => { run.fcp = 1900; run.lcp = 2000; });
  const result = evaluatePerformanceGate(runs, budgets);
  assert.deepEqual(result.failures, [{ profile: "mobile", metric: "fcp", median: 1900, budget: 1800 }]);
});

test("missing, zero and invalid paint timings never become passing zeros", () => {
  for (const key of ["fcp", "lcp"]) for (const value of [undefined, null, NaN, Infinity, "400", 0, -1]) {
    const run = sample("mobile", 1);
    run[key] = value;
    assert.throws(() => assertPerformanceRun(run), new RegExp(key));
  }
  const run = sample("mobile", 1);
  delete run.scriptDuration;
  assert.throws(() => assertPerformanceRun(run), /scriptDuration/);
});

test("unavailable observers cannot silently pass using their initial zero", () => {
  for (const key of ["lcp", "cls", "longTasks"]) {
    const run = sample("mobile", 1);
    run.observationSupport[key] = false;
    assert.throws(() => assertPerformanceRun(run), /observer unavailable/);
  }
});

test("missing, incomplete or zero-byte document evidence fails closed", () => {
  for (const value of [undefined, null, {}]) {
    const run = sample("mobile", 1);
    run.document = value;
    assert.throws(() => assertPerformanceRun(run), /document/);
  }
  for (const key of ["transferSize", "encodedBodySize", "decodedBodySize"]) {
    for (const value of [undefined, null, 0, NaN, "1940000", -1]) {
      const run = sample("mobile", 1);
      run.document[key] = value;
      assert.throws(() => assertPerformanceRun(run), /document/);
    }
  }
  const run = sample("mobile", 1);
  run.document.responseEnd = 0;
  assert.throws(() => assertPerformanceRun(run), /document timing/);
});

test("cold-cache body timing cannot be replaced by another byte field", () => {
  const run = sample("mobile", 1);
  run.document.transferSize = 0;
  assert.throws(() => assertPerformanceRun(run), /transferSize/);
  run.document.transferSize = 10;
  assert.throws(() => assertPerformanceRun(run), /transfer smaller/);
});

test("resource accounting preserves zero transfer and counts repeated downloads", () => {
  const downloaded = { name: "http://localhost/same.css", transferSize: 1300, encodedBodySize: 1000, decodedBodySize: 4000 };
  const cached = { ...downloaded, transferSize: 0 };
  assert.deepEqual(summarizeResourceBytes([downloaded, downloaded, cached]), {
    requestCount: 3, transferSize: 2600, encodedBodySize: 3000, decodedBodySize: 12000,
  });
  assert.throws(() => summarizeResourceBytes([{ ...downloaded, transferSize: undefined }]), /transferSize/);
  assert.equal(uniqueResourceTransferBytes([cached, downloaded, downloaded]), 1300);
  assert.equal(uniqueResourceTransferBytes([cached]), 0);
});

test("missing profiles, duplicate runs and missing budgets cannot pass", () => {
  assert.throws(() => evaluatePerformanceGate(samples().filter(({ profile }) => profile === "desktop"), budgets), /mobile/);
  const runs = samples();
  runs[1].run = 1;
  assert.throws(() => evaluatePerformanceGate(runs, budgets), /distinct samples/);
  assert.throws(() => evaluatePerformanceGate(samples(), { ...budgets, maxFcpMs: undefined }), /maxFcpMs/);
});

test("gate decisions retain precision rather than rounding away regressions", () => {
  const runs = samples();
  runs.filter(({ profile }) => profile === "mobile").forEach((run) => { run.cls = 0.104; });
  assert.equal(evaluatePerformanceGate(runs, budgets).integrity, "FAIL");
  assert.deepEqual(summarizePerformance([1, 2, 3]), { median: 2, min: 1, max: 3 });
  assert.throws(() => summarizePerformance([]), /empty/);
});
