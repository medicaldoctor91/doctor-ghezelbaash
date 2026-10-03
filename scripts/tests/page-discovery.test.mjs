import test from "node:test";
import assert from "node:assert/strict";
import { parseFragment } from "parse5";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { localizedText, projectPageJsonLd, validatePageJsonLd } from "../../src/lib/page-discovery-jsonld.mjs";
import { renderCanonicalPageHtml } from "../../src/lib/canonical-page-html.mjs";

const inputs = readCanonicalInputs();
const projection = () => validatePageJsonLd(inputs.pageJsonLd)[0].document;
const typed = (node, type) => [node?.["@type"]].flat().includes(type);
const literal = (value) => value?.["@value"] ?? value;

test("page discovery publishes a route-aware physician graph without changing authored inputs", () => {
  const before = JSON.stringify(inputs.pageJsonLd);
  const graph = projection()["@graph"];
  const byId = new Map(graph.map((node) => [node["@id"], node]));
  const page = byId.get(inputs.lifecycle.canonicalUrl + "webpage");
  assert(typed(page, "MedicalWebPage"));
  assert(!typed(page, "ProfilePage"));
  assert.equal(graph.filter((node) => typed(node, "ProfilePage")).length, 0);
  for (const type of ["Event", "Review"])
    assert(!graph.some((node) => typed(node, type)), "Homepage search projection must exclude " + type);
  const courseInstanceIds = new Set(graph.filter((node) => typed(node, "Course"))
    .flatMap((node) => [node.hasCourseInstance].flat()).map((ref) => ref["@id"]));
  for (const instance of graph.filter((node) => typed(node, "EducationEvent")))
    assert(typed(instance, "CourseInstance") && courseInstanceIds.has(instance["@id"]));
  const person = byId.get(page.mainEntity["@id"]);
  assert(typed(person, "Person"));
  assert.equal(typeof person.name, "string");
  assert.equal(person.url, inputs.lifecycle.canonicalUrl + "saeed-ghezelbash");
  assert.deepEqual(person.mainEntityOfPage, { "@id": inputs.lifecycle.canonicalUrl + "saeed-ghezelbash#webpage" });
  assert(graph.length < inputs.graph["@graph"].length);
  assert(graph.some((node) => typed(node, "FAQPage")));
  for (const image of graph.filter((node) => typed(node, "ImageObject"))) {
    assert(typed(byId.get(image.creator["@id"]), "Person"));
    assert.equal(typeof image.width, "number");
  }
  assert.equal(JSON.stringify(inputs.pageJsonLd), before);
  assert(inputs.graph["@graph"].some((node) => typed(node, "ProfilePage")));
  assert(inputs.graph["@graph"].some((node) => typed(node, "Review")));
  assert(inputs.graph["@graph"].some((node) => typed(node, "EducationEvent")));
});

test("the selected Course resolves only its authored historical instance and location without inferring event facts", () => {
  const before = JSON.stringify(inputs.graph);
  const projected = projection()["@graph"];
  const byId = new Map(projected.map((node) => [node["@id"], node]));
  const authoredById = new Map(inputs.graph["@graph"].map((node) => [node["@id"], node]));
  const course = projected.find((node) => typed(node, "Course"));
  const instance = byId.get(course.hasCourseInstance["@id"]);
  const authored = authoredById.get(instance["@id"]);
  assert.deepEqual(instance["@type"], authored["@type"]);
  assert(typed(instance, "CourseInstance") && typed(instance, "EducationEvent"));
  for (const key of ["startDate", "location", "instructor", "performer", "organizer", "audience", "recordedIn", "teaches", "dcterms:temporal", "eventAttendanceMode"])
    assert.deepEqual(instance[key], literal(authored[key]));
  assert.equal(instance.name, localizedText(authored.name));
  assert.equal(instance.description, authored.description);
  assert.equal("endDate" in instance, "endDate" in authored);
  assert(inputs.pageBody.includes('<time datetime="' + instance.startDate + '">'));
  const place = byId.get(instance.location["@id"]);
  assert.deepEqual(place.address, authoredById.get(place["@id"]).address);
  assert.equal(place.address["@type"], "PostalAddress");
  assert.equal(place.address.addressLocality, "تهران");
  assert(!place.address.streetAddress && !place.address.postalCode);
  assert.equal(byId.get(instance.audience["@id"])["@type"], "EducationalAudience");
  assert.equal(JSON.stringify(inputs.graph), before);
});

