import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

const run = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const workflow = await readFile(
  ".github/workflows/hugging-face-authority.yml",
  "utf8",
);
const cloudflare = await readFile(
  ".github/workflows/cloudflare-pages-deploy.yml",
  "utf8",
);
const githubPagesBridge = await readFile(
  ".github/workflows/github-pages-bridge.yml",
  "utf8",
);
const stackMonitor = await readFile(
  ".github/workflows/stack-monitor.yml",
  "utf8",
);
const huggingFace = await readFile("scripts/huggingface.mjs", "utf8");
const compactHuggingFace = huggingFace.replace(/\s+/g, "");
const forbiddenDatasetId = ["Q140", "304972"].join("");

assert.match(
  workflow,
  /git merge-base --is-ancestor "\$BASE_SHA" "\$CANDIDATE_SHA"/,
);
assert.match(
  workflow,
  /push --atomic origin HEAD:main "refs\/tags\/v\$RELEASE_TARGET"/,
);
assert.doesNotMatch(workflow, /push origin HEAD:main\s*\n\s*if git ls-remote/);
assert.doesNotMatch(cloudflare, /(?:^|\s)--apply(?=\s|\\|$)/m);
assert.match(cloudflare, /--apply-redirects-only/);
assert.match(cloudflare, /--purge-cache-only/);
assert.match(cloudflare, /Purge canonical deployment cache/);
assert.doesNotMatch(cloudflare, /steps\.release_change/);
const cloudflareTimeout = Number(
  cloudflare.match(/^\s+timeout-minutes:\s*(\d+)\s*$/m)?.[1],
);
assert.ok(
  cloudflareTimeout >= 60,
  "Cloudflare deployment timeout must cover its bounded convergence gates",
);
for (const pathFilter of [
  ".nvmrc",
  "scripts/lib/**",
  "src/content-source/**",
  "src/data/**",
  "src/lib/**",
])
  assert.ok(
    githubPagesBridge.includes(`- ${pathFilter}`),
    `GitHub Pages bridge trigger misses ${pathFilter}`,
  );
assert.match(
  workflow,
  /FROZEN_SOURCE_SHA="\$\(git rev-list -n 1 "v\$CURRENT_VERSION"\)"/,
);
assert.match(
  workflow,
  /node scripts\/huggingface\.mjs push \.release\/huggingface "refs\/tags\/\$HF_TAG"/,
);
assert.match(
  workflow,
  /Verify the repaired or current frozen release snapshot[\s\S]*?node scripts\/verify-live\.mjs release/,
);
assert.match(
  workflow,
  /env\.FROZEN_SOURCE_AT_HEAD == 'true' && env\.RELEASE_RECOVERY == 'true'/,
);
assert.match(stackMonitor, /on:\s*\n\s+push:\s*\n\s+branches: \[main\]/);
assert.ok(
  stackMonitor.includes("if: github.event_name != 'push'"),
  "Push reconciliation must not mutate the first-party edge",
);
assert.ok(
  /\[\s*["']Q140["']\s*,\s*["']304972["']\s*\]\.join\(\s*["']["']\s*\)/.test(
    huggingFace,
  ),
  "HF validation must construct the forbidden identifier without publishing it literally",
);
assert.ok(
  compactHuggingFace.indexOf("awaitcleanDistributionRoot(hub)") <
    compactHuggingFace.indexOf(
      "constresources=resourcesForTarget(hf.resourceTarget)",
    ),
  "HF preparation must start from a clean distribution root",
);
assert.ok(
  compactHuggingFace.includes(
    "JSON.stringify(actual)===JSON.stringify(expected)",
  ),
  "HF preparation must enforce its exact declared inventory",
);
assert.ok(
  compactHuggingFace.includes("awaitassertCanonicalHuggingFaceIdentity(hub)"),
  "HF preparation must enforce the full-tree identity gate",
);
assert.ok(
  huggingFace.includes("Hugging Face identity drift"),
  "HF preparation must reject identity drift",
);
assert.ok(
  !huggingFace.includes(forbiddenDatasetId),
  "HF validation republishes the forbidden identifier literally",
);
assert.throws(
  () => run(process.cwd(), ["grep", "-n", "--", forbiddenDatasetId]),
  "Tracked source republishes the forbidden identifier literally",
);

const dir = await mkdtemp(
  path.join(os.tmpdir(), "ghezelbaash-release-topology-"),
);
try {
  run(dir, ["init", "-q"]);
  run(dir, ["config", "user.name", "release-test"]);
  run(dir, ["config", "user.email", "release-test@example.invalid"]);
  await writeFile(path.join(dir, "state.txt"), "base\n");
  run(dir, ["add", "state.txt"]);
  run(dir, ["commit", "-qm", "base"]);
  const base = run(dir, ["rev-parse", "HEAD"]);
  run(dir, ["switch", "-qc", "candidate"]);
  await writeFile(path.join(dir, "release.txt"), "snapshot\n");
  run(dir, ["add", "release.txt"]);
  run(dir, ["commit", "-qm", "snapshot"]);
  const snapshot = run(dir, ["rev-parse", "HEAD"]);
  run(dir, ["switch", "-qc", "main", base]);
  await writeFile(path.join(dir, "workflow.txt"), "fix\n");
  run(dir, ["add", "workflow.txt"]);
  run(dir, ["commit", "-qm", "workflow fix"]);
  const current = run(dir, ["rev-parse", "HEAD"]);
  assert.throws(() =>
    run(dir, ["merge-base", "--is-ancestor", current, snapshot]),
  );
  run(dir, [
    "merge",
    "--no-ff",
    "-qm",
    "integrate immutable snapshot",
    snapshot,
  ]);
  const integrated = run(dir, ["rev-parse", "HEAD"]);
  run(dir, ["merge-base", "--is-ancestor", current, integrated]);
  run(dir, ["merge-base", "--is-ancestor", snapshot, integrated]);
  run(dir, ["tag", "-a", "v1.2.4", snapshot, "-m", "frozen snapshot"]);
  assert.equal(run(dir, ["rev-parse", "v1.2.4^{}"]), snapshot);
  assert.notEqual(integrated, snapshot);
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(
  JSON.stringify({
    releaseTransaction: "PASS",
    divergenceRejectedBeforePublish: true,
    integrationKeepsBothParents: true,
    frozenTagExact: true,
    frozenTagRecovery: true,
    cloudflareFullApplyDisabled: true,
    cloudflareTimeoutCoversConvergence: true,
    githubPagesBridgeDependencies: "COMPLETE",
  }),
);
