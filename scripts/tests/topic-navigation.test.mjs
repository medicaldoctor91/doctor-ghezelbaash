import test from "node:test";
import assert from "node:assert/strict";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { renderCanonicalPageHtml } from "../../src/lib/canonical-page-html.mjs";
import { deriveIndependentPages } from "../lib/independent-pages.mjs";
import { inspectHtml } from "../lib/html-contract.mjs";
import { attachTopicNavigation, navigationRoots, renderTopicNavigation, deriveTopicBreadcrumbItems } from "../lib/topic-navigation.mjs";
import { discoveryPolicy } from "../../src/config/site-policy.mjs";
import { canonicalPaths, urlForHtmlId, resolveContentUrl } from "../../src/lib/url-architecture.mjs";

const canonicalUrl = "https://www.ghezelbaash.ir/";
const attr = (node, key) => node.attrs?.find((entry) => entry.name === key)?.value;
const homeDocument = (body) => '<!doctype html><html lang="fa-IR"><head><title>Home</title><link rel="canonical" href="' +
  canonicalUrl + '"></head><body><main id="main-content"><article class="medical-guide">' + body + "</article></main></body></html>";
const entry = (id, title, lang = "fa-IR") => ({ path: "/" + id, htmlId: id, title, lang });

test("nested headings, answer paragraphs and media follow their authored topic instead of nearby siblings", () => {
  const home = homeDocument('<section id="botox" aria-labelledby="botox-heading"><h2 id="botox-heading">Botox</h2>' +
    '<h3 id="upper-face">Upper face</h3><h4 id="forehead">Forehead</h4><h5 id="compensation">Compensation</h5>' +
    '<p id="answer-compensation" class="answer-projection">Answer</p><h5 id="dose">Dose</h5>' +
    '<h4 id="eyes">Eyes</h4><figure id="video-figure"><video id="video-player"></video></figure></section>' +
    '<section id="filler" aria-labelledby="filler-heading"><h2 id="filler-heading">Filler</h2><h3 id="lips">Lips</h3></section>');
  const records = [entry("botox", "Botox"), entry("botox-heading", "Botox"), entry("upper-face", "Upper face"),
    entry("forehead", "Forehead"), entry("compensation", "Compensation"), entry("answer-compensation", "Compensation"),
    entry("dose", "Dose"), entry("eyes", "Eyes"), entry("video-figure", "Video"), entry("video-player", "Video"),
    entry("filler", "Filler"), entry("filler-heading", "Filler"), entry("lips", "Lips")];
  const pages = attachTopicNavigation(records, home, canonicalUrl);
  const byPath = new Map(pages.map((page) => [page.path, page]));
  assert.equal(byPath.get("/forehead").navigation.parent.path, "/upper-face");
  assert.equal(byPath.get("/compensation").navigation.parent.path, "/forehead");
  assert.equal(byPath.get("/answer-compensation").navigation.parent.path, "/compensation");
  assert.equal(byPath.get("/eyes").navigation.parent.path, "/upper-face");
  assert.equal(byPath.get("/video-figure").navigation.parent.path, "/eyes");
  assert.equal(byPath.get("/video-player").navigation.parent.path, "/video-figure");
  assert.deepEqual(byPath.get("/forehead").navigation.children.map((link) => link.path), ["/compensation", "/dose"]);
  assert.deepEqual(navigationRoots(pages).map((link) => link.path), ["/botox", "/filler"]);
  assert.equal(byPath.get("/lips").navigation.parent.path, "/filler-heading");
  assert(records.every((record) => record.navigation === undefined));
});

