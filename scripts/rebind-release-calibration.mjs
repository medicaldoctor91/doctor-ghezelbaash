import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import {
  renderSourceSnapshot,
  validateRenderCalibration,
} from "./lib/render-calibration.mjs";

const root = process.cwd();
const calibrationPath = path.join(root, "src/data/render-calibration.json");
const sha = (value) =>
  createHash("sha256").update(value).digest("hex");
const readJson = async (file) =>
  JSON.parse(await readFile(path.join(root, file), "utf8"));
const gitJson = (file) =>
  JSON.parse(
    execFileSync("git", ["show", `HEAD:${file}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};
const semver = (value) => {
  must(/^\d+\.\d+\.\d+$/.test(String(value || "")), `Invalid release version: ${value}`);
  return String(value).split(".").map(Number);
};
const newerThan = (candidate, baseline) => {
  const a = semver(candidate);
  const b = semver(baseline);
  return (
    a[0] > b[0] ||
    (a[0] === b[0] && a[1] > b[1]) ||
    (a[0] === b[0] && a[1] === b[1] && a[2] > b[2])
  );
};
const normalizedLock = (lock) => {
  const copy = structuredClone(lock);
  delete copy.version;
  if (copy.packages?.[""]) delete copy.packages[""].version;
  return copy;
};

const [calibration, snapshot] = await Promise.all([
  readJson("src/data/render-calibration.json"),
  renderSourceSnapshot(root),
]);
const meta = calibration?._meta;
must(meta && typeof meta === "object", "Render calibration metadata is missing");

if (meta.sourceSha256 === snapshot.sourceSha256) {
  console.log(
    JSON.stringify({
      releaseCalibrationRebind: "NOOP",
      sourceSha256: snapshot.sourceSha256,
      reason: "calibration-already-current",
    }),
  );
  process.exit(0);
}

must(Array.isArray(meta.inputs), "Render calibration source inputs are missing");
must(
  sha(JSON.stringify(meta.inputs)) === meta.sourceSha256,
  "Stored calibration source fingerprint does not reproduce from its recorded inputs",
);

const previousInputs = new Map(meta.inputs);
const currentInputs = new Map(snapshot.inputs);
must(
  previousInputs.size === meta.inputs.length && currentInputs.size === snapshot.inputs.length,
  "Render calibration input inventory contains duplicate keys",
);
const names = [...new Set([...previousInputs.keys(), ...currentInputs.keys()])].sort();
const changedInputs = names.filter(
  (name) => previousInputs.get(name) !== currentInputs.get(name),
);
must(
  changedInputs.length === 1 && changedInputs[0] === "package-lock.json",
  `Render calibration requires real remeasurement; changed inputs: ${changedInputs.join(", ") || "none"}`,
);

const [baselineRelease, currentRelease, baselineLock, currentLock, currentPackage] =
  await Promise.all([
    Promise.resolve(gitJson("src/data/release.json")),
    readJson("src/data/release.json"),
    Promise.resolve(gitJson("package-lock.json")),
    readJson("package-lock.json"),
    readJson("package.json"),
  ]);

must(
  newerThan(currentRelease.release, baselineRelease.release),
  `Calibration auto-rebind is release-only: ${baselineRelease.release} -> ${currentRelease.release}`,
);
must(
  baselineLock.version === baselineRelease.release &&
    baselineLock.packages?.[""]?.version === baselineRelease.release,
  "Baseline package-lock release identity drift",
);
must(
  currentLock.version === currentRelease.release &&
    currentLock.packages?.[""]?.version === currentRelease.release &&
    currentPackage.version === currentRelease.release,
  "Candidate package release identity drift",
);
must(
  isDeepStrictEqual(normalizedLock(baselineLock), normalizedLock(currentLock)),
  "package-lock changed beyond root release-version metadata; Chromium remeasurement is required",
);

calibration._meta.sourceSha256 = snapshot.sourceSha256;
calibration._meta.inputs = snapshot.inputs;
const content = `${JSON.stringify(calibration, null, 2)}\n`;
const temporaryPath = `${calibrationPath}.${process.pid}-${Date.now()}.tmp`;
try {
  await writeFile(temporaryPath, content, { flag: "wx", mode: 0o644 });
  await rename(temporaryPath, calibrationPath);
} finally {
  await rm(temporaryPath, { force: true });
}

const verified = await validateRenderCalibration({ root });
must(
  verified.sourceSha256 === snapshot.sourceSha256,
  "Calibration post-rebind source fingerprint drift",
);
execFileSync("git", ["add", "src/data/render-calibration.json"], {
  cwd: root,
  stdio: "inherit",
});

console.log(
  JSON.stringify(
    {
      releaseCalibrationRebind: "PASS",
      fromRelease: baselineRelease.release,
      toRelease: currentRelease.release,
      changedInputs,
      dependencyGraphChanged: false,
      geometryRemeasured: false,
      sourceSha256: snapshot.sourceSha256,
      calibrationSha256: verified.calibrationSha256,
      staged: "src/data/render-calibration.json",
    },
    null,
    2,
  ),
);
