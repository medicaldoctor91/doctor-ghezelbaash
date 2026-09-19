#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

const MAX_ATTEMPTS = 4;
const FETCH_TIMEOUT_MS = 45_000;
const PROCESS_TIMEOUT_MS = 60_000;
const MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const BACKOFF_MS = [5_000, 10_000, 20_000];
const TRANSIENT_PATTERNS = [
  /\b(?:EAI_AGAIN|ECONNRESET|ECONNREFUSED|ENETUNREACH|ETIMEDOUT)\b/i,
  /\b(?:429|502|503|504)\b[\s\S]{0,80}\b(?:rate limit|bad gateway|service unavailable|gateway timeout|too many requests)\b/i,
  /\b(?:bad gateway|service unavailable|gateway timeout|too many requests)\b/i,
  /\b(?:network timeout|socket hang up|fetch failed|temporary failure)\b/i,
  /invalid json response body at [^\n]*\/security\/advisories\/bulk/i,
];

const npmExecutable = () => (process.platform === "win32" ? "npm.cmd" : "npm");

// npm audit is powered by the GitHub Advisory Database. During an npm
// transport outage, query that same primary database for every locked version.
// https://github.blog/security/supply-chain-security/github-advisory-database-now-powers-npm-audit/
// https://docs.github.com/en/rest/security-advisories/global-advisories
const advisoryFailure = (message) => {
  throw new Error(`DEPENDENCY_ADVISORY_FAIL_CLOSED: ${message}`);
};
const requireAdvisory = (condition, message) => {
  if (!condition) advisoryFailure(message);
};

function lockedPackages(raw) {
  const lock = JSON.parse(raw);
  requireAdvisory(lock.lockfileVersion === 3 && lock.packages &&
    typeof lock.packages === "object" && !Array.isArray(lock.packages), "unsupported lockfile");
  const packages = new Map();
  let entries = 0;
  for (const [location, item] of Object.entries(lock.packages)) {
    if (location === "") continue;
    requireAdvisory(location.startsWith("node_modules/") && item &&
      typeof item === "object" && !item.link && !item.inBundle, `unsupported locked entry ${location}`);
    const name = item.name || location.split("node_modules/").at(-1);
    requireAdvisory(typeof name === "string" && /^(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/i.test(name),
      `invalid package name ${location}`);
    requireAdvisory(typeof item.version === "string" &&
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(item.version),
      `unpinned package version ${name}`);
    let resolved;
    try { resolved = new URL(item.resolved); } catch { advisoryFailure(`missing registry source ${name}`); }
    requireAdvisory(resolved.origin === "https://registry.npmjs.org" && !resolved.username &&
      !resolved.password && typeof item.integrity === "string" &&
      /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/.test(item.integrity), `unsupported registry/integrity ${name}`);
    entries++;
    packages.set(`${name}@${item.version}`, { name, version: item.version });
  }
  requireAdvisory(entries > 0, "empty package inventory");
  return { entries, packages: [...packages.values()].sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)),
  lockSha256: createHash("sha256").update(raw).digest("hex") };
}

function advisoryUrl(packages, type) {
  return new URL(`https://api.github.com/advisories?${new URLSearchParams({
    ecosystem: "npm", type, is_withdrawn: "false", per_page: "100",
    affects: packages.map(({ name, version }) => `${name}@${version}`).join(","),
  })}`);
}

function nextAdvisoryPage(link, current, first) {
  if (!link) return null;
  const parts = link.split(/,\s*(?=<)/);
  const parsed = parts.map((part) => {
    const match = /^<([^>]+)>;\s*rel="([a-z]+)"$/.exec(part.trim());
    requireAdvisory(match, "malformed pagination header");
    return { url: match[1], relation: match[2] };
  });
  const next = parsed.filter(({ relation }) => relation === "next");
  requireAdvisory(next.length <= 1, "duplicate pagination cursor");
  if (!next.length) return null;
  const url = new URL(next[0].url, current);
  requireAdvisory(url.origin === first.origin && url.pathname === first.pathname &&
    !url.username && !url.password && !url.hash, "pagination left the primary advisory endpoint");
  for (const [key, value] of first.searchParams)
    requireAdvisory(url.searchParams.getAll(key).length === 1 && url.searchParams.get(key) === value,
      `pagination changed query ${key}`);
  requireAdvisory([...url.searchParams.keys()].every((key) => first.searchParams.has(key) ||
    ["after", "before"].includes(key)), "unknown pagination parameter");
  requireAdvisory(url.href !== current.href, "pagination did not advance");
  return url;
}

