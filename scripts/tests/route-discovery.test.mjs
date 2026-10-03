import test from "node:test";
import assert from "node:assert/strict";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { discoveryPolicy, guideNavigation } from "../../src/config/site-policy.mjs";
import { renderCanonicalPageHtml } from "../../src/lib/canonical-page-html.mjs";
import { deriveRouteDiscovery } from "../lib/route-discovery.mjs";
import { addHomeTopicNavigation } from "../lib/home-topic-navigation.mjs";
import { navigationRoots } from "../lib/topic-navigation.mjs";
import { contentRoutePaths } from "../lib/content-routes.mjs";
import { deriveIndependentPages, renderIndependentPage } from "../lib/independent-pages.mjs";
import { inspectHtml } from "../lib/html-contract.mjs";

const inputs = readCanonicalInputs(), canonicalUrl = inputs.lifecycle.canonicalUrl;
const content = renderCanonicalPageHtml(inputs.pageBody, inputs.graph);
const document = (body) => '<!doctype html><html lang="fa-IR" dir="rtl"><head><title>Home</title><link rel="canonical" href="' +
  canonicalUrl + '"></head><body lang="fa-IR" dir="rtl"><main id="main-content"><article class="medical-guide">' +
  body + "</article></main></body></html>";
const augmented = addHomeTopicNavigation(content, inputs.graph, guideNavigation, discoveryPolicy, canonicalUrl);
const home = document(augmented);
const records = deriveRouteDiscovery(home, inputs.graph, discoveryPolicy, canonicalUrl);
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
  assert.throws(() => addHomeTopicNavigation(augmented, inputs.graph, guideNavigation, discoveryPolicy, canonicalUrl), /already exists/);
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
  assert.equal(translated.length, discoveryPolicy.translationGroups.flatMap((group) => group.members).length);
  for (const record of records) {
    const person = record.document["@graph"].find((node) => node["@id"] === inputs.lifecycle.primaryEntity.id);
    assert.equal(person.url, canonicalUrl + "saeed-ghezelbash");
    assert.equal(person.mainEntityOfPage["@id"], canonicalUrl + "saeed-ghezelbash#webpage");
    if (record.metadataContext) {
      assert(record.navigation.ancestors.some((entry) => entry.path === record.metadataContext.path));
      assert(record.documentTitle.includes(record.metadataContext.title));
    }
  }
});

test("generic question and answer document titles carry their real Botox context without changing headings or subjects", () => {
  const pairs = [
    ["botox-onset-of-action", "botox-faq", "پرسش‌های پرتکرار بوتاکس"],
    ["botox-dynamic-facial-examination", "botox-pre-injection-clinical-assessment", "پرونده، دوز و تصمیم قبل از تزریق بوتاکس"],
  ];
  const doctorName = "دکتر سعید قزلباش";
  for (const [source, parentPath, parentTitle] of pairs) for (const prefix of ["", "answer-"]) {
    const record = records.find((entry) => entry.path === "/" + prefix + source);
    const expected = record.title + " | " + parentTitle + " | " + doctorName;
    assert.equal(record.documentTitle, expected);
    assert.equal(record.contextTitle, record.title);
    assert.equal(record.metadataContext.path, "/" + parentPath);
    assert.equal(record.metadataContext.lang, record.lang);
    assert.equal(record.documentTitle.split(doctorName).length - 1, 1);
    assert.equal(record.documentTitle.split(parentTitle).length - 1, 1);
    const rendered = inspectHtml(renderIndependentPage(home, record));
    const heading = rendered.headings.find((node) => attr(node, "id") === "route-page-title");
    const text = (node) => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
    assert.equal(text(heading), record.title);
    const title = rendered.elements.find((node) => node.tagName === "title");
    assert.equal(text(title), expected);
    const canonicals = rendered.elements.filter((node) => node.tagName === "link" && attr(node, "rel") === "canonical");
    assert.equal(canonicals.length, 1);
    assert.equal(attr(canonicals[0], "href"), record.canonicalUrl);
    const page = record.document["@graph"].find((node) => node["@id"] === record.canonicalUrl + "#webpage");
    assert.equal(page.name, record.title);
    assert([page.mainEntity].flat().some((ref) => ref["@id"] === record.entityId));
    const subject = record.document["@graph"].find((node) => node["@id"] === record.entityId);
    const original = inputs.graph["@graph"].find((node) => node["@id"] === record.entityId);
    if (record.entityTypes.includes("Question")) assert.equal(subject.name, original.name);
    else assert.equal(subject.text, original.text);
  }
});

test("context titles retain their language and avoid duplicating an already named physician", () => {
  const english = records.find((record) => record.path === "/which-non-surgical-aesthetic-treatments-are-available-en");
  assert.equal(english.metadataContext.lang, "en");
  assert.equal(english.metadataContext.path, "/frequently-asked-questions-dr-saeed-ghezelbash-en");
  assert(english.documentTitle.includes("Frequently asked questions about Dr. Saeed Ghezelbash"));
  assert(!english.documentTitle.includes("پرسش"));
  const identity = records.find((record) => record.path === "/who-is-dr-saeed-ghezelbash-en");
  assert.equal(identity.documentTitle, identity.title);
  assert.equal(identity.documentTitle.split("Saeed Ghezelbash").length - 1, 1);
});

test("long specific medical titles are retained and complete-section and homepage titles remain unchanged", () => {
  const baseline = deriveIndependentPages(home, inputs.graph, canonicalUrl,
    { focusedViews: inputs.pageFrontmatter.discovery.focusedViews });
  const long = records.find((record) => record.path === "/clinic-before-visit-information");
  const oldLong = baseline.find((record) => record.path === long.path);
  const parent = [...long.navigation.ancestors].reverse().find((entry) =>
    entry.lang === long.lang && entry.title !== long.title);
  assert((long.title + " | " + parent.title).length > 150);
  assert.equal(long.documentTitle, oldLong.documentTitle);
  assert.equal(long.contextTitle, oldLong.contextTitle);
  const botox = records.find((record) => record.path === "/botox");
  const oldBotox = baseline.find((record) => record.path === botox.path);
  assert.equal(botox.documentTitle, oldBotox.documentTitle);
  assert.equal(botox.contextTitle, oldBotox.contextTitle);
  assert.equal(botox.bodyHtml, oldBotox.bodyHtml);
  assert.equal(botox.canonicalUrl, oldBotox.canonicalUrl);
  assert.equal(inspectHtml(home).elements.find((node) => node.tagName === "title").childNodes[0].value, "Home");
});