test("language summaries and their labelled content sections retain their own heading ancestry", () => {
  const home = homeDocument('<details lang="en"><summary><h2 id="en-guide">English guide</h2></summary>' +
    '<section aria-labelledby="en-guide"><h3 id="en-faq">English questions</h3><h4 id="en-question">Question</h4>' +
    '<p id="en-answer" class="answer-projection">Answer</p></section></details>' +
    '<details lang="ar-IQ"><summary><h2 id="ar-guide">الدليل</h2></summary>' +
    '<section aria-labelledby="ar-guide"><h3 id="ar-faq">الأسئلة</h3></section></details>');
  const pages = attachTopicNavigation([entry("en-guide", "English guide", "en"), entry("en-faq", "English questions", "en"),
    entry("en-question", "Question", "en"), entry("en-answer", "Question", "en"),
    entry("ar-guide", "الدليل", "ar-IQ"), entry("ar-faq", "الأسئلة", "ar-IQ")], home, canonicalUrl);
  const byPath = new Map(pages.map((page) => [page.path, page]));
  assert.equal(byPath.get("/en-faq").navigation.parent.path, "/en-guide");
  assert.equal(byPath.get("/en-answer").navigation.parent.path, "/en-question");
  assert.equal(byPath.get("/ar-faq").navigation.parent.path, "/ar-guide");
  assert(byPath.get("/en-answer").navigation.ancestors.every((link) => link.lang === "en"));
  assert.deepEqual(navigationRoots(pages).map((link) => link.path), ["/en-guide", "/ar-guide"]);
});

test("an empty historical alias belongs to its actual following region", () => {
  const home = homeDocument('<section id="clinic" aria-labelledby="clinic-heading"><h2 id="clinic-heading">Clinic</h2>' +
    '<h3 id="contact">Contact</h3><p>Address</p><span id="history" class="semantic-alias-anchor"></span>' +
    '<h3 id="patients">Out of town patients</h3><p>Travel information</p></section>');
  const pages = attachTopicNavigation([entry("clinic", "Clinic"), entry("clinic-heading", "Clinic"),
    entry("contact", "Contact"), entry("history", "Out of town patients"), entry("patients", "Out of town patients")], home, canonicalUrl);
  assert.equal(pages.find((page) => page.path === "/history").navigation.parent.path, "/patients");
});

test("breadcrumbs collapse an explicitly equivalent section and heading while preserving the current URL", () => {
  const home = homeDocument('<section id="botox" aria-labelledby="botox-heading"><h2 id="botox-heading">Botox</h2>' +
    '<h3 id="upper-face">Upper face</h3><h4 id="forehead">Forehead</h4></section>');
  const pages = attachTopicNavigation([entry("botox", "Botox"), entry("botox-heading", "Botox"),
    entry("upper-face", "Upper face"), entry("forehead", "Forehead")], home, canonicalUrl);
  const options = { canonicalUrl, homeTitle: "Dr. Saeed Ghezelbash" };
  const forehead = deriveTopicBreadcrumbItems(pages.find((page) => page.path === "/forehead"), pages, options);
  assert.deepEqual(forehead.map((item) => item.item), [canonicalUrl, canonicalUrl + "botox", canonicalUrl + "upper-face", canonicalUrl + "forehead"]);
  assert.deepEqual(forehead.map((item) => item.position), [1, 2, 3, 4]);
  const alias = deriveTopicBreadcrumbItems(pages.find((page) => page.path === "/botox-heading"), pages, options);
  assert.deepEqual(alias.map((item) => item.item), [canonicalUrl, canonicalUrl + "botox-heading"]);
  assert.equal(forehead.at(-1).name, "Forehead");
});

test("topic links are native, escaped, language-aware and limited to the structural parent and children", () => {
  for (const [lang, summary] of [["fa-IR", "موضوع‌های این بخش"], ["en", "Topics in this section"],
    ["ar-IQ", "مواضيع هذا القسم"], ["ckb-IQ", "بابەتەکانی ئەم بەشە"]]) {
    const record = { lang, navigation: { parent: { path: "/parent", title: "Parent", lang: "en" },
      children: [{ path: "/child", title: 'A < B & "C"', lang }], ancestors: [] } };
    const html = renderTopicNavigation(record);
    const parsed = inspectHtml(html, { wrapMain: true });
    const links = parsed.elements.filter((node) => node.tagName === "a");
    assert.deepEqual(links.map((node) => attr(node, "href")), ["/parent", "/child"]);
    assert.equal(attr(links[0], "dir"), "ltr");
    assert.equal(attr(links[1], "lang"), lang);
    assert.equal(attr(links[1], "dir"), lang === "en" ? "ltr" : "rtl");
    assert(html.includes(summary));
    assert(html.includes("A &lt; B &amp; &quot;C&quot;"));
    assert(parsed.elements.some((node) => node.tagName === "details"));
    assert(!parsed.elements.some((node) => attr(node, "hidden") !== undefined));
  }
  assert.throws(() => renderTopicNavigation({ lang: "en", navigation: { children: [{ path: "//evil.test", title: "Bad", lang: "en" }] } }), /Invalid native topic link/);
});

