import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

const run = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
execFileSync("python", ["scripts/test-zenodo-release.py"], { stdio: "inherit" });
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

assert.match(
  workflow,
  /git merge-base --is-ancestor "\$BASE_SHA" "\$CANDIDATE_SHA"/,
);
assert.match(
  workflow,
  /push --atomic origin HEAD:main "refs\/tags\/v\$RELEASE_TARGET"/,
);
assert.match(
  workflow,
  /Create or verify exact GitHub Release[\s\S]*?gh release create "\$TAG" "\$ATTESTATION" "\$MANIFEST"[\s\S]*?--verify-tag/,
);
const immutableCapabilityGate = workflow.indexOf(
  "Detect GitHub immutable releases capability",
);
const candidateMutation = workflow.indexOf(
  "Create or resume release candidate source",
);
const zenodoPublish = workflow.indexOf("Publish immutable Zenodo release");
const gitIdentity = workflow.indexOf("Establish release Git identity");
assert.ok(gitIdentity >= 0 && gitIdentity < candidateMutation);
assert.match(workflow, /Final pre-publication transaction gate[\s\S]*?git var GIT_COMMITTER_IDENT/);
assert.match(workflow, /git merge-base --is-ancestor "\$SOURCE_SHA" "refs\/remotes\/origin\/\$BRANCH"/);
assert.match(workflow, /git merge-base --is-ancestor "\$SOURCE_SHA" "\$CANDIDATE_SHA"/);
assert.match(workflow, /promote-release\.mjs[\s\S]*?npm run render:calibration:update[\s\S]*?src\/data\/render-calibration\.json/);
const machineAccessGate = workflow.indexOf("Reconcile Cloudflare zone settings before publication");
assert.ok(machineAccessGate > candidateMutation && machineAccessGate < zenodoPublish);
assert.match(workflow.slice(machineAccessGate, zenodoPublish), /python scripts\/preflight-cloudflare-edge\.py/);
assert.match(workflow.slice(machineAccessGate, zenodoPublish), /CLOUDFLARE_STANDARD_MACHINE_CLIENT_ACCESS_PASS/);

assert.ok(
  immutableCapabilityGate >= 0 &&
    candidateMutation >= 0 &&
    zenodoPublish >= 0 &&
    immutableCapabilityGate < candidateMutation &&
    immutableCapabilityGate < zenodoPublish,
  "GitHub immutable-release capability detection must precede candidate mutation",
);
const immutableCapabilityBlock = workflow.slice(
  immutableCapabilityGate,
  zenodoPublish,
);
for (const required of [
  "secrets.GH_RELEASE_ADMIN_TOKEN || secrets.RELEASE_ADMIN_TOKEN",
  "X-GitHub-Api-Version: 2026-03-10",
  "repos/$GITHUB_REPOSITORY/immutable-releases",
  "state.enabled !== true",
  "GITHUB_IMMUTABLE_POLICY=unverified",
  "GITHUB_IMMUTABLE_POLICY=enabled",
])
  assert.ok(
    immutableCapabilityBlock.includes(required),
    `Immutable-release capability detection misses ${required}`,
  );
assert.ok(
  !immutableCapabilityBlock.includes("|| github.token"),
  "Repository GITHUB_TOKEN must not masquerade as an Administration credential",
);
assert.doesNotMatch(
  immutableCapabilityBlock,
  /(?:--method|-X)\s+PUT/,
  "Release workflow must never enable immutable releases implicitly",
);
assert.match(
  workflow,
  /Build exact current release distribution[\s\S]*?FROZEN_SOURCE_AT_HEAD[\s\S]*?zenodo_release\.py prepare-auxiliaries/,
);
assert.match(
  workflow,
  /Create or verify exact GitHub Release[\s\S]*?steps\.release\.outputs\.mode == 'new' \|\| env\.FROZEN_SOURCE_AT_HEAD == 'true'/,
);
assert.match(
  workflow,
  /BODY="Exact GitHub release metadata for \$TAG\. Immutable Zenodo Version DOI: \$VERSION_DOI"/,
);
assert.match(
  workflow,
  /gh release download "\$TAG"[\s\S]*?cmp "\$ASSET" "\$TMP\/final-download\/\$NAME"/,
);
for (const required of [
  "assets,body,isDraft,isImmutable,isPrerelease,name,tagName,targetCommitish",
  "Existing published GitHub Release is not immutable",
  "Existing published GitHub Release asset inventory drift",
  "Draft GitHub Release is not exact before publication",
  "Published GitHub Release postcondition drift",
  "release.isDraft !== false",
  "release.isPrerelease !== false",
  "process.env.GITHUB_IMMUTABLE_POLICY === \"enabled\"",
  "release.isImmutable !== true",
  "release.tagName !== tag",
  "release.name !== title",
  "release.body !== body",
  "JSON.stringify(actual) !== JSON.stringify(expected)",
])
  assert.ok(
    workflow.includes(required),
    `GitHub Release exact postcondition misses ${required}`,
  );
