import test from "node:test";
import assert from "node:assert/strict";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { validatePageJsonLd } from "../../src/lib/page-discovery-jsonld.mjs";
import { assertRichResultsDocument } from "../../src/lib/rich-results-contract.mjs";

const inputs = readCanonicalInputs();
const typed = (node, type) => [node?.["@type"]].flat().includes(type);
const literal = (value) => value?.["@value"] ?? value;
const mutate = (type, change) => {
  const source = structuredClone(inputs.pageJsonLd);
  const node = source.flatMap((script) => script.document["@graph"]).find((node) => typed(node, type));
  change(node);
  return source;
};

test("published homepage discovery satisfies clinic, image and video contracts without unrelated profile candidates", () => {
  const before = JSON.stringify(inputs.pageJsonLd);
  const document = validatePageJsonLd(inputs.pageJsonLd)[0].document;
  const counts = assertRichResultsDocument(document, { primaryPageId: inputs.lifecycle.canonicalUrl + "webpage" });
  assert.equal(counts.profiles, 0);
  assert.equal(counts.localBusinesses, 1);
  assert.equal(counts.images, 24);
  assert.deepEqual(counts.incompleteCandidates, []);
  assert.equal(counts.videos, inputs.graph["@graph"].filter((node) => typed(node, "VideoObject")).length);
  assert.equal(JSON.stringify(inputs.pageJsonLd), before);
});

test("a missing primary entity name blocks page publication", () => {
  assert.throws(() => validatePageJsonLd(mutate("Person", (node) => { delete node.name; })), /mainEntity.name/);
});

test("FAQ pages require a named question and a typed accepted answer with published text", () => {
  const pageId = inputs.lifecycle.canonicalUrl + "botox-onset-of-action#webpage";
  const questionId = inputs.lifecycle.canonicalUrl + "question-botox-onset-of-action";
  const answerId = inputs.lifecycle.canonicalUrl + "answer-botox-onset-of-action";
  const projected = validatePageJsonLd(inputs.pageJsonLd)[0].document["@graph"];
  const question = projected.find((node) => node["@id"] === questionId);
  const answer = projected.find((node) => node["@id"] === answerId);
  const valid = { "@context": "https://schema.org", "@graph": [
    { "@id": pageId, "@type": ["MedicalWebPage", "FAQPage"], mainEntity: { "@id": questionId } },
    question, answer,
  ] };
  assert.doesNotThrow(() => assertRichResultsDocument(valid, { primaryPageId: pageId }));
  for (const [change, expected] of [
    [(nodes) => { nodes[0].mainEntity = []; }, /FAQPage.mainEntity/],
    [(nodes) => { nodes[1]["@type"] = "WebPageElement"; }, /FAQPage.mainEntity/],
    [(nodes) => { delete nodes[1].name; }, /Question.name/],
    [(nodes) => { delete nodes[1].acceptedAnswer; }, /Question.acceptedAnswer/],
    [(nodes) => { nodes[1].acceptedAnswer = { "@id": inputs.lifecycle.canonicalUrl + "missing-answer" }; }, /Question.acceptedAnswer/],
    [(nodes) => { nodes[2]["@type"] = "CreativeWork"; }, /Question.acceptedAnswer/],
    [(nodes) => { nodes[2].text = " "; }, /Answer.text/],
  ]) {
    const broken = structuredClone(valid);
    change(broken["@graph"]);
    assert.throws(() => assertRichResultsDocument(broken), expected);
  }
});

test("broken or wrongly typed clinic addresses block publication", () => {
  assert.throws(() => validatePageJsonLd(mutate("MedicalClinic", (node) => {
    node.address = { "@id": "https://www.ghezelbaash.ir/missing-address" };
  })), /LocalBusiness.address/);
  const document = structuredClone(validatePageJsonLd(inputs.pageJsonLd)[0].document);
  document["@graph"].find((node) => typed(node, "PostalAddress"))["@type"] = "Organization";
  assert.throws(() => assertRichResultsDocument(document), /LocalBusiness.address/);
});

test("image metadata cannot lose its content URL or typed creator", () => {
  assert.throws(() => validatePageJsonLd(mutate("ImageObject", (node) => { delete node.contentUrl; })), /ImageObject.contentUrl/);
  assert.throws(() => validatePageJsonLd(mutate("ImageObject", (node) => {
    node.creator = { "@id": "https://www.ghezelbaash.ir/missing-creator" };
  })), /ImageObject.creator/);
  assert.throws(() => validatePageJsonLd(mutate("ImageObject", (node) => { node.contentUrl = "javascript:alert(1)"; })), /HTTP/);
});

test("video required properties cannot disappear in projection", () => {
  for (const property of ["name", "thumbnailUrl", "uploadDate"])
    assert.throws(() => validatePageJsonLd(mutate("VideoObject", (node) => { delete node[property]; })), new RegExp("VideoObject." + property));
  assert.throws(() => validatePageJsonLd(mutate("VideoObject", (node) => { node.thumbnailUrl = "/relative.webp"; })), /absolute URL/);
});

