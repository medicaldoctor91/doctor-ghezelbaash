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
  renderCanonicalPageHtml(inputs.pageBody, inputs.graph) +
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
    assert(document.about.some((node) => node["@id"] === inputs.lifecycle.primaryEntity.id));
    assert([document.mainEntity].flat().some((node) => node["@id"] === page.entityId));
    assert(byId.get(page.entityId)?.["@type"]);
  }
});
test("profile, question documents and visible videos retain their distinct authored entities", () => {
  const person = pages.find((page) => page.path === "/saeed-ghezelbash");
  assert.equal(person.pageType, "ProfilePage");
  assert(person.entityTypes.includes("Person"));
  assert(person.description.includes("شماره نظام پزشکی"));
  const question = pages.find((page) => page.path === "/jalupro-vs-profhilo-selection");
  assert.equal(question.pageType, "MedicalWebPage");
  assert(question.entityTypes.includes("Question"));
  assert(question.document["@graph"].some((node) => node["@type"] === "Answer"));
  assert.equal(pages.filter((page) => page.path.startsWith("/answer-")).length, 0);
  const video = pages.find((page) => page.path === "/video-saeed-ghezelbash-jalupro-vs-profhilo");
  assert(video.entityTypes.includes("VideoObject"));
  assert.equal(video.videos.length, 1);
});
test("authored question routes publish medical FAQ identity with their original question and accepted answer", () => {
  const canonicalById = new Map(inputs.graph["@graph"].map((node) => [node["@id"], node]));
  const questionPages = pages.filter((page) => page.entityTypes.includes("Question"));
  assert(questionPages.length > 0);
  for (const page of questionPages) {
    const byId = new Map(page.document["@graph"].map((node) => [node["@id"], node]));
    const document = byId.get(page.canonicalUrl + "#webpage");
    const question = byId.get(page.entityId);
    assert.equal(page.pageType, "MedicalWebPage");
    assert.deepEqual(document["@type"], ["MedicalWebPage", "FAQPage"]);
    assert.deepEqual(document.mainEntity, { "@id": question["@id"] });
    assert.deepEqual(question.acceptedAnswer, canonicalById.get(question["@id"]).acceptedAnswer);
    const answer = byId.get(question.acceptedAnswer["@id"]);
    assert.equal(answer["@type"], "Answer");
    assert.equal(typeof answer.text, "string");
    assert(answer.text.trim());
  }
  for (const page of pages.filter((page) => !page.entityTypes.includes("Question"))) {
    const document = page.document["@graph"].find((node) => node["@id"] === page.canonicalUrl + "#webpage");
    assert(![document["@type"]].flat().includes("FAQPage"));
  }
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

test("focused paths preserve the dedicated physician identity without importing the entire home graph", () => {
  const original = inputs.graph["@graph"].find((node) => node["@id"] === inputs.lifecycle.primaryEntity.id);
  const homePage = inputs.graph["@graph"].find((node) => node["@id"] === inputs.lifecycle.canonicalUrl + "webpage");
  assert([homePage["@type"]].flat().includes("MedicalWebPage"));
  for (const page of pages) {
    const author = page.document["@graph"].find((node) => node["@id"] === original["@id"]);
    assert.equal(author.url, inputs.lifecycle.canonicalUrl + "saeed-ghezelbash");
    assert.deepEqual(author["@type"], original["@type"]);
    assert.deepEqual(author.mainEntityOfPage, { "@id": inputs.lifecycle.canonicalUrl + "saeed-ghezelbash#webpage" });
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
test("the dedicated profile retains its authored primary image without expanding its graph", () => {
  const page = pages.find((page) => page.path === "/saeed-ghezelbash");
  const byId = new Map(page.document["@graph"].map((node) => [node["@id"], node]));
  const profile = byId.get(page.canonicalUrl + "#webpage");
  const authored = inputs.graph["@graph"].find((node) => node["@id"] === profile["@id"]);
  assert.deepEqual(profile.primaryImageOfPage, authored.primaryImageOfPage);
  assert.equal(byId.get(profile.primaryImageOfPage["@id"])["@type"], "ImageObject");
  const botox = pages.find((entry) => entry.path === "/botox");
  const medicalPage = botox.document["@graph"].find((node) => node["@id"] === botox.canonicalUrl + "#webpage");
  assert(!medicalPage.primaryImageOfPage);
  const graph = structuredClone(inputs.graph);
  graph["@graph"].find((node) => node["@id"] === profile["@id"]).primaryImageOfPage = {
    "@id": inputs.lifecycle.canonicalUrl + "unpublished-profile-image",
  };
  const withoutPublishedImage = deriveIndependentPages(home, graph, inputs.lifecycle.canonicalUrl)
    .find((entry) => entry.path === page.path);
  assert(!withoutPublishedImage.document["@graph"].find((node) => node["@id"] === profile["@id"]).primaryImageOfPage);
});
test("scoped physician discovery defines authored contact actions and service areas without importing unrelated service catalogs", () => {
  const canonicalById = new Map(inputs.graph["@graph"].map((node) => [node["@id"], node]));
  const discoveryById = new Map(inputs.pageJsonLd[0].document["@graph"].map((node) => [node["@id"], node]));
  const suffixes = ["action-contact-clinic", "action-online-initial-consultation", "action-view-clinic-map",
    "action-follow-instagram", "online-consultation-contact-point", "country-iraq"];
  for (const page of pages) {
    const byId = new Map(page.document["@graph"].map((node) => [node["@id"], node]));
    for (const suffix of suffixes) {
      const id = inputs.lifecycle.canonicalUrl + suffix;
      assert.deepEqual(byId.get(id), discoveryById.get(id) || canonicalById.get(id));
    }
    assert.equal(byId.size, page.document["@graph"].length);
  }
  const botox = pages.find((page) => page.path === "/botox-clinical-assessment-checklist");
  const byId = new Map(botox.document["@graph"].map((node) => [node["@id"], node]));
  assert(!byId.has(inputs.lifecycle.canonicalUrl + "procedure-facial-and-lip-dermal-filler"));
  assert(!byId.has(inputs.lifecycle.canonicalUrl + "free-online-aesthetic-initial-consultation"));
});
test("answers stay inside their canonical question documents and never become independent routes", () => {
  assert.equal(pages.filter((page) => page.path.startsWith("/answer-")).length, 0);
  const onset = pages.find((page) => page.path === "/botox-onset-of-action");
  assert(onset);
  const parsed = inspectHtml(onset.bodyHtml, { wrapMain: true });
  assert(parsed.ids.includes("answer-botox-onset-of-action"));
  assert(onset.bodyHtml.includes("حدود دو هفته"));
  assert(!onset.bodyHtml.includes('id="answer-botox-dynamic-facial-examination"'));
  assert.equal(onset.title, "چند روز بعد نتیجه دیده می‌شود؟");
  const byId = new Map(onset.document["@graph"].map((node) => [node["@id"], node]));
  const question = byId.get(onset.entityId);
  const answer = byId.get(question.acceptedAnswer["@id"]);
  assert.equal(answer["@type"], "Answer");
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

test("topic document titles keep the authored doctor name while the visible heading stays focused", () => {
  const page = pages.find((page) => page.path === "/botox-onset-of-action");
  assert.equal(page.title, "چند روز بعد نتیجه دیده می‌شود؟");
  assert(page.documentTitle.includes(page.title));
  assert(page.documentTitle.includes("سعید قزلباش"));
  assert(renderIndependentPage(home, page).includes("<title>" + page.documentTitle + "</title>"));
});

test("social locales use supported regional ISO 639-1 codes while HTML retains precise languages", () => {
  const template = home.replace("</head>", '<meta property="og:locale" content="fa_IR"><meta property="og:locale:alternate" content="en_US"><meta property="og:locale:alternate" content="ku_IQ"></head>');
  const attr = (node, key) => node.attrs?.find((entry) => entry.name === key)?.value;
  for (const [language, locale] of [["en", "en_US"], ["ckb-IQ", "ku_IQ"]]) {
    const page = pages.find((page) => page.lang === language);
    assert(page);
    const inspected = inspectHtml(renderIndependentPage(template, page));
    const metas = inspected.elements.filter((node) => node.tagName === "meta");
    assert.equal(attr(metas.find((node) => attr(node, "property") === "og:locale"), "content"), locale);
    assert(!metas.some((node) => attr(node, "property") === "og:locale:alternate" && attr(node, "content") === locale));
    assert.equal(attr(inspected.elements.find((node) => node.tagName === "html"), "lang"), language);
  }
});

test("topic social locale alternates follow only reviewed translations and their declared regions", () => {
  const template = home.replace("</head>", '<meta property="og:locale" content="fa_IR">' +
    '<meta property="og:locale:alternate" content="en_US"><meta property="og:locale:alternate" content="ar_IQ">' +
    '<meta property="og:locale:alternate" content="ku_IR"></head>');
  const attr = (node, key) => node.attrs?.find((entry) => entry.name === key)?.value;
  const locales = (html) => inspectHtml(html).elements.filter((node) =>
    node.tagName === "meta" && attr(node, "property") === "og:locale:alternate").map((node) => attr(node, "content"));
  const ordinary = pages.find((page) => page.path === "/botox");
  assert.deepEqual(locales(renderIndependentPage(template, ordinary)), []);
  const translated = ["/who-is-dr-saeed-ghezelbash-en", "/who-is-dr-saeed-ghezelbash-ar-iq", "/who-is-dr-saeed-ghezelbash-ckb-iq"]
    .map((path) => pages.find((page) => page.path === path));
  const alternates = translated.map((page) => ({ href: page.canonicalUrl, hrefLang: page.lang.replace("ckb", "ku") }));
  for (const [page, expected] of [[translated[0], ["ar_IQ", "ku_IQ"]], [translated[1], ["en_US", "ku_IQ"]],
      [translated[2], ["en_US", "ar_IQ"]]]) {
    assert.deepEqual(locales(renderIndependentPage(template, { ...page, alternates })), expected);
  }
  const withoutEnglishRegion = template.replace('<meta property="og:locale:alternate" content="en_US">', "");
  assert.deepEqual(locales(renderIndependentPage(withoutEnglishRegion, { ...translated[1], alternates })), ["ku_IQ"]);
  const options = { declaredSocialLocales: ["en_US", "ar_IQ", "ku_IR"] };
  assert.deepEqual(locales(renderIndependentPage(withoutEnglishRegion, { ...translated[1], alternates }, options)),
    ["en_US", "ku_IQ"]);
  assert.deepEqual(locales(renderIndependentPage(withoutEnglishRegion, ordinary, options)), []);
  const englishWithSourceLocale = inspectHtml(renderIndependentPage(withoutEnglishRegion, { ...translated[0], alternates }, options));
  assert.equal(attr(englishWithSourceLocale.elements.find((node) => node.tagName === "meta" && attr(node, "property") === "og:locale"), "content"), "en_US");
});

test("fine-grained Botox headings inherit authored topics and preserve their physician provider without unrelated procedures", () => {
  const page = pages.find((page) => page.path === "/botox-clinical-assessment-checklist");
  assert(page);
  assert.equal(page.entityId, page.canonicalUrl + "#content");
  const byId = new Map(page.document["@graph"].map((node) => [node["@id"], node]));
  const physicianId = inputs.lifecycle.primaryEntity.id;
  const procedureId = inputs.lifecycle.canonicalUrl + "procedure-botulinum-toxin-aesthetic-treatment";
  const conceptId = inputs.lifecycle.canonicalUrl + "biomedical-concept-botulinum-toxin-a";
  const ownContent = byId.get(page.entityId);
  const route = byId.get(page.canonicalUrl + "#webpage");
  assert.deepEqual(ownContent.about, [{ "@id": procedureId }, { "@id": conceptId }]);
  assert.deepEqual(route.about, [{ "@id": physicianId }, ...ownContent.about]);
  assert.deepEqual(byId.get(procedureId).provider, { "@id": physicianId });
  assert.equal(byId.get(conceptId)["@type"], "DefinedTerm");
  assert(byId.has(inputs.lifecycle.canonicalUrl + "biomedical-concept-registry"));
  assert(byId.has(inputs.lifecycle.canonicalUrl + "biomedical-concept-cosmetic-techniques"));
  assert(!byId.has(inputs.lifecycle.canonicalUrl + "procedure-facial-and-lip-dermal-filler"));
  assert(!byId.has(inputs.lifecycle.canonicalUrl + "biomedical-concept-dermal-fillers"));
  assert.equal(byId.get(physicianId).mainEntityOfPage["@id"], inputs.lifecycle.canonicalUrl + "saeed-ghezelbash#webpage");
  assert.equal(byId.get(physicianId).url, inputs.lifecycle.canonicalUrl + "saeed-ghezelbash");
});

test("a question keeps its exact authored topic instead of inheriting the broader containing section", () => {
  const page = pages.find((page) => page.path === "/botox-onset-of-action");
  const original = inputs.graph["@graph"].find((node) => node["@id"] === page.entityId);
  assert(original.about);
  const route = page.document["@graph"].find((node) => node["@id"] === page.canonicalUrl + "#webpage");
  assert.deepEqual(route.about, [{ "@id": inputs.lifecycle.primaryEntity.id }, ...[original.about].flat()]);
  assert(!route.about.some((ref) => ref["@id"] === inputs.lifecycle.canonicalUrl + "biomedical-concept-botulinum-toxin-a"));
  const byId = new Map(page.document["@graph"].map((node) => [node["@id"], node]));
  assert.equal(byId.get(original.acceptedAnswer["@id"])["@type"], "Answer");
});

test("foreign-language entry articles and route context override inherited homepage language and direction", () => {
  const page = pages.find((page) => page.lang === "en");
  assert(page);
  const template = home.replace('<article class="medical-guide">', '<article class="medical-guide" lang="fa-IR" dir="rtl">')
    .replace("<body>", '<body lang="fa-IR" dir="rtl">');
  const inspected = inspectHtml(renderIndependentPage(template, page));
  const attr = (node, key) => node.attrs?.find((entry) => entry.name === key)?.value;
  const article = inspected.guideArticles[0];
  const context = inspected.elements.find((node) => attr(node, "data-route-context") !== undefined);
  for (const node of [article, context]) {
    assert.equal(attr(node, "lang"), "en");
    assert.equal(attr(node, "dir"), "ltr");
  }
  assert.equal(attr(article, "aria-labelledby"), "route-page-title");
  const body = inspected.elements.find((node) => node.tagName === "body");
  assert.equal(attr(body, "lang"), "fa-IR");
  assert.equal(attr(body, "dir"), "rtl");
});

test("focused HTML renders only declared language alternates and rejects ambiguous or foreign destinations", () => {
  const page = pages.find((page) => page.lang === "en");
  const arabic = pages.find((page) => page.lang.startsWith("ar"));
  assert(page && arabic);
  const alternates = [{ href: page.canonicalUrl, hrefLang: "en" }, { href: arabic.canonicalUrl, hrefLang: arabic.lang }];
  const template = home.replace("</head>", '<link rel="alternate" hreflang="fa-IR" href="' + inputs.lifecycle.canonicalUrl + '"></head>');
  const attr = (node, key) => node.attrs?.find((entry) => entry.name === key)?.value;
  const declaredLinks = inspectHtml(renderIndependentPage(template, { ...page, alternates })).elements
    .filter((node) => node.tagName === "link" && attr(node, "hreflang"));
  assert.deepEqual(declaredLinks.map((node) => ({ href: attr(node, "href"), hrefLang: attr(node, "hreflang") })), alternates);
  assert.throws(() => renderIndependentPage(home, { ...page, alternates: [...alternates, alternates[0]] }), /Invalid authored language alternate/);
  assert.throws(() => renderIndependentPage(home, { ...page, alternates: [{ href: "https://example.com/", hrefLang: "en" }] }), /Invalid authored language alternate/);
});

test("a question embedding its authored video keeps MedicalWebPage identity, answer and supporting media", () => {
  const page = pages.find((page) => page.path === "/jalupro-vs-profhilo-selection");
  assert.equal(page.pageType, "MedicalWebPage");
  assert.deepEqual(page.document["@graph"].find((node) => node["@id"] === page.canonicalUrl + "#webpage")["@type"],
    ["MedicalWebPage", "FAQPage"]);
  assert(page.entityTypes.includes("Question"));
  const byId = new Map(page.document["@graph"].map((node) => [node["@id"], node]));
  const questionId = inputs.lifecycle.canonicalUrl + "question-jalupro-vs-profhilo-selection";
  const answerId = inputs.lifecycle.canonicalUrl + "answer-jalupro-vs-profhilo-selection";
  const videoId = inputs.lifecycle.canonicalUrl + "video-jalupro-vs-profhilo";
  assert.equal(page.entityId, questionId);
  assert.deepEqual(byId.get(questionId).acceptedAnswer, { "@id": answerId });
  assert.equal(byId.get(answerId)["@type"], "Answer");
  assert.equal(byId.get(videoId)["@type"], "VideoObject");
  assert.equal(page.videos.length, 1);
  const player = pages.find((entry) => entry.path === "/video-saeed-ghezelbash-jalupro-vs-profhilo");
  assert(player.entityTypes.includes("VideoObject"));
  assert.equal(player.entityId, videoId);
  const template = home.replace("</head>", '<meta property="og:type" content="article"></head>');
  assert(renderIndependentPage(template, page).includes('<meta property="og:type" content="article">'));
});

test("media summaries describe their authored subject without browser fallback or chapter controls", () => {
  for (const path of ["/video-thread-lift-workshop", "/video-kurdish-patient-experience",
      "/video-saeed-ghezelbash-thread-lift-workshop", "/video-saeed-ghezelbash-kurdish-patient-review"]) {
    const page = pages.find((entry) => entry.path === path);
    const media = page.document["@graph"].find((node) => node["@id"] === page.entityId);
    assert.equal(page.description, media.description);
    assert(!page.description.includes("مرورگر"));
    assert(!page.description.includes("00:00"));
    assert(!page.description.includes("وێبگەڕەکەت"));
    assert(renderIndependentPage(home, page).includes('content="' + page.description + '"'));
  }
});

test("focused body headings start below the route H1 and retain the authored hierarchy and IDs", () => {
  const page = pages.find((entry) => entry.path === "/forehead-botox-brow-compensation-and-ptosis-risk");
  const fragment = inspectHtml(page.bodyHtml, { wrapMain: true });
  assert.equal(fragment.headings[0].tagName, "h2");
  assert.equal(fragment.headings[1].tagName, "h3");
  assert(fragment.ids.includes("forehead-botox-rest-and-movement-assessment"));
  assert(fragment.ids.includes("forehead-botox-brow-compensation-and-ptosis-risk"));
  const focused = inspectHtml(renderIndependentPage(home, page));
  assert.equal(focused.headings.filter((node) => node.tagName === "h1").length, 1);
  assert.equal(focused.headings[1].tagName, "h2");
  const original = inspectHtml(home).headings.find((node) => node.attrs?.some((entry) =>
    entry.name === "id" && entry.value === page.htmlId));
  assert.equal(original.tagName, "h4");
});

test("named section heading entries show their introduction while section paths retain all subtopics", () => {
  for (const section of ["botox", "filler", "thread-lift"]) {
    const complete = pages.find((page) => page.path === "/" + section);
    const overview = pages.find((page) => page.path === "/" + section + "-heading");
    assert(complete && overview);
    assert(overview.description && overview.bodyHtml.length < complete.bodyHtml.length);
    const overviewContent = inspectHtml(overview.bodyHtml, { wrapMain: true });
    const completeContent = inspectHtml(complete.bodyHtml, { wrapMain: true });
    assert.equal(overviewContent.headings.length, 1);
    assert(completeContent.headings.length > 1);
    assert(overview.bodyHtml.includes("قاعده من:"));
    assert.notEqual(overview.bodyHtml, complete.bodyHtml);
    assert.equal(overview.canonicalUrl, inputs.lifecycle.canonicalUrl + section + "-heading");
    assert.equal(complete.canonicalUrl, inputs.lifecycle.canonicalUrl + section);
    const rendered = renderIndependentPage(home, overview);
    assert(rendered.includes('data-guide-expand'));
  }
});

test("question summaries retain their authored answer and section summaries begin with medical prose", () => {
  const question = pages.find((page) => page.path === "/botox-onset-of-action");
  const original = inputs.graph["@graph"].find((node) => node["@id"] === question.entityId);
  const answer = inputs.graph["@graph"].find((node) => node["@id"] === original.acceptedAnswer["@id"]);
  assert.equal(question.description, answer.description || answer.text);
  const overview = pages.find((page) => page.path === "/botox-heading");
  assert(overview.description.startsWith("قاعده من:"));
  assert(!overview.description.startsWith(overview.title));
});


test("declared historical summary keeps its own geographic evidence distinct from travel guidance", () => {
  const withViews = deriveIndependentPages(home, inputs.graph, inputs.lifecycle.canonicalUrl,
    { focusedViews: inputs.pageFrontmatter.discovery.focusedViews });
  const summary = withViews.find((page) => page.path === "/historical-patient-origin-summary");
  const travel = withViews.find((page) => page.path === "/out-of-town-aesthetic-patients-iran");
  assert.equal(summary.scopeKind, "disclosure-summary");
  assert(summary.bodyHtml.includes("کرمانشاه و استان کرمانشاه"));
  assert(summary.bodyHtml.includes("عراق و اقلیم کردستان"));
  assert(!summary.bodyHtml.includes("نوع مراجعه"));
  assert(summary.description.includes("تعداد بیماران یا ارائهٔ خدمات فعلی"));
  assert.equal(summary.title, inputs.pageFrontmatter.discovery.focusedViews[0].title);
  assert.notEqual(summary.bodyHtml, travel.bodyHtml);
  assert(summary.bodyHtml.length < travel.bodyHtml.length);
  assert(inspectHtml(summary.bodyHtml, { wrapMain: true }).ids.includes("historical-patient-origin-summary"));
  assert.equal(summary.entityId, inputs.lifecycle.canonicalUrl + "historical-patient-origin-summary");
  assert(summary.entityTypes.includes("CreativeWork"));
  const original = inputs.graph["@graph"].find((node) => node["@id"] === summary.entityId);
  const originalById = new Map(inputs.graph["@graph"].map((node) => [node["@id"], node]));
  const scopedById = new Map(summary.document["@graph"].map((node) => [node["@id"], node]));
  const browserById = new Map(inspectHtml(home).elements
    .filter((node) => node.tagName === "script" && node.attrs?.some((entry) =>
      entry.name === "type" && entry.value === "application/ld+json"))
    .flatMap((node) => JSON.parse(node.childNodes.map((child) => child.value || "").join(""))["@graph"])
    .map((node) => [node["@id"], node]));
  assert.deepEqual(scopedById.get(summary.entityId).spatialCoverage, original.spatialCoverage);
  assert.equal(scopedById.get(summary.entityId).temporalCoverage, "historical");
  const queue = [...original.spatialCoverage];
  const visited = new Set();
  while (queue.length) {
    const ref = queue.shift();
    if (visited.has(ref["@id"])) continue;
    visited.add(ref["@id"]);
    const authoredPlace = originalById.get(ref["@id"]);
    assert(authoredPlace, "Geographic evidence must refer to an authored place");
    assert.deepEqual(scopedById.get(ref["@id"]), browserById.get(ref["@id"]),
      "Historical geography keeps its authored place definition and containment");
    const parents = Array.isArray(authoredPlace.containedInPlace)
      ? authoredPlace.containedInPlace : authoredPlace.containedInPlace ? [authoredPlace.containedInPlace] : [];
    queue.push(...parents);
  }
  assert(!scopedById.has(inputs.lifecycle.canonicalUrl + "graph.jsonld/dataset"),
    "Historical geography must not import the comprehensive homepage Dataset");
});

test("declared focused views fail rather than selecting missing or unrelated source regions", () => {
  const valid = inputs.pageFrontmatter.discovery.focusedViews[0];
  for (const patch of [{ path: "/missing" }, { sourceHeading: "unrelated" }, { mode: "random" }])
    assert.throws(() => deriveIndependentPages(home, inputs.graph, inputs.lifecycle.canonicalUrl,
      { focusedViews: [{ ...valid, ...patch }] }), /declared|Declared/);
});