assert.match(
  workflow,
  /elif \[ "\$EXISTS" = true \]; then[\s\S]*?test "\$IS_DRAFT" = true[\s\S]*?gh release upload/,
  "Only a validated draft may receive a recovery asset upload",
);
assert.match(
  workflow,
  /if \[ "\$IS_DRAFT" = true \]; then[\s\S]*?gh release edit "\$TAG"[^\n]*--draft=false/,
  "Only an exact validated draft may be published during recovery",
);
assert.doesNotMatch(workflow, /gh release upload[^\n]*--clobber/);
assert.doesNotMatch(workflow, /push origin HEAD:main\s*\n\s*if git ls-remote/);
assert.match(
  workflow,
  /Reconcile or verify current Cloudflare deployment contract[\s\S]*?FROZEN_SOURCE_AT_HEAD[\s\S]*?CF_EXPECTED_COMMIT="\$BASE_SHA"[\s\S]*?cloudflare-pages\.mjs ensure --configure[\s\S]*?cloudflare-pages\.mjs ensure\n/,
  "Frozen current-release recovery must converge the exact Cloudflare commit",
);
const cloudflareJobs = cloudflare.split("\njobs:\n")[1];
assert.ok(cloudflareJobs, "Cloudflare workflow jobs are missing");
const [cloudflareDeployment, cloudflareDelivery] = cloudflareJobs.split("\n  delivery:\n");
assert.ok(cloudflareDelivery, "Cloudflare delivery controls require an isolated job");
const cloudflareDispatch = cloudflare.split("  workflow_dispatch:\n")[1]?.split("\npermissions:")[0];
assert.match(cloudflareDispatch, /action:[\s\S]*?type: choice\n\s+required: true\n\s+default: deployment\n/);
assert.deepEqual(
  [...cloudflareDispatch.matchAll(/^          - ([a-z]+)$/gm)].map((match) => match[1]),
  ["deployment", "audit", "strengthen"],
  "Cloudflare manual actions must remain explicit and default to deployment",
);
assert.match(cloudflareDeployment, /^  verify:\n    if: github\.event_name != 'workflow_dispatch' \|\| inputs\.action == 'deployment'\n/);
assert.match(cloudflareDeployment, /Reconcile canonical Cloudflare edge[\s\S]*?python scripts\/configure-cloudflare-edge\.py \\\n\s+--apply\s/);
assert.match(cloudflareDelivery, /^    if: github\.event_name == 'workflow_dispatch' && \(inputs\.action == 'audit' \|\| inputs\.action == 'strengthen'\)\n/);
assert.match(cloudflareDelivery, /ref: \$\{\{ github\.sha \}\}\n\s+persist-credentials: false/);
assert.match(cloudflareDelivery, /test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
assert.match(cloudflareDelivery, /DELIVERY_ACTION: \$\{\{ inputs\.action \}\}/);
assert.match(cloudflareDelivery, /audit\) arguments=\(--audit-delivery\) ;;/);
assert.match(cloudflareDelivery, /strengthen\) arguments=\(--strengthen-delivery --rollback-snapshot \.release\/cloudflare-compression-before\.json\) ;;/);
assert.match(cloudflareDelivery, /\*\) echo 'Unsupported Cloudflare delivery action' >&2; exit 1 ;;/);
assert.match(cloudflareDelivery, /python scripts\/configure-cloudflare-edge\.py "\$\{arguments\[@\]\}"/);
assert.match(cloudflareDelivery, /--outcome \.release\/cloudflare-delivery-audit\.json/);
assert.match(cloudflareDelivery, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
assert.doesNotMatch(
  cloudflareDelivery,
  /\b(?:npm|npx|wrangler|zenodo|huggingface)\b|cloudflare-pages\.mjs|(?:^|\s)--apply(?:\s|$)|git\s+(?:push|tag|merge|checkout)\b/m,
  "Delivery-only actions must not build, deploy or publish a release",
);
assert.match(cloudflare, /concurrency:\n  group: doctor-ghezelbaash-external-mutation\n  cancel-in-progress: false\n  queue: max/);
assert.doesNotMatch(cloudflare, /steps\.release_change/);
const cloudflareTimeout = Number(
  cloudflareDeployment.match(/^\s+timeout-minutes:\s*(\d+)\s*$/m)?.[1],
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

// Execute the actual resolution block against local Git fixtures. An unpublished
// candidate may already carry the target version; canonical main defines current.
const resolveSection = workflow.split("      - name: Resolve release transaction\n")[1]
  .split("      - name: Detect GitHub immutable releases capability\n")[0];
const resolveScript = resolveSection.split("        run: |\n")[1]
  .split("\n").map((line) => line.startsWith("          ") ? line.slice(10) : line).join("\n");
const resolveDir = await mkdtemp(path.join(os.tmpdir(), "ghezelbaash-release-resolution-"));
try {
  const work = path.join(resolveDir, "work"), origin = path.join(resolveDir, "origin.git");
  await mkdir(path.join(work, "src/data"), { recursive: true });
  run(resolveDir, ["init", "--bare", "-q", origin]);
  run(work, ["init", "-q"]);
  run(work, ["config", "user.name", "release-test"]);
  run(work, ["config", "user.email", "release-test@example.invalid"]);
  run(work, ["remote", "add", "origin", origin]);
  const state = (version, record) => JSON.stringify({
    release: version,
    dataset: {
      zenodo: { recordId: record, versionDoi: `10.5281/zenodo.${record}`, conceptDoi: "10.5281/zenodo.100" },
      huggingFace: { dataset: "https://huggingface.co/datasets/example/fixture" },
    },
  });
  await writeFile(path.join(work, "src/data/release.json"), state("1.2.5", "125"));
  run(work, ["add", "src/data/release.json"]);
  run(work, ["commit", "-qm", "canonical base"]);
  run(work, ["tag", "v1.2.5"]);
  run(work, ["push", "-q", "origin", "HEAD:main", "--tags"]);
  await writeFile(path.join(work, "src/data/release.json"), state("1.3.0", "130"));
  run(work, ["commit", "-qam", "unpublished candidate"]);
  const candidate = run(work, ["rev-parse", "HEAD"]);
  const resolve = async (target) => {
    const envFile = path.join(resolveDir, "environment"), outputFile = path.join(resolveDir, "output");
    await writeFile(envFile, "");
    await writeFile(outputFile, "");
    execFileSync("bash", ["-c", resolveScript], {
      cwd: work,
      env: { ...process.env, RELEASE_TARGET: target, GITHUB_ENV: envFile, GITHUB_OUTPUT: outputFile },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return Object.fromEntries((await readFile(envFile, "utf8")).trim().split("\n").map((line) => {
      const offset = line.indexOf("=");
      return [line.slice(0, offset), line.slice(offset + 1)];
    }));
  };
  const resumed = await resolve("1.3.0");
  assert.equal(resumed.RELEASE_MODE, "new");
  assert.equal(resumed.CURRENT_VERSION, "1.2.5");
  assert.equal(resumed.CURRENT_RECORD, "125");
  assert.equal(resumed.SOURCE_SHA, candidate);
  run(work, ["tag", "v1.3.0"]);
  run(work, ["push", "-q", "origin", "HEAD:main", "--tags"]);
  const current = await resolve("1.3.0");
  assert.equal(current.RELEASE_MODE, "current");
  assert.equal(current.CURRENT_RECORD, "130");
  assert.equal(current.FROZEN_SOURCE_AT_HEAD, "true");
  await writeFile(path.join(work, "source.txt"), "unpublished edits\n");
  run(work, ["add", "source.txt"]);
  run(work, ["commit", "-qm", "unpublished edits after current release"]);
  await assert.rejects(resolve("1.3.0"));
  await assert.rejects(resolve("1.2.4"));
} finally {
  await rm(resolveDir, { recursive: true, force: true });
}

console.log(
  JSON.stringify({
    releaseTransaction: "PASS",
    divergenceRejectedBeforePublish: true,
    integrationKeepsBothParents: true,
    frozenTagExact: true,
    frozenTagRecovery: true,
    githubReleaseIdempotent: true,
    githubImmutablePolicyPreflight: "CAPABILITY_AWARE",
    githubReleaseExactPostcondition: true,
    cloudflareFrozenRecovery: true,
    cloudflareFullApplyCanonical: true,
    cloudflareTimeoutCoversConvergence: true,
    githubPagesBridgeDependencies: "COMPLETE",
    unpublishedCandidateResolution: true,
    standardMachineAccessBeforePublish: true,
  }),
);
