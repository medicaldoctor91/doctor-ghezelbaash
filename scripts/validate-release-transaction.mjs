import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

const run = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const [
  workflow,
  cloudflare,
  cloudflareReadOnly,
  githubPagesBridge,
  stackMonitor,
  huggingFace,
  zenodoPreflight,
  zenodoPublishSafe,
  candidatePreflight,
  lock,
] = await Promise.all([
  readFile(".github/workflows/hugging-face-authority.yml", "utf8"),
  readFile(".github/workflows/cloudflare-pages-deploy.yml", "utf8"),
  readFile("scripts/cloudflare-pages-readonly.mjs", "utf8"),
  readFile(".github/workflows/github-pages-bridge.yml", "utf8"),
  readFile(".github/workflows/stack-monitor.yml", "utf8"),
  readFile("scripts/huggingface.mjs", "utf8"),
  readFile("scripts/zenodo-preflight.py", "utf8"),
  readFile("scripts/zenodo-publish-safe.py", "utf8"),
  readFile("scripts/release-candidate-preflight.mjs", "utf8"),
  readFile(".release/policy/release-transaction-lock.json", "utf8").then(JSON.parse),
]);
const compactHuggingFace = huggingFace.replace(/\s+/g, "");
const requireOrdered = (content, labels) => {
  let previous = -1;
  for (const label of labels) {
    const current = content.indexOf(label);
    assert.ok(current >= 0, `Missing transaction stage: ${label}`);
    assert.ok(current > previous, `Transaction stage ordering drift: ${label}`);
    previous = current;
  }
};

assert.equal(lock.schemaVersion, "1.0");
assert.equal(lock.conceptDoi, "10.5281/zenodo.18765168");
assert.deepEqual(lock.predecessor, {
  release: "1.2.6",
  recordId: "22651268",
  versionDoi: "10.5281/zenodo.22651268",
});
assert.deepEqual(lock.candidate, {
  release: "1.3.0",
  recordId: "22663811",
  versionDoi: "10.5281/zenodo.22663811",
});
assert.equal(lock.policy?.requireAuthenticatedPreflight, true);
assert.equal(lock.policy?.requireExistingCandidateDraft, true);
assert.equal(lock.policy?.allowReplacementCandidateIdentity, false);
assert.equal(lock.policy?.allowBlindPublishRetry, false);

assert.match(workflow, /^\s+environment:\s*production-release\s*$/m);
assert.match(workflow, /group:\s*doctor-ghezelbaash-external-mutation/);
assert.match(workflow, /cancel-in-progress:\s*false/);
assert.match(workflow, /permissions:\s*\n\s+contents:\s*write/m);
assert.doesNotMatch(workflow, /\bpull_request_target\b/);

requireOrdered(workflow, [
  "Detect GitHub immutable releases capability",
  "Reject stale release candidate before external staging",
  "Verify locked Zenodo lineage and candidate without mutation",
  "Create or resume release candidate source",
  "Prepare Hugging Face candidate",
  "Stage or verify immutable Zenodo candidate",
  "Final pre-publication transaction gate",
  "Publish immutable Zenodo release",
  "Promote exact candidate to canonical GitHub main and tag",
  "Create or verify exact GitHub Release",
  "Promote and verify Hugging Face release",
  "Reconcile or verify current Cloudflare deployment contract",
]);

const immutableStart = workflow.indexOf("Detect GitHub immutable releases capability");
const candidateStart = workflow.indexOf("Reject stale release candidate before external staging");
const immutableBlock = workflow.slice(immutableStart, candidateStart);
for (const token of [
  "secrets.GH_RELEASE_ADMIN_TOKEN || secrets.RELEASE_ADMIN_TOKEN",
  "X-GitHub-Api-Version: 2026-03-10",
  "repos/$GITHUB_REPOSITORY/immutable-releases",
  "state.enabled !== true",
  "GITHUB_IMMUTABLE_POLICY=enabled",
  "exit 1",
])
  assert.ok(immutableBlock.includes(token), `Immutable-release preflight misses ${token}`);
