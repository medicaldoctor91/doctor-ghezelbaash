#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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
