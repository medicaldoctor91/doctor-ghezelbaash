import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { liveOptions, livePlan, validateLive } from "./validate-live.mjs";
import { renderStaticRewrites } from "./lib/redirect-registry.mjs";
import { derivePublicRedirectPolicy } from "./lib/public-redirect-policy.mjs";

const options = liveOptions(process.argv.slice(2));
if (options.help) {
  console.log("Usage: node scripts/validate-live-public.mjs [--origin https://www.ghezelbaash.ir] [--expected-commit SHA] [--redirects all|sample] [--concurrency 1..8] [--timeout-ms 20000] [--redirects-file dist/_redirects] [--report .generated/live-validation.json]\nValidates the final public redirect policy and requires every development-only alias to be absent (404/410).");
  process.exit(0);
}

const root = process.cwd();
const sourcePlan = await livePlan(root);
const policy = await derivePublicRedirectPolicy(root);
const plan = {
  ...sourcePlan,
  rows: policy.finalRows,
  namespaces: policy.namespaceAliases,
  counts: {
    canonical: policy.canonical.length,
    corpusRedirects: 0,
    answerRedirects: 0,
    legacyRules: policy.legacyAliases.length,
    metadataRules: policy.metadataAliases.length,
    namespaces: policy.namespaceAliases.length,
    removedDevelopmentAliases: policy.developmentAliases.length,
  },
};

if (options.redirectsFile) {
  assert.equal(
    await readFile(options.redirectsFile, "utf8"),
    renderStaticRewrites(policy.finalRows),
    "Local _redirects differs from the final public publication policy",
  );
}
if (!options.expectedCommit) {
  const localBuild = JSON.parse(await readFile("dist/build-info.json", "utf8").catch(() => "null"));
  if (/^[a-f\d]{40}$/i.test(localBuild?.commit || "")) options.expectedCommit = localBuild.commit;
}

const report = await validateLive(plan, options, {
  onProgress: (count) => process.stderr.write(`checked ${count}\n`),
});

const removedChecks = [];
let next = 0;
await Promise.all(
  Array.from(
    { length: Math.min(options.concurrency, policy.developmentAliases.length) },
    async () => {
      while (next < policy.developmentAliases.length) {
        const alias = policy.developmentAliases[next++];
        const record = { path: alias.source, ok: false };
        try {
          const response = await fetch(new URL(alias.source, options.origin), {
            method: "HEAD",
            redirect: "manual",
            signal: AbortSignal.timeout(options.timeoutMs),
            headers: { "User-Agent": "ghezelbaash-live-validation/1.0" },
          });
          record.status = response.status;
          assert(
            [404, 410].includes(response.status),
            `Removed development URL is still publicly routable: ${alias.source} -> ${response.status}`,
          );
          assert(!response.headers.get("location"), `Removed development URL still redirects: ${alias.source}`);
          record.ok = true;
        } catch (error) {
          record.error = error.message;
        }
        removedChecks.push(record);
      }
    },
  ),
);
removedChecks.sort((a, b) => a.path.localeCompare(b.path));
const removedFailures = removedChecks.filter((record) => !record.ok);
report.removedDevelopmentUrls = {
  expectedAbsent: policy.developmentAliases.length,
  checked: removedChecks.length,
  passed: removedChecks.length - removedFailures.length,
  failed: removedFailures.length,
  checks: removedChecks,
};
report.ok = report.ok && removedFailures.length === 0;
report.totals.checked += removedChecks.length;
report.totals.passed += removedChecks.length - removedFailures.length;
report.totals.failed += removedFailures.length;

await mkdir(path.dirname(options.report), { recursive: true });
await writeFile(options.report, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  liveValidation: report.ok ? "PASS" : "FAIL",
  canonicalPages: policy.canonical.length,
  finalRedirectRules: policy.finalRows.length,
  removedDevelopmentUrls: report.removedDevelopmentUrls.expectedAbsent,
  removedUrlsPassing404or410: report.removedDevelopmentUrls.passed,
  totals: report.totals,
  report: options.report,
}, null, 2));
if (!report.ok) process.exitCode = 1;
