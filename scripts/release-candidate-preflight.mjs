import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const args = Object.fromEntries(
  process.argv.slice(2).map((value) => {
    const [key, ...rest] = value.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  }),
);
const target = args.version;
const baseSha = args["base-sha"];
if (!/^\d+\.\d+\.\d+$/.test(target || "")) throw new Error("Invalid --version");
if (!/^[0-9a-f]{40}$/.test(baseSha || "")) throw new Error("Invalid --base-sha");
const lock = JSON.parse(await readFile(".release/policy/release-transaction-lock.json", "utf8"));
if (lock.schemaVersion !== "1.0" || lock.candidate?.release !== target)
  throw new Error("Release target disagrees with the locked Zenodo candidate identity");
const git = (parameters, options = {}) =>
  execFileSync("git", parameters, { encoding: "utf8", ...options }).trim();

const currentHead = git(["rev-parse", "HEAD"]);
if (currentHead !== baseSha)
  throw new Error(`Release preflight must start from exact base SHA ${baseSha}; found ${currentHead}`);
git(["fetch", "--no-tags", "origin", "main"]);
const originMain = git(["rev-parse", "FETCH_HEAD"]);
if (originMain !== baseSha)
  throw new Error(`origin/main advanced during release preflight: ${originMain}`);

const branch = `release/v${target}`;
const remoteRef = `refs/remotes/origin/${branch}`;
const fetched = spawnSync(
  "git",
  ["fetch", "--no-tags", "origin", `+refs/heads/${branch}:${remoteRef}`],
  { encoding: "utf8" },
);
if (fetched.status !== 0) {
  const absent = spawnSync(
    "git",
    ["ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${branch}`],
    { encoding: "utf8" },
  );
  if (absent.status === 2) {
    console.log(
      JSON.stringify(
        {
          valid: true,
          mode: "new",
          baseSha,
          releaseBranch: branch,
          lockedCandidate: lock.candidate,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  throw new Error(`Unable to inspect release candidate branch ${branch}: ${fetched.stderr || absent.stderr}`);
}
const candidateSha = git(["rev-parse", remoteRef]);
const ancestry = spawnSync(
  "git",
  ["merge-base", "--is-ancestor", baseSha, candidateSha],
  { encoding: "utf8" },
);
if (ancestry.status !== 0)
  throw new Error(
    `STALE_RELEASE_CANDIDATE: ${branch}@${candidateSha} is not descended from exact base ${baseSha}; refusing resume`,
  );

const candidateRelease = JSON.parse(
  git(["show", `${remoteRef}:src/data/release.json`]),
);
if (candidateRelease.release !== target)
  throw new Error("Existing release candidate carries the wrong release version");
const zenodo = candidateRelease.dataset?.zenodo;
if (
  String(zenodo?.recordId) !== String(lock.candidate.recordId) ||
  zenodo?.versionDoi !== lock.candidate.versionDoi ||
  zenodo?.conceptDoi !== lock.conceptDoi
)
  throw new Error("Existing release candidate disagrees with the locked Zenodo identity");

console.log(
  JSON.stringify(
    {
      valid: true,
      mode: "resume",
      baseSha,
      candidateSha,
      releaseBranch: branch,
      lockedCandidate: lock.candidate,
    },
    null,
    2,
  ),
);
