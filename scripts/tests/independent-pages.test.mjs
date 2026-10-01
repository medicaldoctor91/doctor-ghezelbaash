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
  renderCanonicalPageHtml(inputs.pageBody) +
  '<nav><a href="/video-thread-lift-workshop">Workshop figure</a><a href="/video-kurdish-patient-experience">Patient figure</a>' +
  '<a href="/video-saeed-ghezelbash-thread-lift-workshop">Workshop player</a><a href="/video-saeed-ghezelbash-kurdish-patient-review">Patient player</a></nav>' +
  '</article></main></body></html>';
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
  assert(inspected.elements.some((node) => attr(node, "data-guide-expand") !== undefined));
  assert(inspected.ids.includes("botox"));
  const scripts = inspected.elements.filter((node) => node.tagName === "script" && attr(node, "type") === "application/ld+json");
  assert.equal(scripts.length, 1);
  assert.deepEqual(JSON.parse(scripts[0].childNodes[0].value), page.document);
});
test("physical route files preserve clean paths and reject traversal", () => {
  assert.equal(routeDocumentFile("/botox"), "botox.html");
  assert.throws(() => routeDocumentFile("/../botox"), /Unsafe/);
});

test("focused paths preserve the doctor's explicit homepage identity without importing the entire home graph", () => {
  const original = inputs.graph["@graph"].find((node) => node["@id"] === inputs.lifecycle.primaryEntity.id);
  const homePage = inputs.graph["@graph"].find((node) => node.url === inputs.lifecycle.canonicalUrl && [node["@type"]].flat().includes("ProfilePage"));
  for (const page of pages) {
    const author = page.document["@graph"].find((node) => node["@id"] === original["@id"]);
    assert.equal(author.url, inputs.lifecycle.canonicalUrl);
    assert.deepEqual(author["@type"], original["@type"]);
    assert.deepEqual(author.mainEntityOfPage, original.mainEntityOfPage);
    assert.deepEqual(author.sameAs, original.sameAs);
    assert.deepEqual(author.hasCredential, original.hasCredential);
    assert.deepEqual(author.memberOf, original.memberOf);
    for (const ref of [...author.hasCredential, ...author.identifier, author.worksFor, author.alumniOf])
      assert(page.document["@graph"].some((node) => node["@id"] === ref["@id"] && node["@type"]), "Authored qualification/identity references must retain their typed nodes");
    assert(!author.subjectOf);
    const route = page.document["@graph"].find((node) => node["@id"] === page.canonicalUrl + "#webpage");
    assert([route.isPartOf].flat().some((node) => node["@id"] === homePage["@id"]));
    assert.deepEqual(route.publisher, { "@id": original["@id"] });
    assert(!page.document["@graph"].some((node) => node["@id"] === homePage["@id"]));
  }
});
test("answer URLs contain their own answer instead of a duplicate of their whole parent section", () => {
  const answers = pages.filter((page) => page.path.startsWith("/answer-"));
  assert.equal(answers.length, 125);
  for (const page of answers) {
    const parsed = inspectHtml(page.bodyHtml, { wrapMain: true });
    assert(parsed.ids.includes(page.htmlId));
    assert.equal(parsed.ids.filter((id) => id.startsWith("answer-")).length, 1);
    assert(page.entityTypes.includes("Answer"));
  }
  const onset = pages.find((page) => page.path === "/answer-botox-onset-of-action");
  assert(onset.bodyHtml.includes("حدود دو هفته"));
  assert(!onset.bodyHtml.includes('id="answer-botox-dynamic-facial-examination"'));
  assert.equal(onset.title, "چند روز بعد نتیجه دیده می‌شود؟");
  assert.notEqual(onset.bodyHtml, pages.find((page) => page.path === "/botox").bodyHtml);
});
test("the empty historical alias scopes its following region without unrelated clinic content", () => {
  const page = pages.find((page) => page.path === "/historical-patient-origin-summary");
  assert(page.bodyHtml.includes('id="historical-patient-origin-summary"'));
  assert(page.bodyHtml.includes('id="out-of-town-aesthetic-patients-iran"'));
  assert(!page.bodyHtml.includes('id="saeed-ghezelbash-clinic-contact-and-location"'));
  assert(!page.bodyHtml.includes('id="answer-clinic-before-visit-information"'));
  assert(page.entityTypes.includes("CreativeWork"));
});

test("video player and figure entries use their actual video's title instead of an unrelated preceding heading", () => {
  for (const path of ["/video-thread-lift-workshop", "/video-kurdish-patient-experience", "/video-saeed-ghezelbash-thread-lift-workshop", "/video-saeed-ghezelbash-kurdish-patient-review"]) {
    const page = pages.find((page) => page.path === path);
    const video = page.document["@graph"].find((node) => node["@id"] === page.entityId);
    assert(page.entityTypes.includes("VideoObject"));
    assert.equal(page.title, video.name);
  }
});
