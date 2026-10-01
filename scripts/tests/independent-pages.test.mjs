import test from "node:test";
import assert from "node:assert/strict";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { renderCanonicalPageHtml } from "../../src/lib/canonical-page-html.mjs";
import { deriveIndependentPages, renderIndependentPage, routeDocumentFile } from "../lib/independent-pages.mjs";
import { contentRoutePaths } from "../lib/content-routes.mjs";
import { inspectHtml } from "../lib/html-contract.mjs";

const inputs = readCanonicalInputs();
const home = '<!doctype html><html lang="fa-IR" dir="rtl"><head><title>Home</title><meta name="description" content="Home"><link rel="canonical" href="' +
  inputs.lifecycle.canonicalUrl + '"></head><body><main id="main-content"><article class="medical-guide">' +
  renderCanonicalPageHtml(inputs.pageBody) + '</article></main></body></html>';
const pages = deriveIndependentPages(home, inputs.graph, inputs.lifecycle.canonicalUrl);
test("every authored destination has its own canonical, page identity and readable initial content", () => {
  assert.deepEqual(pages.map((page) => page.path), contentRoutePaths(home, inputs.lifecycle.canonicalUrl));
  assert.equal(new Set(pages.map((page) => page.canonicalUrl)).size, pages.length);
  for (const page of pages) {
    assert.equal(page.canonicalUrl, new URL(page.path, inputs.lifecycle.canonicalUrl).href);
    assert(page.title && page.description && page.bodyHtml);
    const byId = new Map(page.document["@graph"].map((node) => [node["@id"], node]));
    const document = byId.get(page.canonicalUrl + "#webpage");
    assert.equal(document.url, page.canonicalUrl);
    assert([document.mainEntity].flat().some((node) => node["@id"] === page.entityId));
    assert(byId.get(page.entityId)?.["@type"]);
  }
});
test("profile, questions, answers and visible videos retain their distinct authored entities", () => {
  const person = pages.find((page) => page.path === "/saeed-ghezelbash");
  assert.equal(person.pageType, "ProfilePage");
  assert(person.entityTypes.includes("Person"));
  const question = pages.find((page) => page.pageType === "FAQPage");
  assert(question.entityTypes.includes("Question"));
  assert(question.document["@graph"].some((node) => node["@type"] === "Answer"));
  const video = pages.find((page) => page.path === "/jalupro-vs-profhilo-selection");
  assert(video.entityTypes.includes("VideoObject"));
  assert.equal(video.videos.length, 1);
});
test("direct path HTML has one self canonical, scoped data and shared-reader bootstrap marker", () => {
  const page = pages.find((page) => page.path === "/botox");
  const html = renderIndependentPage(home, page);
  const attr = (node, key) => node.attrs?.find((entry) => entry.name === key)?.value;
  const inspected = inspectHtml(html);
  const canonical = inspected.elements.filter((node) => attr(node, "rel") === "canonical");
  assert.equal(canonical.length, 1);
  assert.equal(attr(canonical[0], "href"), page.canonicalUrl);
  assert(html.includes('data-route-view="focused"'));
  assert(html.includes('id="route-page-title"'));
  assert(inspected.ids.includes("botox"));
  const scripts = inspected.elements.filter((node) => node.tagName === "script" && attr(node, "type") === "application/ld+json");
  assert.equal(scripts.length, 1);
  assert.deepEqual(JSON.parse(scripts[0].childNodes[0].value), page.document);
});
test("physical route files preserve clean paths and reject traversal", () => {
  assert.equal(routeDocumentFile("/botox"), "botox.html");
  assert.throws(() => routeDocumentFile("/../botox"), /Unsafe/);
});