test("an unrelated EducationEvent stays excluded even when homepage mentions it", () => {
  const graph = structuredClone(inputs.graph);
  const unrelatedId = inputs.lifecycle.canonicalUrl + "unrelated-course-instance";
  graph["@graph"].push({ "@id": unrelatedId, "@type": ["CourseInstance", "EducationEvent"],
    name: "Unrelated historic event", startDate: "2025-01-01",
    location: { "@id": inputs.lifecycle.canonicalUrl + "city-tehran" } });
  const home = graph["@graph"].find((node) => node["@id"] === inputs.lifecycle.canonicalUrl + "webpage");
  home.mentions = [...[home.mentions].flat(), { "@id": unrelatedId }];
  const projected = projectPageJsonLd(graph)[0].document["@graph"];
  assert(!projected.some((node) => node["@id"] === unrelatedId));
  assert(!projected.some((node) => typed(node, "Event") || typed(node, "Review")));
  const instance = projected.find((node) => typed(node, "EducationEvent"));
  assert(typed(instance, "CourseInstance"));
});

test("homepage speakable resolves its exact authored selector specification", () => {
  const projected = projection()["@graph"];
  const home = projected.find((node) => node["@id"] === inputs.lifecycle.canonicalUrl + "webpage");
  const specification = projected.find((node) => node["@id"] === home.speakable["@id"]);
  assert.equal(specification["@type"], "SpeakableSpecification");
  assert.deepEqual(specification, inputs.graph["@graph"].find((node) => node["@id"] === specification["@id"]));
  assert.equal(projected.filter((node) => typed(node, "SpeakableSpecification")).length, 1);
});

test("homepage and dedicated profile revisions remain authored on their own canonical nodes", () => {
  const projected = projection()["@graph"];
  const home = projected.find((node) => node["@id"] === inputs.lifecycle.canonicalUrl + "webpage");
  const authoredHome = inputs.graph["@graph"].find((node) => node["@id"] === home["@id"]);
  const profileId = inputs.lifecycle.canonicalUrl + "saeed-ghezelbash#webpage";
  const authoredProfile = inputs.graph["@graph"].find((node) => node["@id"] === profileId);
  assert.equal(home.dateModified, literal(authoredHome.dateModified));
  assert(typed(authoredProfile, "ProfilePage"));
  assert.equal(authoredProfile.url, inputs.lifecycle.canonicalUrl + "saeed-ghezelbash");
  assert(!projected.some((node) => node["@id"] === profileId));
});

test("homepage retains authored clinic contact and service-area definitions without changing the source graph", () => {
  const before = JSON.stringify(inputs.graph);
  const projected = projection()["@graph"];
  const byId = new Map(projected.map((node) => [node["@id"], node]));
  const clinic = projected.find((node) => typed(node, "MedicalClinic"));
  for (const ref of [clinic.contactPoint, clinic.areaServed].flat(2).filter(Boolean)) {
    const id = typeof ref === "string" ? ref : ref["@id"];
    const authored = inputs.graph["@graph"].find((node) => node["@id"] === id);
    if (authored) {
      const expected = structuredClone(authored);
      if (expected.name !== undefined) expected.name = localizedText(expected.name);
      assert.deepEqual(byId.get(id), expected);
    }
  }
  assert(typed(byId.get(inputs.lifecycle.canonicalUrl + "online-consultation-contact-point"), "ContactPoint"));
  assert.equal(JSON.stringify(inputs.graph), before);
});

