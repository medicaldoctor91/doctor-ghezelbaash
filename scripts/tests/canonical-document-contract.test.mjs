import test from "node:test";
import assert from "node:assert/strict";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { assertCanonicalDocumentCoverage, assertCanonicalDocumentProjection } from "../../src/lib/canonical-document-contract.mjs";
import { localizedText } from "../../src/lib/page-discovery-jsonld.mjs";

const { graph } = readCanonicalInputs();
const homeId = "https://www.ghezelbaash.ir/webpage";

test("the canonical graph defines all 72 published documents with one homepage physician profile", () => {
  const documents = assertCanonicalDocumentCoverage(graph);
  assert.equal(documents.length, 72);
  assert.equal(documents.filter((node) => [node["@type"]].flat().includes("ProfilePage")).length, 1);
  assert.equal(documents.find((node) => node["@id"] === homeId).url, "https://www.ghezelbaash.ir/");
});

test("missing canonical documents, competing profiles and untyped subjects fail", () => {
  const documents = assertCanonicalDocumentCoverage(graph);
  const pageId = documents.find((node) => node["@id"] !== homeId)["@id"];
  const missing = structuredClone(graph);
  missing["@graph"] = missing["@graph"].filter((node) => node["@id"] !== pageId);
  assert.throws(() => assertCanonicalDocumentCoverage(missing), /undefined part|lacks a published document/);
  const competing = structuredClone(graph);
  competing["@graph"].find((node) => node["@id"] === pageId)["@type"] = "ProfilePage";
  assert.throws(() => assertCanonicalDocumentCoverage(competing), /remain on the homepage/);
  const untyped = structuredClone(graph);
  untyped["@graph"].find((node) => node["@id"] === pageId).mainEntity = { "@id": "https://example.test/undefined" };
  assert.throws(() => assertCanonicalDocumentCoverage(untyped), /typed source definition/);
});

test("inline documents preserve canonical identity and topology while formatting RDF dates", () => {
  const source = assertCanonicalDocumentCoverage(graph).find((node) => node["@id"] !== homeId);
  const projected = structuredClone(source);
  projected.dateModified = localizedText(source.dateModified);
  assert.equal(assertCanonicalDocumentProjection(graph, projected), source);
  for (const property of ["@id", "url", "mainEntity", "isPartOf", "breadcrumb", "dateModified"]) {
    const broken = structuredClone(projected);
    broken[property] = property === "dateModified" ? "2020-01-01" : { "@id": "https://example.test/wrong" };
    assert.throws(() => assertCanonicalDocumentProjection(graph, broken), /source definition|document drift|revision drift/);
  }
});
