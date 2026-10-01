import test from "node:test";
import assert from "node:assert/strict";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { projectPageJsonLd } from "../../src/lib/page-discovery-jsonld.mjs";
import { assertRichResultsDocument } from "../../src/lib/rich-results-contract.mjs";

const inputs = readCanonicalInputs();
const typed = (node, type) => [node["@type"]].flat().includes(type);
const mutate = (type, change) => {
  const source = structuredClone(inputs.pageJsonLd);
  const node = source.flatMap((script) => script.document["@graph"]).find((node) => typed(node, type));
  change(node);
  return source;
};
test("published discovery satisfies the profile, clinic, image and video contracts", () => {
  const before = JSON.stringify(inputs.pageJsonLd);
  const document = projectPageJsonLd(inputs.pageJsonLd)[0].document;
  const counts = assertRichResultsDocument(document);
  assert.equal(counts.profiles, 1);
  assert.equal(counts.localBusinesses, 1);
  assert.equal(counts.images, 1);
  assert.equal(counts.videos, inputs.graph["@graph"].filter((node) => typed(node, "VideoObject")).length);
  assert.equal(JSON.stringify(inputs.pageJsonLd), before);
});
test("a missing primary entity name blocks page publication", () => {
  assert.throws(() => projectPageJsonLd(mutate("Person", (node) => { delete node.name; })), /mainEntity.name/);
});
test("broken or wrongly typed clinic addresses block publication", () => {
  assert.throws(() => projectPageJsonLd(mutate("MedicalClinic", (node) => {
    node.address = { "@id": "https://www.ghezelbaash.ir/missing-address" };
  })), /LocalBusiness.address/);
  const document = structuredClone(projectPageJsonLd(inputs.pageJsonLd)[0].document);
  document["@graph"].find((node) => typed(node, "PostalAddress"))["@type"] = "Organization";
  assert.throws(() => assertRichResultsDocument(document), /LocalBusiness.address/);
});
test("image metadata cannot lose its content URL or typed creator", () => {
  assert.throws(() => projectPageJsonLd(mutate("ImageObject", (node) => { delete node.contentUrl; })), /ImageObject.contentUrl/);
  assert.throws(() => projectPageJsonLd(mutate("ImageObject", (node) => {
    node.creator = { "@id": "https://www.ghezelbaash.ir/missing-creator" };
  })), /ImageObject.creator/);
  assert.throws(() => projectPageJsonLd(mutate("ImageObject", (node) => { node.contentUrl = "javascript:alert(1)"; })), /HTTP/);
});
test("video required properties cannot disappear in projection", () => {
  for (const property of ["name", "thumbnailUrl", "uploadDate"])
    assert.throws(() => projectPageJsonLd(mutate("VideoObject", (node) => { delete node[property]; })), new RegExp("VideoObject." + property));
  assert.throws(() => projectPageJsonLd(mutate("VideoObject", (node) => { node.thumbnailUrl = "/relative.webp"; })), /absolute URL/);
});
test("video dates must be real instants and known duration must be positive", () => {
  for (const uploadDate of ["2026-02-30", "2026-02-30T10:00:00Z", "2026-09-30T25:00:00Z", "2026-09-30T12:00:00"])
    assert.throws(() => projectPageJsonLd(mutate("VideoObject", (node) => { node.uploadDate = uploadDate; })), /real ISO timestamp/);
  for (const duration of ["PT", "PT0S", "P1DT", "P" + "9".repeat(400) + "D", "invalid"])
    assert.throws(() => projectPageJsonLd(mutate("VideoObject", (node) => { node.duration = duration; })), /positive ISO duration/);
});
test("duplicate entities and research candidates cannot enter the published graph", () => {
  const document = structuredClone(projectPageJsonLd(inputs.pageJsonLd)[0].document);
  document["@graph"].push(structuredClone(document["@graph"][0]));
  assert.throws(() => assertRichResultsDocument(document), /duplicate entity/);
  document["@graph"].pop();
  document["@graph"].push({ "@id": "https://www.ghezelbaash.ir/research-review", "@type": "Review", name: "Research-only review" });
  assert.throws(() => assertRichResultsDocument(document), /research-only candidate/);
});
test("ProfilePage modification timestamps reject impossible dates", () => {
  assert.throws(() => projectPageJsonLd(mutate("ProfilePage", (node) => { node.dateModified = "2026-02-30T10:00:00Z"; })), /ProfilePage.dateModified/);
});

test("a typed clinic address cannot silently lose its authored physical-address fields", () => {
  const projected = projectPageJsonLd(inputs.pageJsonLd)[0].document;
  for (const property of ["streetAddress", "addressLocality", "addressRegion", "addressCountry", "postalCode"]) {
    const document = structuredClone(projected);
    const address = document["@graph"].find((node) => typed(node, "PostalAddress"));
    delete address[property];
    assert.throws(() => assertRichResultsDocument(document), new RegExp("clinic address." + property));
  }
});
