import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertActiveIdentifierText, assertActiveAuthoredIdentifiers, FORBIDDEN_QIDS,
  IDENTIFIER_LITERAL_ALLOWLIST } from "./lib/active-identifier-contract.mjs";
import { assertMojavezEvidence, extractMojavezRecord, MOJAVEZ_ID, MOJAVEZ_RECORD,
  MOJAVEZ_URL } from "./lib/mojavez-evidence.mjs";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const baseline = {
  graph: await readJson("src/data/semantic/knowledge-graph.jsonld"),
  registry: await readJson("src/data/evidence-registry.json"),
  release: await readJson("src/data/release.json"),
  head: await readJson("src/data/semantic/head-profile.json"),
  observation: await readJson(MOJAVEZ_RECORD),
};
const page = (c) => c.graph["@graph"].find((n) => n["@id"] === MOJAVEZ_ID);
const clinic = (c) => c.graph["@graph"].find((n) => n["@id"] === c.release.clinic.id);
const entry = (c) => c.registry.evidence.find((e) => e.id === MOJAVEZ_ID);
test("reviewed Mojavez license keeps the stable ID and only evidenced person claims", () => {
  assert.doesNotThrow(() => assertMojavezEvidence(baseline));
});
const mutations = [
  ["ownership scope", (c) => entry(c).supports.push("clinic-ownership"), /scope/],
  ["generic declared status", (c) => entry(c).liveStatus = "declared-in-canonical-graph", /generic/],
  ["registry URL", (c) => entry(c).url = `${MOJAVEZ_URL}0`, /URL/],
  ["stable ID rename", (c) => entry(c).id += "-renamed", /stable evidence ID/],
  ["missing observation binding", (c) => delete entry(c).verificationRecord, /observation/],
  ["verification date", (c) => entry(c).verifiedAt = "2026-08-07", /date/],
  ["marker-only evidence", (c) => entry(c).expectedMarkers = ["19949827"], /deep-equal/],
  ["ownership title", (c) => page(c).name = "Official clinic ownership evidence", /neutral/],
  ["Clinic about", (c) => page(c).about.push({ "@id": c.release.clinic.id }), /Clinic/],
  ["Clinic mainEntity", (c) => page(c).mainEntity = { "@id": c.release.clinic.id }, /subject/],
  ["Clinic subjectOf", (c) => clinic(c).subjectOf.push({ "@id": MOJAVEZ_ID }), /ownership/],
  ["Clinic head selector", (c) => c.head.nodes[c.release.clinic.id].refAllow.subjectOf.push(MOJAVEZ_ID), /selector/],
  ["wrong observation subject", (c) => c.observation.subjectId = c.release.clinic.id, /subject/],
  ["wrong holder", (c) => c.observation.record.holderName = "Unrelated person", /holder/],
  ["wrong permit type", (c) => c.observation.record.licenseTitle = "Unrelated permit", /license/],
  ["wrong record", (c) => c.observation.record.trackingCode = "19949828", /tracking/],
  ["missing record field", (c) => delete c.observation.record.county, /field missing/],
  ["unevidenced claim binding", (c) => c.observation.claimFields["clinic-ownership"] = ["holderName"], /claim bindings/],
  ["unreviewed ownership approval", (c) => c.observation.clinicOwnershipEstablished = true, /source review/],
  ["failed source response", (c) => c.observation.response.status = 503, /HTTP 200/],
];
for (const [name, mutate, error] of mutations) test(`Mojavez rejects ${name}`, () => {
  const c = structuredClone(baseline); mutate(c);
  assert.throws(() => assertMojavezEvidence(c), error);
});

// Sanitized structural fixture based on the observed SSR field layout; no personal IDs/contact data.
const labels = ["عنوان مجوز", "مرجع صدور", "کد رهگیری", "کد آیسیک", "عنوان آیسیک",
  "تاریخ صدور / تمدید", "تاریخ اعتبار", "استان", "شهرستان"];
const fixture = `<div class="text-center font-bold my-4 mx-auto">${baseline.observation.record.holderName}</div>` +
  Object.values(baseline.observation.record).slice(1).map((value, i) =>
    `<div><span>${labels[i]}</span><span>${value}</span></div>`).join("");