test("navigation rejects missing authored destinations, duplicate routes and explicit circular labels", () => {
  const home = homeDocument('<section id="one" aria-labelledby="two"><section id="two" aria-labelledby="one"><p>Text</p></section></section>');
  assert.throws(() => attachTopicNavigation([entry("missing", "Missing")], home, canonicalUrl), /lacks its authored target/);
  assert.throws(() => attachTopicNavigation([entry("one", "One"), entry("one", "One")], home, canonicalUrl), /duplicate/);
  const circular = homeDocument('<section aria-labelledby="two"><h3 id="one-topic">One</h3></section>' +
    '<section aria-labelledby="one-topic"><h3 id="two">Two</h3></section>');
  assert.throws(() => attachTopicNavigation([entry("one-topic", "One"), entry("two", "Two")], circular, canonicalUrl), /cycle/);
});

const inputs = readCanonicalInputs();
const actualHome = homeDocument(renderCanonicalPageHtml(inputs.pageBody, inputs.graph));
const actualRecords = deriveIndependentPages(actualHome, inputs.graph, canonicalUrl,
  { focusedViews: discoveryPolicy.focusedViews });
const actualPages = attachTopicNavigation(actualRecords, actualHome, canonicalUrl);

test("every actual canonical route is reachable through native structural links from the homepage roots", () => {
  assert(actualPages.length > 0);
  assert.equal(actualPages.length, actualRecords.length);
  const byPath = new Map(actualPages.map((page) => [page.path, page]));
  const visited = new Set(), queue = navigationRoots(actualPages).map((link) => link.path);
  while (queue.length) {
    const path = queue.shift();
    if (visited.has(path)) continue;
    assert(byPath.has(path), "Native link must resolve to an emitted topic: " + path);
    visited.add(path);
    const page = byPath.get(path);
    const parsed = inspectHtml(renderTopicNavigation(page), { wrapMain: true });
    queue.push(...parsed.elements.filter((node) => node.tagName === "a").map((node) => attr(node, "href")));
    assert.equal(new Set(page.navigation.ancestors.map((link) => link.path)).size, page.navigation.ancestors.length);
    assert(!page.navigation.ancestors.some((link) => link.path === path));
    for (const child of page.navigation.children) {
      assert.equal(byPath.get(child.path).navigation.parent.path, path);
      assert.equal(child.title, byPath.get(child.path).title);
    }
  }
  assert.equal(visited.size, actualPages.length);
  assert.deepEqual(actualPages.map((page) => page.path), actualRecords.map((page) => page.path));
  assert(actualRecords.every((page) => page.navigation === undefined));
});