async function auditGitHubDependencies({
  lockText, fetchFn = fetch, token = process.env.GH_TOKEN, logger = console,
} = {}) {
  const inventory = lockedPackages(lockText ?? await readFile("package-lock.json", "utf8"));
  const batches = [];
  for (const item of inventory.packages) {
    let batch = batches.at(-1);
    if (!batch || batch.length >= 80 || advisoryUrl([...batch, item], "reviewed").href.length > 3500) {
      batch = []; batches.push(batch);
    }
    batch.push(item);
    requireAdvisory(advisoryUrl(batch, "reviewed").href.length <= 3500, "package query exceeds URL budget");
  }
  const findings = new Map();
  let requests = 0;
  for (const batch of batches) {
    const names = new Set(batch.map(({ name }) => name));
    // The REST default excludes malware; explicitly include it so a malicious
    // locked package cannot become a clean result through that default filter.
    for (const type of ["reviewed", "malware"]) {
      const first = advisoryUrl(batch, type), visited = new Set();
      let url = first;
      while (url) {
        requireAdvisory(!visited.has(url.href) && visited.size < 100, "pagination cycle or excessive pages");
        visited.add(url.href); requests++;
        const response = await fetchFn(url.href, {
          redirect: "error", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10",
            "User-Agent": "ghezelbaash-dependency-advisory-gate/1.0", "Cache-Control": "no-cache",
            ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        requireAdvisory(response.status === 200, `GitHub advisory HTTP ${response.status}`);
        const rows = await response.json();
        requireAdvisory(Array.isArray(rows) && rows.length <= 100, "invalid advisory result page");
        for (const item of rows) {
          requireAdvisory(item && /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(item.ghsa_id) &&
            item.type === type && item.withdrawn_at === null &&
            ["low", "medium", "high", "critical"].includes(item.severity), "invalid or unknown-severity advisory");
          requireAdvisory(Array.isArray(item.vulnerabilities) && item.vulnerabilities.length > 0 &&
            item.vulnerabilities.every((entry) => entry?.package && typeof entry.package.name === "string" &&
              typeof entry.package.ecosystem === "string" && typeof entry.vulnerable_version_range === "string") &&
            item.vulnerabilities.some((entry) => entry.package.ecosystem === "npm" && names.has(entry.package.name)),
          `advisory package coverage mismatch ${item.ghsa_id}`);
          const previous = findings.get(item.ghsa_id);
          requireAdvisory(!previous || (previous.type === item.type && previous.severity === item.severity),
            `advisory changed during scan ${item.ghsa_id}`);
          findings.set(item.ghsa_id, { type: item.type, severity: item.severity });
        }
        url = nextAdvisoryPage(response.headers.get("link"), url, first);
      }
    }
  }
  const counts = { low: 0, moderate: 0, high: 0, critical: 0, malware: 0 };
  for (const item of findings.values()) {
    counts[item.severity === "medium" ? "moderate" : item.severity]++;
    if (item.type === "malware") counts.malware++;
  }
  if (counts.high || counts.critical || counts.malware)
    throw new Error(`DEPENDENCY_AUDIT_VULNERABILITIES source=github-advisory-database high=${counts.high} critical=${counts.critical} malware=${counts.malware} advisories=${[...findings.keys()].join(",")}`);
  logger.log(`DEPENDENCY_AUDIT_PASS source=github-advisory-database coverage=all-locked-versions locked_entries=${inventory.entries} unique_versions=${inventory.packages.length} high=0 critical=0 malware=0 requests=${requests} lock_sha256=${inventory.lockSha256}`);
  return { ...counts, ...inventory, requests };
}

function parseJsonObject(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first === -1 || last <= first) return null;
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}

function vulnerabilityCounts(report) {
  const values = report?.metadata?.vulnerabilities;
  if (!values || typeof values !== "object") return null;
  const count = (name) => {
    const value = Number(values[name] ?? 0);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  };
  return {
    info: count("info"),
    low: count("low"),
    moderate: count("moderate"),
    high: count("high"),
    critical: count("critical"),
    total: count("total"),
  };
}

function classifyAuditResult({ code, stdout = "", stderr = "", timedOut = false }) {
  const report = parseJsonObject(stdout);
  const counts = vulnerabilityCounts(report);
  const combined = `${stdout}\n${stderr}\n${
    report?.error ? JSON.stringify(report.error) : ""
  }`;

  if (counts && (counts.high > 0 || counts.critical > 0))
    return { kind: "vulnerable", counts };
  if (/\b(?:E401|E403|E404|E400|EAUTH|ENEEDAUTH|ELOCKVERIFY|EUSAGE|401 Unauthorized|403 Forbidden|HTTP 401|HTTP 403)\b/i.test(combined))
    return { kind: "terminal", counts };
  if (code === 0 && counts) return { kind: "pass", counts };
  if (timedOut || TRANSIENT_PATTERNS.some((pattern) => pattern.test(combined)))
    return { kind: "transient", counts };
  return { kind: "terminal", counts };
}

function conciseReason({ stdout, stderr, timedOut }) {
  if (timedOut) return `process timeout after ${PROCESS_TIMEOUT_MS}ms`;
  const lines = `${stderr}\n${stdout}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.at(-1) || "unknown audit failure").slice(0, 240);
}

function runAuditAttempt() {
  const args = [
    "audit",
    "--audit=true",
    "--audit-level=high",
    "--json",
    "--fetch-retries=0",
    `--fetch-timeout=${FETCH_TIMEOUT_MS}`,
  ];
  const env = {
    ...process.env,
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
  };

  return new Promise((resolve) => {
    execFile(
      npmExecutable(),
      args,
      {
        encoding: "utf8",
        env,
        killSignal: "SIGTERM",
        maxBuffer: MAX_BUFFER_BYTES,
        timeout: PROCESS_TIMEOUT_MS,
      },
      (error, stdout, stderr) => {
        resolve({
          code: typeof error?.code === "number" ? error.code : error ? 1 : 0,
          stdout: stdout || "",
          stderr: `${stderr || ""}${
            error && typeof error.code === "string" ? `\n${error.code}` : ""
          }`,
          timedOut: Boolean(error?.killed || error?.signal === "SIGTERM"),
        });
      },
    );
  });
}

function printFailureOutput(result) {
  if (result.stdout.trim()) process.stderr.write(`${result.stdout.trim()}\n`);
  if (result.stderr.trim()) process.stderr.write(`${result.stderr.trim()}\n`);
}

async function auditDependencies({
  runAttempt = runAuditAttempt,
  sleepFn = sleep,
  maxAttempts = MAX_ATTEMPTS,
  backoffMs = BACKOFF_MS,
  logger = console,
  emitFailure = printFailureOutput,
  fallbackAudit = auditGitHubDependencies,
} = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runAttempt();
    const classification = classifyAuditResult(result);

    if (classification.kind === "pass") {
      logger.log(
        `DEPENDENCY_AUDIT_PASS attempt=${attempt} high=${classification.counts.high} critical=${classification.counts.critical}`,
      );
      return;
    }
    if (classification.kind === "vulnerable") {
      emitFailure(result);
      throw new Error(
        `DEPENDENCY_AUDIT_VULNERABILITIES high=${classification.counts.high} critical=${classification.counts.critical}`,
      );
    }
    if (classification.kind === "terminal") {
      emitFailure(result);
      throw new Error(
        `DEPENDENCY_AUDIT_TERMINAL_FAILURE: ${conciseReason(result)}`,
      );
    }
    if (attempt === maxAttempts) {
      emitFailure(result);
      if (fallbackAudit) {
        logger.warn("DEPENDENCY_AUDIT_FALLBACK source=github-advisory-database reason=npm-transient-exhaustion");
        await fallbackAudit({ logger });
        return;
      }
      throw new Error(
        `DEPENDENCY_AUDIT_UNAVAILABLE_FAIL_CLOSED attempts=${maxAttempts}: ${conciseReason(result)}`,
      );
    }

    const delay = backoffMs[attempt - 1] ?? backoffMs.at(-1) ?? 0;
    logger.warn(
      `DEPENDENCY_AUDIT_TRANSIENT_RETRY attempt=${attempt}/${maxAttempts} backoff_ms=${delay}: ${conciseReason(result)}`,
    );
    await sleepFn(delay);
  }
}

async function selfTest() {
  const report = ({ moderate = 0, high = 0, critical = 0 } = {}) =>
    JSON.stringify({
      auditReportVersion: 2,
      vulnerabilities: {},
      metadata: {
        vulnerabilities: {
          info: 0,
          low: 0,
          moderate,
          high,
          critical,
          total: moderate + high + critical,
        },
      },
    });
  const clean = { code: 0, stdout: report(), stderr: "", timedOut: false };
  const transient = {
    code: 1,
    stdout: "",
    stderr: "503 Service Unavailable",
    timedOut: false,
  };
  const vulnerable = {
    code: 1,
    stdout: report({ high: 1 }),
    stderr: "",
    timedOut: false,
  };
  const terminal = {
    code: 1,
    stdout: "",
    stderr: "401 Unauthorized\nnpm error audit endpoint returned an error",
    timedOut: false,
  };
  const ambiguousEndpointFailure = {
    code: 1,
    stdout: "",
    stderr: "npm error audit endpoint returned an error",
    timedOut: false,
  };

  for (const [expected, result] of [
    ["pass", clean],
    ["pass", { ...clean, stdout: report({ moderate: 1 }) }],
    ["vulnerable", vulnerable],
    ["transient", transient],
    ["transient", { ...transient, stderr: "network timeout" }],
    ["transient", { ...transient, stderr: "", timedOut: true }],
    ["terminal", terminal],
    ["terminal", { ...terminal, stderr: "npm error code E401\nfetch failed\n503 Service Unavailable" }],
    ["terminal", { ...terminal, stderr: "HTTP 403 Forbidden\nnetwork timeout", timedOut: true }],
    ["terminal", ambiguousEndpointFailure],
    [
      "transient",
      {
        ...transient,
        stderr:
          "invalid json response body at https://registry.npmjs.org/-/npm/v1/security/advisories/bulk",
      },
    ],
    ["terminal", { ...clean, stdout: "not-json" }],
  ])
    assert.equal(classifyAuditResult(result).kind, expected);

  const quietLogger = { log() {}, warn() {} };
  const options = {
    sleepFn: async () => {},
    maxAttempts: 4,
    backoffMs: [0, 0, 0],
    logger: quietLogger,
    emitFailure() {},
    fallbackAudit: null,
  };
  let sequence = [transient, clean];
  let calls = 0;
  await auditDependencies({
    ...options,
    runAttempt: async () => {
      calls += 1;
      return sequence.shift();
    },
  });
  assert.equal(calls, 2);

  for (const [result, errorPattern, expectedCalls] of [
    [vulnerable, /DEPENDENCY_AUDIT_VULNERABILITIES/, 1],
    [terminal, /DEPENDENCY_AUDIT_TERMINAL_FAILURE/, 1],
    [
      transient,
      /DEPENDENCY_AUDIT_UNAVAILABLE_FAIL_CLOSED attempts=4/,
      4,
    ],
  ]) {
    calls = 0;
    await assert.rejects(
      auditDependencies({
        ...options,
        runAttempt: async () => {
          calls += 1;
          return result;
        },
      }),
      errorPattern,
    );
    assert.equal(calls, expectedCalls);
  }

  let fallbackCalls = 0;
  for (const result of [clean, terminal, vulnerable]) {
    try {
      await auditDependencies({ ...options, runAttempt: async () => result,
        fallbackAudit: async () => { fallbackCalls++; } });
    } catch {}
  }
  assert.equal(fallbackCalls, 0, "clean, terminal and vulnerable results never fall back");
  await auditDependencies({ ...options, runAttempt: async () => transient,
    fallbackAudit: async () => { fallbackCalls++; } });
  assert.equal(fallbackCalls, 1);
  await assert.rejects(auditDependencies({ ...options, runAttempt: async () => transient,
    fallbackAudit: async () => { throw new Error("alternate service unavailable"); } }),
  /alternate service unavailable/);

  const locked = (name, version, extra = {}) => ({ version,
    resolved: `https://registry.npmjs.org/${name}/-/${name.split("/").at(-1)}-${version}.tgz`,
    integrity: "sha512-YWJj", ...extra });
  const fixture = { lockfileVersion: 3, packages: { "": { name: "root" },
    "node_modules/first": locked("first", "1.0.0", { dev: true }),
    "node_modules/@scope/optional": locked("@scope/optional", "2.0.0", { optional: true }),
    "node_modules/first/node_modules/first": locked("first", "1.0.0"),
  } };
  const lockText = JSON.stringify(fixture);
  const makeAdvisory = (overrides = {}) => ({ ghsa_id: "GHSA-abcd-1234-efgh", type: "reviewed",
    withdrawn_at: null, severity: "medium", vulnerabilities: [{ package: { ecosystem: "npm", name: "first" },
      vulnerable_version_range: "<2.0.0" }], ...overrides });
  const response = (body, headers = {}, status = 200) => new Response(JSON.stringify(body), { status, headers });
  const scan = (fetchFn, text = lockText) => auditGitHubDependencies({
    fetchFn, lockText: text, token: undefined, logger: quietLogger });
  const requested = [];
  const scanned = await scan(async (url, options) => {
    requested.push(new URL(url));
    assert.equal(options.redirect, "error");
    return response([]);
  });
  assert.equal(scanned.entries, 3);
  assert.equal(scanned.packages.length, 2);
  assert.equal(requested.length, 2);
  for (const url of requested) {
    assert.equal(url.searchParams.get("affects"), "@scope/optional@2.0.0,first@1.0.0");
    assert.equal(url.searchParams.get("is_withdrawn"), "false");
  }
  assert.deepEqual(requested.map((url) => url.searchParams.get("type")), ["reviewed", "malware"]);
  let pages = 0;
  await scan(async (value) => {
    const url = new URL(value); pages++;
    if (url.searchParams.get("type") === "malware") return response([]);
    if (url.searchParams.has("after")) return response([]);
    url.searchParams.set("after", "cursor");
    return response([makeAdvisory()], { link: `<${url.href}>; rel="next"` });
  });
  assert.equal(pages, 3, "all pagination is consumed");
  for (const [row, pattern] of [
    [makeAdvisory({ severity: "high" }), /DEPENDENCY_AUDIT_VULNERABILITIES/],
    [makeAdvisory({ severity: "critical" }), /DEPENDENCY_AUDIT_VULNERABILITIES/],
    [makeAdvisory({ severity: "unknown" }), /unknown-severity/],
    [makeAdvisory({ withdrawn_at: "2026-01-01T00:00:00Z" }), /unknown-severity/],
    [makeAdvisory({ vulnerabilities: [] }), /coverage mismatch/],
  ]) await assert.rejects(scan(async (url) =>
    response(new URL(url).searchParams.get("type") === "reviewed" ? [row] : [])), pattern);
  await assert.rejects(scan(async (url) => response(new URL(url).searchParams.get("type") === "malware"
    ? [makeAdvisory({ type: "malware", severity: "low" })] : [])), /DEPENDENCY_AUDIT_VULNERABILITIES/);
  for (const status of [401, 403, 429, 503])
    await assert.rejects(scan(async () => response({}, {}, status)), new RegExp(`HTTP ${status}`));
  await assert.rejects(scan(async () => response({ incomplete_results: true })), /result page/);
  await assert.rejects(scan(async () => { throw new Error("network failed"); }), /network failed/);
  await assert.rejects(scan(async () => response([], { link: '<https://example.com/advisories>; rel="next"' })),
    /left the primary/);
  await assert.rejects(scan(async (value) => {
    const url = new URL(value); url.searchParams.delete("affects"); url.searchParams.set("after", "cursor");
    return response([], { link: `<${url.href}>; rel="next"` });
  }), /pagination changed query/);
  for (const patch of [{ version: "^1.0.0" }, { integrity: undefined }, { link: true },
    { resolved: "https://example.com/package.tgz" }]) {
    const invalid = structuredClone(fixture);
    Object.assign(invalid.packages["node_modules/first"], patch);
    await assert.rejects(scan(async () => { throw new Error("must not request"); }, JSON.stringify(invalid)),
      /DEPENDENCY_ADVISORY_FAIL_CLOSED/);
  }

  console.log("DEPENDENCY_AUDIT_SELF_TEST_PASS");
}

if (process.argv.includes("--self-test")) {
  await selfTest();
} else {
  auditDependencies().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
