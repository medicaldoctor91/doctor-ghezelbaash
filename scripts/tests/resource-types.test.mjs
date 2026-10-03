import test from "node:test";
import assert from "node:assert/strict";
import { MACHINE_RESOURCES, resourceContentType, resourceDescriptorTitle } from "../../src/lib/resources.mjs";

test("descriptor titles choose authored scalar or matching-language literals without joining alternatives", () => {
  assert.equal(resourceDescriptorTitle({ "dcterms:title": ["Canonical graph", "Alternate authored title"] }), "Canonical graph");
  const node = { "dcterms:title": [{ "@value": "گراف", "@language": "fa" }, { "@value": "Canonical graph", "@language": "en" }] };
  const original = JSON.stringify(node);
  assert.equal(resourceDescriptorTitle(node), "Canonical graph");
  assert.equal(resourceDescriptorTitle(node, "fa-IR"), "گراف");
  assert.equal(resourceDescriptorTitle({ name: { "@value": "Named source", "@language": "en" } }), "Named source");
  assert.equal(resourceDescriptorTitle({ "dcterms:title": { "@id": "https://example.test/title" } }), undefined);
  assert.equal(JSON.stringify(node), original);
  for (const resource of MACHINE_RESOURCES.filter((entry) => entry.descriptorRoles.length))
    assert.equal(typeof resource.descriptorTitle, "string", resource.path);
});

test("multiple authored conformance profiles serialize as one quoted URI list", () => {
  const profileIris = ["https://www.w3.org/TR/prov-o/", "https://www.w3.org/TR/json-ld11/"];
  const resource = { path: "provenance.jsonld", mediaType: "application/ld+json", profileIris };
  assert.equal(resourceContentType(resource), 'application/ld+json; profile="https://www.w3.org/TR/prov-o/ https://www.w3.org/TR/json-ld11/"');
  assert.equal(resourceContentType({ ...resource, profileIris: [...profileIris, profileIris[0]] }), resourceContentType(resource));
  const canonical = MACHINE_RESOURCES.find((entry) => entry.path === resource.path);
  assert.deepEqual(canonical.profileIris, profileIris);
  assert.equal(canonical.contentType, resourceContentType(resource));
  assert(Object.isFrozen(canonical.profileIris));
});

test("single-profile callers retain their existing content type and profile IRI", () => {
  const profileIri = "http://mlcommons.org/croissant/1.0";
  assert.equal(resourceContentType({ path: "croissant.json", mediaType: "application/ld+json", profileIri }),
    'application/ld+json; profile="http://mlcommons.org/croissant/1.0"');
  const croissant = MACHINE_RESOURCES.find((entry) => entry.path === "croissant.json");
  assert.equal(croissant.profileIris.length, 1);
  assert.equal(croissant.profileIri, croissant.profileIris[0]);
});

test("profile lists cannot smuggle whitespace, header controls or unresolved references", () => {
  for (const profiles of [["https://example.test/good", "https://example.test/bad profile"],
    ["https://example.test/a\r\nInjected: yes"], [undefined], [{ "@id": "https://example.test/profile" }]])
    assert.throws(() => resourceContentType({ path: "x", mediaType: "application/ld+json", profileIris: profiles }), /Invalid machine resource profile IRI/);
  assert.throws(() => resourceContentType({ path: "x", mediaType: "application/ld+json", profileIris: "https://example.test/profile" }), /profile list/);
});