test("Mojavez parser requires unique visible labelled fields, not URL/hydration markers", () => {
  assert.deepEqual(extractMojavezRecord(fixture), baseline.observation.record);
  assert.throws(() => extractMojavezRecord(`<script>${fixture}</script>`), /holder/);
  assert.throws(() => extractMojavezRecord(`<div hidden>${fixture}</div>`), /holder/);
  assert.throws(() => extractMojavezRecord(fixture + "<div><span>کد رهگیری</span><span>other</span></div>"), /ambiguous/);
  assert.throws(() => extractMojavezRecord(fixture.replace("کد رهگیری", "Changed label")), /label/);
});

for (const qid of FORBIDDEN_QIDS) test(`active authored guard rejects ${qid} outside the graph`, () => {
  for (const name of ["src/data/evidence-registry.json", "src/data/semantic/head-profile.json",
    "src/data/semantic/support-profile.json", "src/data/release.json", "src/data/document-head.json",
    "src/content-source/page.md", "src/data/templates/headers.template", "public/robots.txt",
    "src/components/DocumentHead.astro", "scripts/lib/projections/page-assets.mjs",
    ".release/policy/authority-surface-contract.json", "codemeta.json"]) {
    for (const value of [qid, `https://www.wikidata.org/entity/${qid}`, `http://www.wikidata.org/wiki/${qid}`])
      assert.throws(() => assertActiveIdentifierText(name, JSON.stringify({ identity: value })), /Forbidden active authored/);
  }
  assert.throws(() => assertActiveIdentifierText("src/data/new.json", `{"id":"\\u0051${qid.slice(1)}"}`), /Forbidden/);
  assert.doesNotThrow(() => assertActiveIdentifierText("src/content-source/page.md", `${qid}0`));
});
test("literal exceptions are explicit and do not exempt similarly named active sources", () => {
  for (const [name, reason] of Object.entries(IDENTIFIER_LITERAL_ALLOWLIST)) {
    assert.ok(reason);
    assert.doesNotThrow(() => assertActiveIdentifierText(name, FORBIDDEN_QIDS.join(" ")));
  }
  for (const name of ["archive/v1/graph.jsonld", ".release/history/v1.json", "scripts/migrations/old-contract.mjs"])
    assert.doesNotThrow(() => assertActiveIdentifierText(name, JSON.stringify(FORBIDDEN_QIDS)));
  for (const name of ["src/data/archive/old.json", "src/lib/test-final-entity-contract.mjs", "scripts/validate-new-contract.mjs"])
    assert.throws(() => assertActiveIdentifierText(name, JSON.stringify(FORBIDDEN_QIDS)), /Forbidden/);
});

test("actual validators reject the old Mojavez assertion and scan new authored files", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "final-entity-contract-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = ["README.md", "CITATION.cff", "codemeta.json", "package.json", "astro.config.mjs", "tsconfig.json",
    "src/data/semantic/knowledge-graph.jsonld", "src/data/semantic/head-profile.json",
    "src/data/semantic/support-profile.json", "src/data/evidence-registry.json", "src/data/release.json",
    "src/data/release-invariants.json", "src/data/media-metadata.json", MOJAVEZ_RECORD];
  for (const file of files) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await copyFile(file, path.join(root, file));
  }
  for (const dir of ["scripts", "public", ".release/policy", ".github/workflows"])
    await mkdir(path.join(root, dir), { recursive: true });
  for (const script of ["validate-evidence.mjs", "validate-final-entity-contract.mjs"]) {
    const run = () => execFileSync(process.execPath, [path.resolve("scripts", script)], { cwd: root, stdio: "pipe" });
    assert.doesNotThrow(run);
    const mutated = structuredClone(baseline.registry);
    mutated.evidence.find((e) => e.id === MOJAVEZ_ID).supports = ["clinic-ownership"];
    await writeFile(path.join(root, "src/data/evidence-registry.json"), JSON.stringify(mutated));
    assert.throws(run, (error) => /claimed scope/.test(error.stderr.toString()));
    await writeFile(path.join(root, "src/data/evidence-registry.json"), JSON.stringify(baseline.registry));
  }
  await writeFile(path.join(root, "src/data/introduced-later.json"), '{"id":"Q140288589"}');
  await assert.rejects(() => assertActiveAuthoredIdentifiers(root), /introduced-later/);
});