test("retained Botox topics express actual semantic parents while all authored questions remain readable in their owner", () => {
  const byPath = new Map(actualPages.map((page) => [page.path, page]));
  assert.deepEqual(actualPages.map((page) => page.path), canonicalPaths().filter((path) => path !== "/"));
  assert.equal(byPath.get("/upper-face-botox").navigation.parent.path, "/botox");
  assert.equal(byPath.get("/blepharoplasty-for-excess-eyelid-skin-and-fat").navigation.parent.path, "/upper-face-botox");
  assert(!byPath.has("/forehead-botox-brow-compensation-and-ptosis-risk"));
  assert.equal(resolveContentUrl("/forehead-botox-brow-compensation-and-ptosis-risk"),
    "/upper-face-botox#forehead-botox-brow-compensation-and-ptosis-risk");
  assert.equal(urlForHtmlId("forehead-lines-overactivity-vs-compensation"),
    "/upper-face-botox#forehead-lines-overactivity-vs-compensation");
  assert.equal(byPath.get("/historical-patient-origin-summary").navigation.parent.path, "/out-of-town-aesthetic-patients-iran");
  assert.equal(actualPages.filter((page) => page.path.startsWith("/answer-")).length, 0);
  const typed = (node, type) => [node?.["@type"]].flat().includes(type);
  const sourceById = new Map(inputs.graph["@graph"].map((node) => [node["@id"], node]));
  const questions = inputs.graph["@graph"].filter((node) => [node["@type"]].flat().includes("Question"));
  assert.equal(questions.length, 125);
  const idsByOwner = new Map(actualPages.map((page) => [page.path,
    new Set(inspectHtml(page.bodyHtml, { wrapMain: true }).ids)]));
  for (const question of questions) {
    const source = new URL(question.url);
    const path = source.pathname;
    const page = byPath.get(path);
    assert(page, "Question must belong to a retained source document: " + question.url);
    const questionHtmlId = decodeURIComponent(source.hash.slice(1)) || page.htmlId;
    assert(idsByOwner.get(path).has(questionHtmlId), "The original question heading must remain readable: " + question.url);
    assert.equal(urlForHtmlId(questionHtmlId), source.pathname + source.hash);
    const nodes = new Map(page.document["@graph"].map((node) => [node["@id"], node]));
    assert(typed(nodes.get(question["@id"]), "Question"));
    assert(page.document["@graph"].some((node) => typed(node, "FAQPage") && [node.mainEntity].flat()
      .some((ref) => ref?.["@id"] === question["@id"])), "The scoped FAQ must include its visible authored question: " + question.url);
    const answerId = [question.acceptedAnswer].flat()[0]?.["@id"];
    assert(answerId, "Question must retain its accepted Answer: " + question.url);
    assert(typed(nodes.get(answerId), "Answer"), "Owner graph must carry its accepted Answer: " + question.url);
    assert.deepEqual(nodes.get(question["@id"]).acceptedAnswer, question.acceptedAnswer);
    const answer = sourceById.get(answerId);
    assert(answer, "Accepted Answer identity must remain in the canonical graph");
    const answerSource = new URL(answerId);
    const answerHtmlId = decodeURIComponent(answerSource.hash.slice(1));
    assert(answerHtmlId.startsWith("answer-"), "Answer URLs must use the original answer fragment");
    assert.equal(answerSource.pathname, path);
    assert(idsByOwner.get(path).has(answerHtmlId), "Owner document must visibly contain its answer: " + answerId);
  }
});

test("all three complete language guides are native roots and own their question fragments without borrowing another language", () => {
  const byPath = new Map(actualPages.map((page) => [page.path, page]));
  const roots = new Set(navigationRoots(actualPages).map((link) => link.path));
  for (const [lang, suffix, htmlId] of [["en", "en", "english-facial-aesthetic-doctor-section"],
    ["ar-IQ", "ar-iq", "iraqi-arabic-facial-aesthetic-doctor-section"],
    ["ckb-IQ", "ckb-iq", "sorani-kurdish-facial-aesthetic-doctor-section"]]) {
    const guidePath = "/aesthetic-guide-" + suffix;
    const guide = byPath.get(guidePath);
    assert(roots.has(guidePath));
    assert.equal(guide.lang, lang);
    assert.equal(guide.htmlId, htmlId);
    assert.equal(guide.navigation.parent, undefined);
    assert.deepEqual(guide.navigation.ancestors, []);
    assert.equal(urlForHtmlId("who-is-dr-saeed-ghezelbash-" + suffix),
      guidePath + "#who-is-dr-saeed-ghezelbash-" + suffix);
    assert(!byPath.has("/who-is-dr-saeed-ghezelbash-" + suffix));
    for (const child of guide.navigation.children) {
      assert.equal(child.lang, lang);
      assert.equal(byPath.get(child.path).navigation.parent.path, guidePath);
    }
  }
  const review = byPath.get("/video-saeed-ghezelbash-kurdish-patient-review");
  assert.equal(review.navigation.parent.path, "/aesthetic-guide-ckb-iq");
});
