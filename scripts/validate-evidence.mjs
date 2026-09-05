import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  deriveEvidenceRegistry,
  deriveEvidenceSnapshot,
} from "./lib/projection-context.mjs";
const root = process.cwd(),
  data = path.join(root, "src/data");
const readJson = async (p) =>
  JSON.parse(await readFile(path.join(data, p), "utf8"));
const release = await readJson("release.json"),
  inv = await readJson("release-invariants.json"),
  graph = await readJson("semantic/knowledge-graph.jsonld"),
  registry = deriveEvidenceRegistry(
    release,
    await readJson("evidence-registry.json"),
  ),
  snapshot = deriveEvidenceSnapshot(release, registry);
const fail = (m) => {
  throw new Error(m);
};
const d0 = new Date(snapshot.observedAt + "T00:00:00Z"),
  d1 = new Date(release.dateModified + "T00:00:00Z"),
  age = Math.max(0, (d1 - d0) / 86400000);
if (!Number.isFinite(age) || age > inv.evidenceSnapshotMaxAgeDays)
  fail(
    "Evidence snapshot age " +
      age +
      "d exceeds " +
      inv.evidenceSnapshotMaxAgeDays,
  );
const byId = new Map(graph["@graph"].map((node) => [node["@id"], node]));
const roles = new Set([
  "identity-reference",
  "medical-reference",
  "first-party-release-preservation",
]);
const evidence = registry.evidence || [],
  ids = new Set(evidence.map((x) => x.id));
if (ids.size !== evidence.length) fail("Evidence registry IDs must be unique");
const tierA = evidence.filter((x) => x.tier === "A");
if (tierA.length < 8) fail("Tier-A evidence registry unexpectedly sparse");
for (const e of evidence) {
  if (!roles.has(e.role))
    fail("Evidence requires an explicit source role " + e.id);
  const medical = e.supports?.includes("medical-claim-context");
  if ((e.role === "medical-reference") !== Boolean(medical))
    fail("Evidence medical role and claim scope disagree " + e.id);
  if (e.role === "medical-reference" && e.subjectIds?.length)
    fail("Medical reference must not inherit identity subjects " + e.id);
  if (e.role === "identity-reference") {
    const canonical = byId.get(e.id);
    if (canonical && e.subjectIds)
      fail("Identity subjects must have one canonical owner " + e.id);
    const subjects = [
      canonical?.about ?? e.subjectIds?.map((id) => ({ "@id": id })),
    ]
      .flat()
      .filter(Boolean);
    if (
      !subjects.length ||
      subjects.some(
        (item) =>
          ![release.primaryEntity.id, release.clinic.id].includes(item["@id"]),
      )
    )
      fail("Identity evidence lacks explicit canonical subjects " + e.id);
  }
  if (e.role === "first-party-release-preservation" && e.tier !== "P")
    fail(
      "First-party preservation cannot claim independent corroboration " + e.id,
    );
  if (
    !Object.hasOwn(registry.tiers, e.tier) ||
    !/^https:\/\//.test(e.url) ||
    (!e.verifiedAt && e.liveStatus !== "not-verified-for-current-release") ||
    !e.liveStatus
  )
    fail("Invalid evidence " + e.id);
  if (e.verifiedAt) {
    const observed = new Date(`${e.verifiedAt}T00:00:00Z`);
    if (!Number.isFinite(observed.getTime()) || observed > d0)
      fail("Invalid evidence observation chronology " + e.id);
    const entryAge = Math.max(0, (d1 - observed) / 86400000);
    if (entryAge > inv.evidenceSnapshotMaxAgeDays)
      fail("Evidence observation exceeds maximum age " + e.id);
  }
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
