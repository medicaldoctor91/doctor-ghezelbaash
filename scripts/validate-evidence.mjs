import path from "node:path";
import { readFile } from "node:fs/promises";
import { deriveEvidenceSnapshot } from "./lib/projection-context.mjs";
const root = process.cwd(),
  data = path.join(root, "src/data");
const readJson = async (p) =>
  JSON.parse(await readFile(path.join(data, p), "utf8"));
const release = await readJson("release.json"),
  inv = await readJson("release-invariants.json"),
  registry = await readJson("evidence-registry.json"),
  snapshot = deriveEvidenceSnapshot(release, registry);
const fail = (m) => {
  throw new Error(m);
};
const d0 = new Date(snapshot.observedAt + "T00:00:00Z"),
  d1 = new Date(release.dateModified + "T00:00:00Z"),
  age = (d1 - d0) / 86400000;
if (age < 0 || age > inv.evidenceSnapshotMaxAgeDays)
  fail(
    "Evidence snapshot age " +
      age +
      "d exceeds " +
      inv.evidenceSnapshotMaxAgeDays,
  );
const evidence = registry.evidence || [],
  ids = new Set(evidence.map((x) => x.id));
if (ids.size !== evidence.length) fail("Evidence registry IDs must be unique");
const tierA = evidence.filter((x) => x.tier === "A");
if (tierA.length < 8) fail("Tier-A evidence registry unexpectedly sparse");
for (const e of evidence) {
  if (
    !["A", "B", "C"].includes(e.tier) ||
    !/^https:\/\//.test(e.url) ||
    !e.verifiedAt ||
    !e.liveStatus
  )
    fail("Invalid evidence " + e.id);
}
console.log(
  JSON.stringify(
    {
      valid: true,
      release: release.release,
      tierAEvidence: tierA.length,
      evidenceEntries: snapshot.entries.length,
    },
    null,
    2,
  ),
);
