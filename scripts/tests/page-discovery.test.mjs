import test from "node:test";
import assert from "node:assert/strict";
import { parseFragment } from "parse5";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { projectPageJsonLd } from "../../src/lib/page-discovery-jsonld.mjs";
import { renderCanonicalPageHtml } from "../../src/lib/canonical-page-html.mjs";

const inputs = readCanonicalInputs();
const projection = () => projectPageJsonLd(inputs.pageJsonLd)[0].document;
test("page discovery resolves Person and creator without changing authored inputs", () => {
  const before = JSON.stringify(inputs.pageJsonLd);
  const graph = projection()["@graph"];
  const byId = new Map(graph.map((node) => [node["@id"], node]));
  const typed = (node, type) => [node["@type"]].flat().includes(type);
  const page = graph.find((node) => node["@id"] === inputs.pageFrontmatter.pageMicrodata.itemId);
  assert.equal(graph.filter((node) => typed(node, "ProfilePage")).length, 32);
  assert.equal(page["@id"], inputs.pageFrontmatter.pageMicrodata.itemId);
  assert(typed(byId.get(page.mainEntity["@id"]), "Person"));
  assert.equal(typeof byId.get(page.mainEntity["@id"]).name, "string");
  for (const node of inputs.graph["@graph"]) {
    assert(byId.has(node["@id"]));
    assert.deepEqual([byId.get(node["@id"])["@type"]].flat(), [node["@type"]].flat());
  }
  assert(graph.some((node) => typed(node, "FAQPage")));
  for (const image of graph.filter((node) => node["@type"] === "ImageObject")) {
    assert(typed(byId.get(image.creator["@id"]), "Person"));
    assert.equal(typeof image.width, "number");
  }
  assert.equal(JSON.stringify(inputs.pageJsonLd), before);
  assert(inputs.graph["@graph"].some((node) => [node["@type"]].flat().includes("Review")));
  assert(inputs.graph["@graph"].some((node) => [node["@type"]].flat().includes("EducationEvent")));
});
test("calendar revisions do not invent timestamps; known instants survive", () => {
  const source = structuredClone(inputs.pageJsonLd);
  const page = source[0].document["@graph"].find((node) => [node["@type"]].flat().includes("ProfilePage"));
  page.dateModified = "2026-09-30";
  assert(!("dateModified" in projectPageJsonLd(source)[0].document["@graph"].find((node) => node["@id"] === inputs.pageFrontmatter.pageMicrodata.itemId)));
  page.dateModified = "2026-09-30T10:20:30+03:30";
  assert.equal(projectPageJsonLd(source)[0].document["@graph"].find((node) => node["@id"] === inputs.pageFrontmatter.pageMicrodata.itemId).dateModified, page.dateModified);
});
test("HTML embeds one safe graph and a typed image creator", () => {
  const html = renderCanonicalPageHtml(inputs.pageBody);
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
test("text containing an HTML script terminator stays inside JSON data", () => {
  const source = structuredClone(inputs.pageJsonLd);
  const person = source[0].document["@graph"].find((node) => [node["@type"]].flat().includes("Person"));
  person.name = "</script><script>alert(1)</script>";
  const body = '<script id="' + source[0].id + '" type="application/ld+json">' +
    JSON.stringify(source[0].document).replaceAll("<", "\\u003c") + "</script>";
  const html = renderCanonicalPageHtml(body);
  assert.equal([...html.matchAll(/<script\b/g)].length, 1);
  assert(html.includes("\\u003c/script>"));
});