test("HTML embeds one safe graph and a typed image creator", () => {
  const html = renderCanonicalPageHtml(inputs.pageBody, inputs.graph);
  const nodes = [];
  const walk = (node) => { nodes.push(node); for (const child of node.childNodes || []) walk(child); };
  walk(parseFragment(html));
  const attr = (node, key) => node.attrs?.find((entry) => entry.name === key)?.value;
  const scripts = nodes.filter((node) => node.tagName === "script");
  assert.equal(scripts.length, 1);
  assert(html.indexOf("</header>") < html.indexOf('<script id="schema-core-mainentity"'),
    "The streamed introduction must precede the complete discovery graph");
  assert.deepEqual(JSON.parse(scripts[0].childNodes[0].value), projection());
  const creator = nodes.find((node) => attr(node, "itemprop") === "creator");
  assert.equal(creator.tagName, "span");
  assert.equal(attr(creator, "itemtype"), "https://schema.org/Person");
  assert(creator.attrs.some((entry) => entry.name === "itemscope"));
  assert(creator.childNodes.some((node) => attr(node, "itemprop") === "name" && attr(node, "content")));
});

test("text containing an HTML script terminator stays inside generated JSON data", () => {
  const graph = structuredClone(inputs.graph);
  const person = graph["@graph"].find((node) => typed(node, "Person"));
  person.name = "</script><script>alert(1)</script>";
  const html = renderCanonicalPageHtml(inputs.pageBody, graph);
  assert.equal([...html.matchAll(/<script\b/g)].length, 1);
  assert(html.includes("\\u003c/script>"));
});

test("validating authored discovery twice preserves core identity and never duplicates FAQ entities", () => {
  const first = validatePageJsonLd(inputs.pageJsonLd);
  const second = validatePageJsonLd(first);
  for (const projected of [first, second]) {
    const graph = projected[0].document["@graph"];
    const ids = graph.map((node) => node["@id"]);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(graph.filter((node) => typed(node, "FAQPage")).length, 1);
    const home = graph.find((node) => node["@id"] === inputs.lifecycle.canonicalUrl + "webpage");
    assert(typed(home, "MedicalWebPage"));
    assert(!typed(home, "ProfilePage"));
    const person = graph.find((node) => node["@id"] === inputs.lifecycle.primaryEntity.id);
    assert.equal(person.url, inputs.lifecycle.canonicalUrl + "saeed-ghezelbash");
    assert.deepEqual(person.mainEntityOfPage, { "@id": inputs.lifecycle.canonicalUrl + "saeed-ghezelbash#webpage" });
  }
});

test("canonical HTML owns published markup while canonical graph owns discovery data", () => {
  const withoutJson = (html) => html.replace(
    /(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, "$1$2");
  assert.equal(withoutJson(renderCanonicalPageHtml(inputs.pageBody, inputs.graph)), withoutJson(inputs.pageBody));
  assert.deepEqual(projection(), inputs.pageJsonLd[0].document);
  assert.equal(inputs.pageJsonLd.length, 1);
  assert.strictEqual(validatePageJsonLd(inputs.pageJsonLd), inputs.pageJsonLd);
  assert(!inputs.pageBody.includes('<link itemprop="creator"'));
  assert(!/<button\b[^>]*data-guide-search-open/.test(inputs.pageBody));
});

test("legacy markup fails instead of being repaired during rendering", () => {
  const body = inputs.pageBody;
  assert.throws(() => renderCanonicalPageHtml(body.replace(
    '<span itemprop="creator" itemscope itemtype="https://schema.org/Person"',
    '<span itemprop="creator"'), inputs.graph),
    /authored as a typed Person/);
  assert.throws(() => renderCanonicalPageHtml(body.replace(
    '<a class="hero-action hero-search-launch" data-guide-search-open=""',
    '<button class="hero-action hero-search-launch" data-guide-search-open=""'), inputs.graph),
    /native guide link/);
});