test("video dates must be real instants and known duration must be positive", () => {
  for (const uploadDate of ["2026-02-30", "2026-02-30T10:00:00Z", "2026-09-30T25:00:00Z", "2026-09-30T12:00:00"])
    assert.throws(() => validatePageJsonLd(mutate("VideoObject", (node) => { node.uploadDate = uploadDate; })), /real ISO timestamp/);
  for (const duration of ["PT", "PT0S", "P1DT", "P" + "9".repeat(400) + "D", "invalid"])
    assert.throws(() => validatePageJsonLd(mutate("VideoObject", (node) => { node.duration = duration; })), /positive ISO duration/);
});

test("duplicate entities fail while incomplete research candidates are reported faithfully", () => {
  const document = structuredClone(validatePageJsonLd(inputs.pageJsonLd)[0].document);
  document["@graph"].push(structuredClone(document["@graph"][0]));
  assert.throws(() => assertRichResultsDocument(document), /duplicate entity/);
  document["@graph"].pop();
  document["@graph"].push({ "@id": "https://www.ghezelbaash.ir/research-review", "@type": "Review", name: "Research-only review" });
  const result = assertRichResultsDocument(document);
  assert(result.incompleteCandidates.some((node) => node.id === "https://www.ghezelbaash.ir/research-review" && node.missing.includes("reviewRating")));
});

test("ProfilePage modification timestamps reject impossible dates", () => {
  const person = structuredClone(validatePageJsonLd(inputs.pageJsonLd)[0].document["@graph"].find((node) => typed(node, "Person")));
  const profile = {
    "@id": inputs.lifecycle.canonicalUrl + "saeed-ghezelbash#webpage",
    "@type": "ProfilePage",
    url: inputs.lifecycle.canonicalUrl + "saeed-ghezelbash",
    mainEntity: { "@id": person["@id"] },
    dateModified: "2026-02-30T10:00:00Z",
  };
  assert.throws(() => assertRichResultsDocument({ "@context": "https://schema.org", "@graph": [profile, person] }), /ProfilePage.dateModified/);
});

test("a typed clinic address cannot silently lose its authored physical-address fields", () => {
  const projected = validatePageJsonLd(inputs.pageJsonLd)[0].document;
  for (const property of ["streetAddress", "addressLocality", "addressRegion", "addressCountry", "postalCode"]) {
    const document = structuredClone(projected);
    const address = document["@graph"].find((node) => typed(node, "PostalAddress"));
    delete address[property];
    assert.throws(() => assertRichResultsDocument(document), new RegExp("clinic address." + property));
  }
});

test("homepage preserves its Course-bound authored historical instance while excluding clinic reviews and unrelated events", () => {
  const projected = validatePageJsonLd(inputs.pageJsonLd)[0].document;
  const byId = new Map(projected["@graph"].map((node) => [node["@id"], node]));
  assert(!byId.has("https://www.ghezelbaash.ir/review-kurdish-patient-experience"));
  const instanceId = "https://www.ghezelbaash.ir/advanced-thread-lift-workshop-tehran-1403-11";
  const instance = byId.get(instanceId);
  const authoredInstance = inputs.graph["@graph"].find((node) => node["@id"] === instanceId);
  assert.deepEqual(instance["@type"], authoredInstance["@type"]);
  assert.equal(instance.startDate, literal(authoredInstance.startDate));
  assert.deepEqual(instance.location, authoredInstance.location);
  assert(projected["@graph"].some((node) => typed(node, "Course") && node.hasCourseInstance?.["@id"] === instanceId));
  const canonicalById = new Map(inputs.graph["@graph"].map((node) => [node["@id"], node]));
  const rating = canonicalById.get("https://www.ghezelbaash.ir/review-kurdish-patient-experience").reviewRating;
  assert(typed(rating, "Rating"));
  assert.match(rating["@id"], /^https:\/\/www\.ghezelbaash\.ir\/\.well-known\/genid\//);
  assert.equal(rating.ratingValue, 5);
  assert.equal(rating.bestRating, 5);
  assert.equal(literal(canonicalById.get("https://www.ghezelbaash.ir/advanced-thread-lift-workshop-tehran-1403-11").startDate), "2025-02-04");
  assert(inputs.pageBody.includes("امتیاز اعلام‌شدهٔ بیمار: ۵ از ۵"));
  assert(inputs.pageBody.includes('<time datetime="2025-02-04">۱۶ بهمن ۱۴۰۳</time>'));
});

test("event contract still reports incomplete location data when an event is intentionally published", () => {
  const eventId="https://www.ghezelbaash.ir/test-event", placeId="https://www.ghezelbaash.ir/test-place";
  const document={ "@context":"https://schema.org", "@graph":[
    { "@id":eventId, "@type":"Event", name:"Test event", startDate:"2026-10-02", location:{ "@id":placeId } },
    { "@id":placeId, "@type":"Place", name:"Kermanshah", address:{ "@type":"PostalAddress", addressLocality:"Kermanshah", addressCountry:"IR" } },
  ]};
  assert.deepEqual(assertRichResultsDocument(document).incompleteCandidates, []);
  delete document["@graph"][1].address;
  const result=assertRichResultsDocument(document);
  assert(result.incompleteCandidates.some((node) => node.id===eventId && node.missing.includes("location.address")));
});
