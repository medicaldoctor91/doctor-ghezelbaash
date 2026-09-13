import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const script = path.resolve("scripts/release-candidate-preflight.mjs");
const root = await mkdtemp(path.join(os.tmpdir(), "release-candidate-preflight-"));
const bare = path.join(root, "origin.git");
const work = path.join(root, "work");
const git = (cwd, args) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const runPreflight = (baseSha) =>
  spawnSync(
    process.execPath,
    [script, "--version=1.3.0", `--base-sha=${baseSha}`],
    { cwd: work, encoding: "utf8" },
  );
const lock = {
  schemaVersion: "1.0",
  conceptDoi: "10.5281/zenodo.18765168",
  predecessor: {
    release: "1.2.6",
    recordId: "22651268",
    versionDoi: "10.5281/zenodo.22651268",
  },
  candidate: {
    release: "1.3.0",
    recordId: "22663811",
    versionDoi: "10.5281/zenodo.22663811",
  },
};
const source = (version = "1.2.5") => ({
  release: version,
  dataset: {
    zenodo: {
      conceptDoi: lock.conceptDoi,
      recordId: version === "1.3.0" ? lock.candidate.recordId : "22216583",
      versionDoi:
        version === "1.3.0" ? lock.candidate.versionDoi : "10.5281/zenodo.22216583",
    },
  },
});
const commitSource = async (version, message) => {
  await mkdir(path.join(work, "src/data"), { recursive: true });
  await writeFile(
    path.join(work, "src/data/release.json"),
    `${JSON.stringify(source(version), null, 2)}\n`,
  );
  git(work, ["add", "src/data/release.json"]);
  git(work, ["commit", "-qm", message]);
  return git(work, ["rev-parse", "HEAD"]);
};

try {
  git(root, ["init", "--bare", "-q", bare]);
  git(root, ["clone", "-q", bare, work]);
  git(work, ["config", "user.name", "release-test"]);
  git(work, ["config", "user.email", "release-test@example.invalid"]);
  await mkdir(path.join(work, ".release/policy"), { recursive: true });
  await writeFile(
    path.join(work, ".release/policy/release-transaction-lock.json"),
    `${JSON.stringify(lock, null, 2)}\n`,
  );
  git(work, ["add", ".release/policy/release-transaction-lock.json"]);
  git(work, ["commit", "-qm", "transaction lock"]);
  await commitSource("1.2.5", "base source");
  git(work, ["branch", "-M", "main"]);
  git(work, ["push", "-q", "-u", "origin", "main"]);
  const oldBase = git(work, ["rev-parse", "HEAD"]);

  git(work, ["switch", "-qc", "release/v1.3.0", oldBase]);
  await commitSource("1.3.0", "old release candidate");
  git(work, ["push", "-q", "origin", "release/v1.3.0"]);

  git(work, ["switch", "main"]);
  await writeFile(path.join(work, "current.txt"), "current main\n");
  git(work, ["add", "current.txt"]);
  git(work, ["commit", "-qm", "advance main"]);
  const currentMain = git(work, ["rev-parse", "HEAD"]);
  git(work, ["push", "-q", "origin", "main"]);

  const stale = runPreflight(currentMain);
  assert.notEqual(stale.status, 0, "Diverged release branch must be rejected");
  assert.match(
    `${stale.stdout}\n${stale.stderr}`,
    /STALE_RELEASE_CANDIDATE/,
    "Stale candidate rejection must be explicit",
  );

  git(work, ["switch", "-C", "release/v1.3.0", currentMain]);
  await commitSource("1.3.0", "fresh release candidate");
  git(work, ["push", "-q", "--force-with-lease", "origin", "release/v1.3.0"]);
  git(work, ["switch", "main"]);
  const resume = runPreflight(currentMain);
  assert.equal(resume.status, 0, resume.stderr);
  assert.equal(JSON.parse(resume.stdout).mode, "resume");

  git(work, ["push", "-q", "origin", "--delete", "release/v1.3.0"]);
  const fresh = runPreflight(currentMain);
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.equal(JSON.parse(fresh.stdout).mode, "new");
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("RELEASE_CANDIDATE_PREFLIGHT_HERMETIC_PASS");
