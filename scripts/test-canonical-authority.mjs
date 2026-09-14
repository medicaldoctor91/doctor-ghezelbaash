import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { deriveCanonicalAuthority, derivePublicationData } from "../src/lib/canonical-authority.mjs";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const [release, graph, profile, clinicProvenance] = await Promise.all([
  readJson("src/data/release.json"),
  readJson("src/data/semantic/knowledge-graph.jsonld"),
  readJson("src/data/semantic/authority-profile.json"),
  readJson("src/data/semantic/clinic-assertion-provenance.json"),
]);
const node = (source, id) => source["@graph"].find((candidate) => candidate["@id"] === id);

test("publication data follows graph facts while keeping lifecycle source unchanged", () => {
  const changed = structuredClone(graph);
  node(changed, release.primaryEntity.id).name.find((name) => name["@language"] === "en")["@value"] = "Test physician";
  node(changed, release.canonicalUrl + "#identifier-person-irimc").value = "123456";
  const before = JSON.stringify(release);
  const data = derivePublicationData(release, changed, profile, clinicProvenance);
  assert.equal(data.primaryEntity.name, "Test physician");
  assert.equal(data.primaryEntity.irimc, "123456");
  assert.equal(data.release, release.release);
  assert.deepEqual(data.dataset.zenodo, release.dataset.zenodo);
  assert.equal(JSON.stringify(release), before);
  assert.deepEqual(Object.keys(release.primaryEntity), ["id"]);
});

test("authored lifecycle data cannot supply semantic fields that a projection would overwrite", () => {
  for (const change of [
    (source) => { source.primaryEntity.name = "Conflicting physician"; },
    (source) => { source.clinic.hours = "Conflicting hours"; },
    (source) => { source.dataset.creator = "Conflicting creator"; },
    (source) => { source.reviewedBy = "Conflicting reviewer"; },
  ]) {
    const source = structuredClone(release);
    change(source);
    assert.throws(() => derivePublicationData(source, graph, profile, clinicProvenance), /must contain only/);
  }
});


test("authority selection policy rejects unrelated provenance fields", () => {
  const mixed = structuredClone(profile);
  mixed.clinicAssertionProvenance = clinicProvenance;
  assert.throws(() => deriveCanonicalAuthority(release, graph, mixed), /Authority profile must contain only/);
});

test("identifier values require an actual typed relationship to the owning entity", () => {
  for (const [ownerId, suffix] of [
    [release.primaryEntity.id, "identifier-person-irimc"],
    [release.clinic.id, "identifier-clinic-google-place-id"],
  ]) {
    const id = release.canonicalUrl + "#" + suffix;
    const detached = structuredClone(graph);
    const owner = node(detached, ownerId);
    owner.identifier = owner.identifier.filter((reference) => reference["@id"] !== id);
    assert.throws(() => deriveCanonicalAuthority(release, detached, profile), /linked once from its owner/);
    const wrongType = structuredClone(graph);
    node(wrongType, id)["@type"] = "Organization";
    assert.throws(() => deriveCanonicalAuthority(release, wrongType, profile), /PropertyValue/);
  }
});

test("the clinic owns its closure and exactly one valid address reference", () => {
  const detached = structuredClone(graph);
  const clinic = node(detached, release.clinic.id);
  clinic.openingHoursSpecification = clinic.openingHoursSpecification.filter((reference) => !reference["@id"].endsWith("#clinic-friday-closed"));
  assert.throws(() => deriveCanonicalAuthority(release, detached, profile), /Friday closure/);
  const malformed = structuredClone(graph);
  const malformedClinic = node(malformed, release.clinic.id);
  malformedClinic.address = [malformedClinic.address, {}];
  assert.throws(() => deriveCanonicalAuthority(release, malformed, profile), /one clinic address/);
});

test("the published identity mesh is an explicit graph-backed selection", () => {
  const authority = deriveCanonicalAuthority(release, graph, profile);
  assert.deepEqual(authority.primaryEntity.verifiedWebIdentityMesh, profile.verifiedWebIdentityMesh);
  const invalid = structuredClone(profile);
  invalid.verifiedWebIdentityMesh.push("https://example.test/unverified-profile");
  assert.throws(() => deriveCanonicalAuthority(release, graph, invalid), /not graph-owned/);
});
