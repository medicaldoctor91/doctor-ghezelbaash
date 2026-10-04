import test from "node:test";
import assert from "node:assert/strict";
import jsonld from "jsonld";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { browserContextFor, projectPageJsonLd } from "../../src/lib/page-discovery-jsonld.mjs";

const inputs = readCanonicalInputs();

test("browser contexts preserve and independently clone source term definitions", () => {
  const source = structuredClone(inputs.graph);
  const before = JSON.stringify(source);
  const context = browserContextFor(source);
  assert.equal(context[0], "https://schema.org");
  assert.deepEqual(context.slice(1), [source["@context"]]);
  context[1].owl = "https://example.org/changed/";
  assert.equal(JSON.stringify(source), before);
  assert.throws(() => browserContextFor({}), /requires @context/);
});

test("retained canonical relations expand in their source ontology and OWL namespaces", async () => {
  const sourceId = "https://example.org/physician";
  const evidenceId = "https://example.org/source";
  const equivalentId = "https://example.org/equivalent-physician";
  const context = browserContextFor(inputs.graph);
  // Canonical semantics stay self-contained outside the Google-facing page projection.
  const expanded = await jsonld.expand({
    "@context": context.slice(1),
    "@id": sourceId,
    evidencedBy: { "@id": evidenceId },
    "owl:sameAs": { "@id": equivalentId },
  });
  assert.deepEqual(expanded[0]["https://www.ghezelbaash.ir/ontology/evidencedBy"], [{ "@id": evidenceId }]);
  assert.deepEqual(expanded[0]["http://www.w3.org/2002/07/owl#sameAs"], [{ "@id": equivalentId }]);
  assert(!("https://schema.org/evidencedBy" in expanded[0]));
});

test("published discovery uses the simple Schema.org context without mutating canonical facts", () => {
  const before = JSON.stringify(inputs.graph);
  const projected = projectPageJsonLd(inputs.graph)[0].document;
  assert.equal(projected["@context"], "https://schema.org");
  const raw = JSON.stringify(projected["@graph"]);
  assert(!raw.includes('"@value"'));
  for (const prefix of ["prov:", "dcterms:", "skos:", "owl:"])
    assert(!raw.includes('"' + prefix), "Published discovery must not expose canonical prefix " + prefix);
  for (const property of ["evidencedBy", "evidenceBundle", "supportedBy", "contributesToAuthorityHub"])
    assert(!raw.includes('"' + property + '":'), "Published discovery must not expose custom ontology property " + property);
  assert.equal(JSON.stringify(inputs.graph), before);
});

test("home profile preserves compact portfolio references without admitting unrelated profile pages", () => {
  const source = structuredClone(inputs.graph);
  const homeId = inputs.lifecycle.canonicalUrl + "webpage";
  const unrelatedId = inputs.lifecycle.canonicalUrl + "unrelated-profile#webpage";
  const home = source["@graph"].find((node) => node["@id"] === homeId);
  source["@graph"].push({ "@id": unrelatedId, "@type": "ProfilePage", name: "Unrelated profile",
    mainEntity: { "@id": inputs.lifecycle.primaryEntity.id } });
  home.hasPart = [...home.hasPart, { "@id": unrelatedId }];
  const projected = projectPageJsonLd(source)[0].document["@graph"];
  assert.deepEqual(projected.find((node) => node["@id"] === homeId).hasPart, home.hasPart);
  assert(!projected.some((node) => node["@id"] === unrelatedId));
  assert.equal(projected.filter((node) => [node["@type"]].flat().includes("ProfilePage")).length, 1);
});
