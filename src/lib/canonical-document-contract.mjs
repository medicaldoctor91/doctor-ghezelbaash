import assert from "node:assert/strict";
import { URL_ARCHITECTURE } from "./url-architecture.mjs";
import { temporalValue } from "./graph-dates.mjs";

const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const types = (node) => values(node?.["@type"]);
const references = (value) => values(value).map((ref) => ref?.["@id"]).sort();

/** The downloadable graph defines every published document, not only its link. */
export function assertCanonicalDocumentCoverage(graph, policy = URL_ARCHITECTURE) {
  const byId = new Map(graph["@graph"].map((node) => [node["@id"], node]));
  const origin = policy.canonicalOrigin;
  const homeId = origin + "/webpage";
  const home = byId.get(homeId);
  assert(types(home).includes("ProfilePage") && types(home).includes("MedicalWebPage"),
    "Canonical homepage must define its physician profile and medical document");
  const physicianId = home.mainEntity?.["@id"];
  const physician = byId.get(physicianId);
  assert(types(physician).includes("Person"), "Canonical home mainEntity must resolve to the physician");
  assert.equal(physician.url, origin + "/", "Canonical physician must use the homepage URL");
  assert.deepEqual(physician.mainEntityOfPage, { "@id": homeId });
  const documents = [];
  for (const resource of policy.resources) {
    const url = origin + resource.path;
    const id = resource.path === "/" ? homeId : url + "#webpage";
    const document = byId.get(id);
    assert(document, "Canonical graph lacks a published document definition: " + id);
    assert(types(document).some((type) => ["WebPage", "MedicalWebPage", "ProfilePage", "ContactPage"].includes(type)),
      "Canonical document lacks its page type: " + id);
    assert.equal(document.url, url, "Canonical graph document URL drift: " + id);
    assert(types(byId.get(document.mainEntity?.["@id"])).length,
      "Canonical document mainEntity lacks a typed source definition: " + id);
    if (resource.path !== "/") {
      assert(!types(document).includes("ProfilePage"), "Physician ProfilePage must remain on the homepage: " + id);
      assert(references(document.isPartOf).includes(homeId), "Canonical document must belong to the physician homepage: " + id);
      assert.equal(document.author?.["@id"], physicianId, "Canonical document author IRI drift: " + id);
      assert.equal(document.publisher?.["@id"], physicianId, "Canonical document publisher IRI drift: " + id);
    }
    for (const ref of [...values(document.hasPart), ...values(document.breadcrumb)])
      assert(byId.has(ref?.["@id"]), "Canonical document has an undefined part or breadcrumb: " + id);
    documents.push(document);
  }
  return documents;
}

/** Browser summaries may vary, but document identity and relationships cannot. */
export function assertCanonicalDocumentProjection(graph, projected) {
  const source = graph["@graph"].find((node) => node["@id"] === projected?.["@id"]);
  assert(source, "Inline document has no canonical source definition: " + projected?.["@id"]);
  for (const property of ["@id", "url", "mainEntity", "author", "publisher", "breadcrumb"])
    assert.deepEqual(projected[property], source[property], "Inline/canonical document drift: " + projected["@id"] + " " + property);
  for (const property of ["@type", "isPartOf", "hasPart"])
    assert.deepEqual(property === "@type" ? types(projected).toSorted() : references(projected[property]),
      property === "@type" ? types(source).toSorted() : references(source[property]),
      "Inline/canonical document drift: " + projected["@id"] + " " + property);
  if (source.dateModified !== undefined)
    assert.equal(projected.dateModified, temporalValue(source.dateModified),
      "Inline/canonical document revision drift: " + projected["@id"]);
  return source;
}
