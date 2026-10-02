import test from "node:test";
import assert from "node:assert/strict";
import { parseFragment } from "parse5";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { validatePageJsonLd } from "../../src/lib/page-discovery-jsonld.mjs";
import { renderCanonicalPageHtml } from "../../src/lib/canonical-page-html.mjs";

const inputs = readCanonicalInputs();
const projection = () => validatePageJsonLd(inputs.pageJsonLd)[0].document;
const typed = (node, type) => [node?.["@type"]].flat().includes(type);

test("page discovery publishes a route-aware physician graph without changing authored inputs", () => {
  const before = JSON.stringify(inputs.pageJsonLd);
  const graph = projection()["@graph"];
  const byId = new Map(graph.map((node) => [node["@id"], node]));
  const page = byId.get(inputs.pageFrontmatter.pageMicrodata.itemId);
  assert(typed(page, "MedicalWebPage"));
  assert(!typed(page, "ProfilePage"));
  assert.equal(graph.filter((node) => typed(node, "ProfilePage")).length, 0);
  for (const type of ["Event", "EducationEvent", "Review"])
    assert(!graph.some((node) => typed(node, type)), "Homepage search projection must exclude " + type);
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

test("homepage and dedicated profile revisions remain authored on their own canonical nodes", () => {
  const projected = projection()["@graph"];
  const home = projected.find((node) => node["@id"] === inputs.pageFrontmatter.pageMicrodata.itemId);
  const authoredHome = inputs.graph["@graph"].find((node) => node["@id"] === home["@id"]);
  const profileId = inputs.lifecycle.canonicalUrl + "saeed-ghezelbash#webpage";
  const authoredProfile = inputs.graph["@graph"].find((node) => node["@id"] === profileId);
  assert.equal(home.dateModified, authoredHome.dateModified);
  assert(typed(authoredProfile, "ProfilePage"));
  assert.equal(authoredProfile.url, inputs.lifecycle.canonicalUrl + "saeed-ghezelbash");
  assert(!projected.some((node) => node["@id"] === profileId));
});

test("HTML embeds one safe graph and a typed image creator", () => {
  const html = renderCanonicalPageHtml(inputs.pageBody, inputs.graph);
  const nodes = [];
  const walk = (node) => { nodes.push(node); for (const child of node.childNodes || []) walk(child); };
  walk(parseFragment(html));
  const attr = (node, key) => node.attrs?.find((entry) => entry.name === key)?.value;
  const scripts = nodes.filter((node) => node.tagName === "script");
  assert.equal(scripts.length, 1);
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
    const home = graph.find((node) => node["@id"] === inputs.pageFrontmatter.pageMicrodata.itemId);
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
