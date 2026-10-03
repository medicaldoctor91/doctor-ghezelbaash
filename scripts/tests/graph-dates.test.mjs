import test from "node:test";
import assert from "node:assert/strict";
import { dateValue, temporalValue, validCalendarDate, requireCalendarDate, rdfTemporalLiteral } from "../../src/lib/graph-dates.mjs";
import { datasetRevisionDate, validRevisionDate } from "../lib/release-graph.mjs";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { deriveCanonicalGraphFacts, deriveClinicOwnerConfirmation } from "../../src/lib/canonical-graph-facts.mjs";

const date = (value) => ({ "@value": value, "@type": "http://www.w3.org/2001/XMLSchema#date" });

test("calendar dates accept typed literals and retain strict date and datatype validation", () => {
  for (const value of ["2026-10-03", date("2026-10-03"), date("2024-02-29")]) {
    assert(validCalendarDate(value));
    assert(validRevisionDate(value));
    assert.equal(requireCalendarDate(value, "date"), dateValue(value));
  }
  for (const value of ["2026-02-30", date("2026-02-30"), date("2026-13-01"),
    date("2026-10-03T00:00:00Z"), { "@value": "2026-10-03", "@type": "xsd:integer" },
    { "@value": "2026-10-03", "@language": "en" }, [date("2026-10-03")]]) {
    assert(!validCalendarDate(value));
    assert.throws(() => requireCalendarDate(value, "date"), /valid ISO calendar date/);
  }
});

test("Dataset revisions compare normalized dates and reject invalid or earlier revisions", () => {
  const release = { dataset: { id: "https://example.test/dataset" }, dateModified: date("2026-09-18") };
  const dataset = { "@id": release.dataset.id, dateModified: date("2026-10-03") };
  assert.equal(datasetRevisionDate([dataset], release), "2026-10-03");
  assert.deepEqual(dataset.dateModified, date("2026-10-03"));
  for (const invalid of [date("2026-09-17"), date("2026-02-30"), undefined])
    assert.throws(() => datasetRevisionDate([{ ...dataset, dateModified: invalid }], release), /on or after its base release date/);
});

test("authority DTO dates preserve typed source dates and match plain-literal derivation", () => {
  const { graph, lifecycle } = readCanonicalInputs();
  const original = JSON.stringify(graph);
  const typed = deriveCanonicalGraphFacts(lifecycle, graph);
  assert.equal(typed.profile["@id"], typed.page["@id"]);
  assert(typed.page["@type"].includes("ProfilePage") && typed.page["@type"].includes("MedicalWebPage"));
  assert.equal(typed.person.url, lifecycle.canonicalUrl);
  assert.equal(typed.person["@id"], lifecycle.primaryEntity.id);
  const typedConfirmation = deriveClinicOwnerConfirmation(typed);
  const plainGraph = structuredClone(graph);
  for (const node of plainGraph["@graph"]) for (const key of ["lastReviewed", "dateCreated"])
    if (node[key]?.["@value"] !== undefined) node[key] = node[key]["@value"];
  const plain = deriveCanonicalGraphFacts(lifecycle, plainGraph);
  assert.equal(typed.medicalReviewedAt, plain.medicalReviewedAt);
  assert.deepEqual(typedConfirmation, deriveClinicOwnerConfirmation(plain));
  assert.equal(JSON.stringify(graph), original);
});

test("homepage authority rejects a separate profile URL or lost medical/profile typing", () => {
  const { graph, lifecycle } = readCanonicalInputs();
  for (const invalid of ["ProfilePage", "MedicalWebPage"]) {
    const fixture = structuredClone(graph);
    fixture["@graph"].find((node) => node["@id"] === lifecycle.canonicalUrl + "webpage")["@type"] = invalid;
    assert.throws(() => deriveCanonicalGraphFacts(lifecycle, fixture), /ProfilePage/);
  }
  const fixture = structuredClone(graph);
  fixture["@graph"].find((node) => node["@id"] === lifecycle.primaryEntity.id).url = lifecycle.primaryEntity.id;
  assert.throws(() => deriveCanonicalGraphFacts(lifecycle, fixture), /homepage must be/);
});

test("timestamp projection preserves the exact source offset and fractional seconds", () => {
  const value = { "@value": "2026-06-27T09:14:43.282+03:30", "@type": "http://www.w3.org/2001/XMLSchema#dateTime" };
  assert.equal(temporalValue(value), value["@value"]);
  assert.equal(temporalValue(date("2026-10-03")), "2026-10-03");
  assert(!validCalendarDate(value));
  assert.deepEqual(rdfTemporalLiteral(value, "timestamp"), value);
  assert.deepEqual(rdfTemporalLiteral("2026-10-03", "date"), date("2026-10-03"));
  assert.deepEqual(rdfTemporalLiteral(date("2026-10-03"), "date"), date("2026-10-03"));
  for (const invalid of [date("2026-02-30"), { ...value, "@value": "2026-02-30T00:00:00Z" },
    { ...value, "@value": "2026-10-03T25:00:00Z" }, { ...value, "@type": "xsd:integer" }])
    assert.throws(() => rdfTemporalLiteral(invalid, "timestamp"), /valid RDF date or dateTime/);
});
