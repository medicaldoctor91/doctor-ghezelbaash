import test from "node:test";
import assert from "node:assert/strict";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { discoveryPolicy } from "../../src/config/site-policy.mjs";
import { renderCanonicalPageHtml } from "../../src/lib/canonical-page-html.mjs";
import { deriveRouteDiscovery } from "../lib/route-discovery.mjs";
import { contentRoutePaths } from "../lib/content-routes.mjs";
import { renderIndependentPage } from "../lib/independent-pages.mjs";
import { inspectHtml } from "../lib/html-contract.mjs";
import { canonicalPaths, resolveContentUrl } from "../../src/lib/url-architecture.mjs";

const inputs = readCanonicalInputs(), canonicalUrl = inputs.lifecycle.canonicalUrl;
const content = renderCanonicalPageHtml(inputs.pageBody, inputs.graph);
const document = (body) => '<!doctype html><html lang="fa-IR" dir="rtl"><head><title>Home</title><link rel="canonical" href="' +
  canonicalUrl + '"></head><body lang="fa-IR" dir="rtl"><main id="main-content"><article class="medical-guide">' +
  body + "</article></main></body></html>";
const home = document(content);
const records = deriveRouteDiscovery(home, inputs.graph, discoveryPolicy, canonicalUrl);
const attr = (node, key) => node.attrs?.find((entry) => entry.name === key)?.value;

test("native authored table of contents exposes guide sections without a second topic directory", () => {
  const parsed = inspectHtml(home);
  assert(!parsed.elements.some((node) => attr(node, "data-topic-directory") !== undefined));
  const toc = parsed.elements.find((node) => attr(node, "id") === "aesthetic-medicine-table-of-contents");
  assert(toc);
  const location = toc.sourceCodeLocation;
  const body = inspectHtml(home.slice(location.startOffset, location.endOffset), { wrapMain: true });
  const links = body.elements.filter((node) => node.tagName === "a").map((node) => attr(node, "href"));
  assert(links.length > 1);
  for (const href of links) {
    if (href.startsWith("#")) assert(parsed.ids.includes(href.slice(1)), "TOC fragment must name an authored region: " + href);
    else assert(records.some((record) => record.path === new URL(href, canonicalUrl).pathname), "TOC path must have a focused document: " + href);
  }
  assert.deepEqual(contentRoutePaths(home, canonicalUrl), contentRoutePaths(document(content), canonicalUrl));
  assert(content.includes("قبل از اسم روش، باید علت را درست تشخیص داد"));
});

test("finished topic records share truthful breadcrumbs, translation alternatives and distinct summary subjects", () => {
  assert.deepEqual(records.map((record) => record.path), canonicalPaths().filter((path) => path !== "/"));
  const forehead = records.find((record) => record.path === "/upper-face-botox");
  const breadcrumb = forehead.document["@graph"].find((node) => node["@type"] === "BreadcrumbList");
  assert.equal(breadcrumb.itemListElement[0].item, canonicalUrl);
  assert(breadcrumb.itemListElement.some((item) => item.item === canonicalUrl + "botox"));
  assert(!breadcrumb.itemListElement.some((item) => item.item === canonicalUrl + "botox-heading"));
  assert.equal(breadcrumb.itemListElement.at(-1).item, forehead.canonicalUrl);
  const rendered = inspectHtml(renderIndependentPage(home, forehead));
  assert(rendered.elements.some((node) => node.tagName === "a" && attr(node, "href") === forehead.navigation.parent.path));
  const question = records.find((record) => record.path === "/botox-mechanism-indications-and-limitations");
  assert.equal(question.pageType, "MedicalWebPage");
  assert(question.entityTypes.includes("Question"));
  const skinGuide = records.find((record) => record.path === "/jalupro-and-profhilo");
  assert(skinGuide.document["@graph"].some((node) => node["@type"] === "VideoObject"));
  assert.equal(resolveContentUrl("/jalupro-vs-profhilo-selection"), skinGuide.path + "#jalupro-vs-profhilo-selection");
  const historical = records.find((record) => record.path === "/historical-patient-origin-summary");
  const travel = records.find((record) => record.path === "/out-of-town-aesthetic-patients-iran");
  assert.equal(historical.scopeKind, "disclosure-summary");
  assert.notEqual(historical.bodyHtml, travel.bodyHtml);
  assert.equal(historical.navigation.parent.path, travel.path);
  const translated = records.filter((record) => record.alternates.length);
  assert.equal(translated.length, discoveryPolicy.translationGroups.flatMap((group) => group.members).length);
  for (const record of records) {
    const person = record.document["@graph"].find((node) => node["@id"] === inputs.lifecycle.primaryEntity.id);
    assert.equal(person["@id"], canonicalUrl + "saeed-ghezelbash");
    assert.equal(person.url, canonicalUrl);
    assert.equal(person.mainEntityOfPage["@id"], canonicalUrl + "webpage");
    if (record.metadataContext) {
      assert(record.navigation.ancestors.some((entry) => entry.path === record.metadataContext.path));
      assert(record.contextTitle.includes(record.metadataContext.title));
    }
  }
});

test("only whole reviewed language guides receive reciprocal alternates while their components remain fragments", () => {
  const translated = records.filter((record) => record.alternates.length);
  assert.deepEqual(new Set(translated.map((record) => record.path)),
    new Set(["/aesthetic-guide-en", "/aesthetic-guide-ar-iq", "/aesthetic-guide-ckb-iq"]));
  for (const record of translated) {
    assert.equal(record.navigation.parent, undefined);
    assert(record.bodyHtml.includes(record.htmlId));
    assert(record.bodyHtml.includes("who-is-dr-saeed-ghezelbash-"));
    assert.deepEqual(new Set(record.alternates.map((alternate) => new URL(alternate.href).pathname)),
      new Set(translated.map((entry) => entry.path)));
    assert(!record.alternates.some((alternate) => alternate.href === canonicalUrl));
  }
  assert(!records.some((record) => record.path.startsWith("/who-is-dr-saeed-ghezelbash-")));
});
