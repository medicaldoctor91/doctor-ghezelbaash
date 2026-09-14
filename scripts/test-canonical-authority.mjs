import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  deriveCanonicalAuthority,
  deriveCanonicalGraphFacts,
  derivePublicationData,
} from "../src/lib/canonical-authority.mjs";

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const [release, graph] = await Promise.all([
  readJson("src/data/release.json"),
  readJson("src/data/semantic/knowledge-graph.jsonld"),
]);
const node = (source, id) =>
  source["@graph"].find((candidate) => candidate["@id"] === id);
const claimId = `${release.canonicalUrl}#claim-clinic-owner-confirmed-operating-facts`;

test("publication data follows graph facts while keeping lifecycle source unchanged", () => {
  const changed = structuredClone(graph);
  node(changed, release.primaryEntity.id).name.find(
    (name) => name["@language"] === "en",
  )["@value"] = "Test physician";
  node(changed, release.canonicalUrl + "#identifier-person-irimc").value =
    "123456";
  const before = JSON.stringify(release);
  const data = derivePublicationData(release, changed);
  assert.equal(data.primaryEntity.name, "Test physician");
  assert.equal(data.primaryEntity.irimc, "123456");
  assert.equal(data.release, release.release);
  assert.deepEqual(data.dataset.zenodo, release.dataset.zenodo);
  assert.equal(JSON.stringify(release), before);
  assert.deepEqual(Object.keys(release.primaryEntity), ["id"]);
});

test("authored lifecycle data cannot supply semantic fields that a projection would overwrite", () => {
  for (const change of [
    (source) => {
      source.primaryEntity.name = "Conflicting physician";
    },
    (source) => {
      source.clinic.hours = "Conflicting hours";
    },
    (source) => {
      source.dataset.creator = "Conflicting creator";
    },
    (source) => {
      source.reviewedBy = "Conflicting reviewer";
    },
  ]) {
    const source = structuredClone(release);
    change(source);
    assert.throws(() => derivePublicationData(source, graph), /must contain only/);
  }
});

test("identity lexical roles are graph-owned and pairwise disjoint", () => {
  const authority = deriveCanonicalAuthority(release, graph);
  const person = node(graph, release.primaryEntity.id);
  const classifiedAliases = new Set([
    ...person["skos:altLabel"],
    ...person["skos:hiddenLabel"],
  ]);
  assert.deepEqual(
    authority.primaryEntity.officialAliases,
    person.alternateName.filter((value) => !classifiedAliases.has(value)),
  );
  assert.deepEqual(
    authority.primaryEntity.reconciliationAliases,
    person["skos:altLabel"],
  );
  assert.deepEqual(
    authority.primaryEntity.retrievalVariants,
    person["skos:hiddenLabel"],
  );

  const overlap = structuredClone(graph);
  const overlapPerson = node(overlap, release.primaryEntity.id);
  overlapPerson["skos:hiddenLabel"].push(overlapPerson["skos:altLabel"][0]);
  assert.throws(
    () => deriveCanonicalAuthority(release, overlap),
    /lexical labels overlap/,
  );
});

test("identifier values require an actual typed relationship to the owning entity", () => {
  for (const [ownerId, suffix] of [
    [release.primaryEntity.id, "identifier-person-irimc"],
    [release.clinic.id, "identifier-clinic-google-place-id"],
  ]) {
    const id = release.canonicalUrl + "#" + suffix;
    const detached = structuredClone(graph);
    const owner = node(detached, ownerId);
    owner.identifier = owner.identifier.filter(
      (reference) => reference["@id"] !== id,
    );
    assert.throws(
      () => deriveCanonicalAuthority(release, detached),
      /linked once from its owner/,
    );
    const wrongType = structuredClone(graph);
    node(wrongType, id)["@type"] = "Organization";
    assert.throws(
      () => deriveCanonicalAuthority(release, wrongType),
      /PropertyValue/,
    );
  }
});

test("the clinic owns its closure and exactly one valid address reference", () => {
  const detached = structuredClone(graph);
  const clinic = node(detached, release.clinic.id);
  clinic.openingHoursSpecification = clinic.openingHoursSpecification.filter(
    (reference) => !reference["@id"].endsWith("#clinic-friday-closed"),
  );
  assert.throws(
    () => deriveCanonicalAuthority(release, detached),
    /Friday closure/,
  );
  const malformed = structuredClone(graph);
  const malformedClinic = node(malformed, release.clinic.id);
  malformedClinic.address = [malformedClinic.address, {}];
  assert.throws(
    () => deriveCanonicalAuthority(release, malformed),
    /one clinic address/,
  );
});

test("compact graph facts do not require full publication provenance", () => {
  const compact = structuredClone(graph);
  compact["@graph"] = compact["@graph"].filter(
    (candidate) => candidate["@id"] !== claimId,
  );
  const facts = deriveCanonicalGraphFacts(release, compact);
  assert.equal(facts.clinic["@id"], release.clinic.id);
  assert.equal(facts.clinicHours.fridayClosed, true);
  assert.throws(
    () => deriveCanonicalAuthority(release, compact),
    /missing owner-confirmed clinic claim/,
  );
});

test("owner confirmation provenance is a graph-native claim", () => {
  const authority = deriveCanonicalAuthority(release, graph);
  assert.equal(authority.clinicAuthority.ownerConfirmed, true);
  assert.equal(authority.clinicAuthority.truthVerifiedAt, "2026-08-07");
  assert.equal(authority.clinicAuthority.truthAuthority, "owner-confirmed");

  const wrongAuthor = structuredClone(graph);
  node(wrongAuthor, claimId).author = { "@id": release.clinic.id };
  assert.throws(
    () => deriveCanonicalAuthority(release, wrongAuthor),
    /owner-confirmed clinic provenance drift/,
  );

  const detached = structuredClone(graph);
  const detachedClinic = node(detached, release.clinic.id);
  detachedClinic.subjectOf = detachedClinic.subjectOf.filter(
    (reference) => reference["@id"] !== claimId,
  );
  assert.throws(
    () => deriveCanonicalAuthority(release, detached),
    /owner-confirmed clinic provenance drift/,
  );
});

test("the published identity mesh is the graph-owned sameAs set", () => {
  const authority = deriveCanonicalAuthority(release, graph);
  const person = node(graph, release.primaryEntity.id);
  assert.deepEqual(authority.primaryEntity.verifiedWebIdentityMesh, person.sameAs);
  const duplicate = structuredClone(graph);
  node(duplicate, release.primaryEntity.id).sameAs.push(person.sameAs[0]);
  assert.throws(
    () => deriveCanonicalAuthority(release, duplicate),
    /duplicate physician sameAs/,
  );
});
