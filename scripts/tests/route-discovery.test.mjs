import test from "node:test";
import assert from "node:assert/strict";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { renderCanonicalPageHtml } from "../../src/lib/canonical-page-html.mjs";
import { deriveRouteDiscovery } from "../lib/route-discovery.mjs";
import { addHomeTopicNavigation } from "../lib/home-topic-navigation.mjs";
import { navigationRoots } from "../lib/topic-navigation.mjs";
import { contentRoutePaths } from "../lib/content-routes.mjs";
import { renderIndependentPage } from "../lib/independent-pages.mjs";
import { inspectHtml } from "../lib/html-contract.mjs";

const inputs = readCanonicalInputs(), canonicalUrl = inputs.lifecycle.canonicalUrl;
const content = renderCanonicalPageHtml(inputs.pageBody);
const document = (body) => '<!doctype html><html lang="fa-IR" dir="rtl"><head><title>Home</title><link rel="canonical" href="' +
  canonicalUrl + '"></head><body lang="fa-IR" dir="rtl"><main id="main-content"><article class="medical-guide">' +
  body + "</article></main></body></html>";
const augmented = addHomeTopicNavigation(content, inputs.graph, inputs.pageFrontmatter, canonicalUrl);
const home = document(augmented);
const records = deriveRouteDiscovery(home, inputs.graph, inputs.pageFrontmatter, canonicalUrl);
const attr = (node, key) => node.attrs?.find((entry) => entry.name === key)?.value;

test("home topic directory exposes the real roots without changing authored data or route inventory", () => {
  const parsed = inspectHtml(home), directory = parsed.elements.find((node) => attr(node, "data-topic-directory") !== undefined);
  assert(directory);
  const roots = navigationRoots(records);
  const location = directory.sourceCodeLocation;
  const body = inspectHtml(home.slice(location.startOffset, location.endOffset), { wrapMain: true });
  assert.deepEqual(body.elements.filter((node) => node.tagName === "a").map((node) => attr(node, "href")), roots.map((link) => link.path));
  assert(roots.length > 1);
  assert.deepEqual(contentRoutePaths(home, canonicalUrl), contentRoutePaths(document(content), canonicalUrl));
  const scripts = (html) => [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
  assert.deepEqual(scripts(augmented), scripts(content));
  assert(augmented.includes("قبل از اسم روش، باید علت را درست تشخیص داد"));
  assert.throws(() => addHomeTopicNavigation(augmented, inputs.graph, inputs.pageFrontmatter, canonicalUrl), /already exists/);
});

test("finished topic records share truthful breadcrumbs, translation alternatives and distinct summary subjects", () => {
  const forehead = records.find((record) => record.path === "/forehead-lines-overactivity-vs-compensation");
  const breadcrumb = forehead.document["@graph"].find((node) => node["@type"] === "BreadcrumbList");
  assert.equal(breadcrumb.itemListElement[0].item, canonicalUrl);
  assert(breadcrumb.itemListElement.some((item) => item.item === canonicalUrl + "botox"));
  assert(!breadcrumb.itemListElement.some((item) => item.item === canonicalUrl + "botox-heading"));
  assert.equal(breadcrumb.itemListElement.at(-1).item, forehead.canonicalUrl);
  const rendered = inspectHtml(renderIndependentPage(home, forehead));
  assert(rendered.elements.some((node) => node.tagName === "a" && attr(node, "href") === forehead.navigation.parent.path));
  const question = records.find((record) => record.path === "/jalupro-vs-profhilo-selection");
  assert.equal(question.pageType, "MedicalWebPage");
  assert(question.entityTypes.includes("Question"));
  assert(question.document["@graph"].some((node) => node["@type"] === "VideoObject"));
  const historical = records.find((record) => record.path === "/historical-patient-origin-summary");
  const travel = records.find((record) => record.path === "/out-of-town-aesthetic-patients-iran");
  assert.equal(historical.scopeKind, "disclosure-summary");
  assert.notEqual(historical.bodyHtml, travel.bodyHtml);
  assert.equal(historical.navigation.parent.path, travel.path);
  const translated = records.filter((record) => record.alternates.length);
  assert.equal(translated.length, inputs.pageFrontmatter.discovery.translationGroups.flatMap((group) => group.members).length);
  for (const record of records) {
    const person = record.document["@graph"].find((node) => node["@id"] === inputs.lifecycle.primaryEntity.id);
    assert.equal(person.url, canonicalUrl);
    assert.equal(person.mainEntityOfPage["@id"], canonicalUrl + "webpage");
    if (record.metadataContext) {
      assert(record.navigation.ancestors.some((entry) => entry.path === record.metadataContext.path));
      assert(record.contextTitle.includes(record.metadataContext.title));
    }
  }
});