assert.ok(!immutableBlock.includes("|| github.token"));
assert.doesNotMatch(immutableBlock, /(?:--method|-X)\s+PUT/);

assert.match(
  workflow,
  /Reject stale release candidate before external staging[\s\S]*?release-candidate-preflight\.mjs[\s\S]*?--base-sha="\$BASE_SHA"/,
);
for (const token of [
  "git merge-base --is-ancestor",
  "STALE_RELEASE_CANDIDATE",
  "locked Zenodo identity",
])
  assert.ok(candidatePreflight.includes(token), `Candidate preflight misses ${token}`);

assert.match(
  workflow,
  /Verify locked Zenodo lineage and candidate without mutation[\s\S]*?python scripts\/zenodo-preflight\.py/,
);
assert.ok(zenodoPreflight.includes('method="GET"'));
assert.doesNotMatch(zenodoPreflight, /method\s*=\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
assert.ok(zenodoPreflight.includes('"httpMethodsUsed": ["GET"]'));
assert.ok(zenodoPreflight.includes('candidate_state = "published"'));
assert.ok(zenodoPreflight.includes('candidate_state = "draft"'));

const candidateMutationStart = workflow.indexOf("Create or resume release candidate source");
const candidateMutationEnd = workflow.indexOf("Push newly prepared release candidate");
const candidateMutationBlock = workflow.slice(candidateMutationStart, candidateMutationEnd);
assert.ok(candidateMutationBlock.includes("scripts/reconcile-zenodo-history.mjs"));
assert.ok(candidateMutationBlock.includes("scripts/promote-release.mjs"));
assert.ok(
  candidateMutationBlock.indexOf("scripts/reconcile-zenodo-history.mjs") <
    candidateMutationBlock.indexOf("scripts/promote-release.mjs"),
  "Factual Zenodo predecessor must be reconciled before target promotion",
);
assert.match(candidateMutationBlock, /test "\$ACTUAL" = "\$EXPECTED"/);

assert.doesNotMatch(workflow, /zenodo_release\.py\s+reserve/);
assert.doesNotMatch(workflow, /zenodo_release\.py\s+publish\b/);
assert.match(workflow, /python scripts\/zenodo-publish-safe\.py/);
assert.equal(
  (zenodoPublishSafe.match(/"POST",\s*f"\{draft_url\}\/actions\/publish"/g) || []).length,
  1,
  "Safe Zenodo publisher must contain exactly one irreversible publish call",
);
assert.ok(zenodoPublishSafe.includes("Never retry this POST in-process"));
assert.ok(zenodoPublishSafe.includes("refusing a blind retry"));
assert.ok(zenodoPublishSafe.includes("verify_public_record"));

const finalGateStart = workflow.indexOf("Final pre-publication transaction gate");
const publishStart = workflow.indexOf("Publish immutable Zenodo release");
const finalGate = workflow.slice(finalGateStart, publishStart);
for (const token of [
  'test "$(git rev-parse refs/remotes/origin/main)" = "$BASE_SHA"',
  'git merge-base --is-ancestor "$BASE_SHA" "$CANDIDATE_SHA"',
  'refs/heads/release/v$RELEASE_TARGET',
  '" = "$CANDIDATE_SHA"',
  '" = "$HF_CANDIDATE_SHA"',
  "python scripts/zenodo-preflight.py",
  "zenodo-stage.json",
  "s.sourceCommit!==process.env.CANDIDATE_SHA",
  "npm run validate:distribution-identifiers",
])
  assert.ok(finalGate.includes(token), `Final publication gate misses ${token}`);

assert.match(
  workflow,
  /Publish immutable Zenodo release[\s\S]*?STATE=.*candidate\.state[\s\S]*?\[ "\$STATE" = draft \][\s\S]*?zenodo-publish-safe\.py[\s\S]*?verify-public/,
);
assert.match(
  workflow,
  /push --atomic origin HEAD:main "refs\/tags\/v\$RELEASE_TARGET"/,
);
assert.doesNotMatch(workflow, /push\s+--force(?:\s|$)/);
assert.doesNotMatch(workflow, /push[^\n]*--delete/);
assert.doesNotMatch(workflow, /huggingface\.mjs push[^\n]*--delete/);

const githubReleaseStart = workflow.indexOf("Create or verify exact GitHub Release");
const hfPromotionStart = workflow.indexOf("Promote and verify Hugging Face release");
const githubReleaseBlock = workflow.slice(githubReleaseStart, hfPromotionStart);
for (const token of [
  "gh release create",
  "--verify-tag",
  "assets,body,isDraft,isImmutable,isPrerelease,name,tagName,targetCommitish",
  "r.targetCommitish!==candidate",
  "r.isImmutable!==true",
  "JSON.stringify(actual)!==JSON.stringify(expected)",
  "gh release download",
  'cmp "$ASSET" "$TMP/final-download/$NAME"',
])
  assert.ok(githubReleaseBlock.includes(token), `GitHub Release exact proof misses ${token}`);
assert.doesNotMatch(githubReleaseBlock, /gh release upload[^\n]*--clobber/);

const hfBlock = workflow.slice(hfPromotionStart, workflow.indexOf("Reconcile or verify current Cloudflare deployment contract"));
assert.ok(
  hfBlock.indexOf('ls-remote --exit-code --tags origin "refs/tags/$HF_TAG"') <
    hfBlock.indexOf("huggingface.mjs push .release/huggingface HEAD:main"),
  "Existing HF frozen tag must be verified before main promotion",
);
assert.match(hfBlock, /test "\$HF_TAG_SHA" = "\$HF_CANDIDATE_SHA"/);
assert.match(hfBlock, /huggingface\.mjs push \.release\/huggingface "refs\/tags\/\$HF_TAG"/);

const hfPrepareStart = workflow.indexOf("Prepare Hugging Face candidate");
const hfPrepareEnd = workflow.indexOf("Push Hugging Face candidate");
const hfPrepareBlock = workflow.slice(hfPrepareStart, hfPrepareEnd);
assert.ok(hfPrepareBlock.includes("STALE_HF_RELEASE_CANDIDATE"));
assert.ok(hfPrepareBlock.includes("git -C .release/huggingface diff --cached --quiet"));

const cfReleaseBlock = workflow.slice(workflow.indexOf("Reconcile or verify current Cloudflare deployment contract"));
assert.match(cfReleaseBlock, /cloudflare-pages\.mjs ensure --verify-config/);
assert.match(cfReleaseBlock, /configure-cloudflare-edge\.py --purge-cache-only/);
assert.match(cfReleaseBlock, /cloudflare-pages\.mjs verify/);
assert.doesNotMatch(cfReleaseBlock, /ensure --configure/);
assert.doesNotMatch(cfReleaseBlock, /configure-cloudflare-edge\.py[\s\\]*--apply/);

for (const forbidden of [
  "cloudflare-pages.mjs ensure --configure",
  "configure-pages-dev-redirect.py",
  "--apply",
])
  assert.ok(!cloudflare.includes(forbidden), `Routine Cloudflare path still mutates infrastructure: ${forbidden}`);
assert.match(cloudflare, /cloudflare-pages-readonly\.mjs/);
assert.match(cloudflare, /npm run preflight:cloudflare/);
assert.match(cloudflare, /--purge-cache-only/);
assert.match(cloudflare, /PAGES_DEV_ROOT_REDIRECT_PUBLIC_PASS/);
assert.match(cloudflare, /verify:production/);
assert.match(cloudflare, /verify:video-production/);
assert.match(cloudflare, /verify:public-discovery/);
assert.match(cloudflareReadOnly, /method:\s*"GET"/);
assert.doesNotMatch(cloudflareReadOnly, /method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
assert.ok(cloudflareReadOnly.includes("read-only verification refuses retry"));
assert.ok(cloudflareReadOnly.includes("read-only verification refuses repair"));
const cloudflareTimeout = Number(
  cloudflare.match(/^\s+timeout-minutes:\s*(\d+)\s*$/m)?.[1],
);
assert.ok(cloudflareTimeout >= 60, "Cloudflare verification timeout must cover bounded convergence gates");

for (const pathFilter of [
  ".nvmrc",
  "package.json",
  "package-lock.json",
  "scripts/lib/**",
  "src/content-source/**",
  "src/data/**",
  "src/lib/**",
])
  assert.ok(
    githubPagesBridge.includes(`- ${pathFilter}`),
    `GitHub Pages bridge trigger misses ${pathFilter}`,
  );
const bridgeInstallPosition = githubPagesBridge.indexOf(
  "run: npm ci --ignore-scripts --no-audit --no-fund",
);
const bridgeBuildPosition = githubPagesBridge.indexOf(
  "run: node scripts/github-pages-bridge.mjs build",
);
assert.ok(
  bridgeInstallPosition >= 0 && bridgeBuildPosition > bridgeInstallPosition,
  "GitHub Pages bridge must install locked compiler dependencies before building",
);

assert.match(stackMonitor, /on:\s*\n\s+push:\s*\n\s+branches: \[main\]/);
assert.ok(
  stackMonitor.includes("if: github.event_name != 'push'"),
  "Push stack monitor must keep external convergence checks out of ordinary push runs",
);
assert.ok(
  compactHuggingFace.indexOf("awaitcleanDistributionRoot(hub)") <
    compactHuggingFace.indexOf("constresources=resourcesForTarget(hf.resourceTarget)"),
  "HF preparation must start from a clean distribution root",
);
assert.ok(
  compactHuggingFace.includes("JSON.stringify(actual)===JSON.stringify(expected)"),
  "HF preparation must enforce its exact declared inventory",
);

const dir = await mkdtemp(path.join(os.tmpdir(), "ghezelbaash-release-topology-"));
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
  const staleSnapshot = run(dir, ["rev-parse", "HEAD"]);
  run(dir, ["switch", "-qc", "main", base]);
  await writeFile(path.join(dir, "workflow.txt"), "fix\n");
  run(dir, ["add", "workflow.txt"]);
  run(dir, ["commit", "-qm", "workflow fix"]);
  const current = run(dir, ["rev-parse", "HEAD"]);
  assert.throws(() => run(dir, ["merge-base", "--is-ancestor", current, staleSnapshot]));
  run(dir, ["switch", "-qc", "fresh", current]);
  await writeFile(path.join(dir, "release.txt"), "fresh snapshot\n");
  run(dir, ["add", "release.txt"]);
  run(dir, ["commit", "-qm", "fresh snapshot"]);
  const fresh = run(dir, ["rev-parse", "HEAD"]);
  run(dir, ["merge-base", "--is-ancestor", current, fresh]);
  run(dir, ["tag", "-a", "v1.3.0", fresh, "-m", "frozen snapshot"]);
  assert.equal(run(dir, ["rev-parse", "v1.3.0^{}"]), fresh);
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(
  JSON.stringify({
    releaseTransaction: "PASS",
    zenodoIdentityLocked: true,
    zenodoAuthenticatedPreflight: "GET_ONLY",
    zenodoPublishRetryPolicy: "SINGLE_ATTEMPT_PUBLIC_VERIFY",
    predecessorReconciliation: true,
    staleCandidateRejectedBeforeStaging: true,
    githubImmutablePolicyPreflight: "REQUIRED_ENABLED",
    githubReleaseExactPostcondition: true,
    huggingFaceFrozenTagExact: true,
    routineCloudflareControlPlaneMutation: false,
    routineCloudflareDeploymentVerification: "READ_ONLY_PLUS_SCOPED_CACHE_PURGE",
    branchDeletionInReleaseTransaction: false,
    historicalDivergenceRejected: true,
    githubPagesBridgeDependencies: "COMPLETE",
  }),
);
