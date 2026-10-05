import test from "node:test";
import assert from "node:assert/strict";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { discoveryPolicy } from "../../src/config/site-policy.mjs";
import { renderCanonicalPageHtml } from "../../src/lib/canonical-page-html.mjs";
import { localizedText } from "../../src/lib/page-discovery-jsonld.mjs";
import { URL_ARCHITECTURE, urlForHtmlId } from "../../src/lib/url-architecture.mjs";
import { deriveIndependentPages, renderIndependentPage, routeDocumentFile } from "../lib/independent-pages.mjs";
import { inspectHtml } from "../lib/html-contract.mjs";

const inputs = readCanonicalInputs();
const makeHome = (graph = inputs.graph) => '<!doctype html><html lang="fa-IR" dir="rtl"><head><title>Home</title><meta name="description" content="Home"><link rel="canonical" href="' +
  inputs.lifecycle.canonicalUrl + '"></head><body><main id="main-content"><article class="medical-guide">' +
  renderCanonicalPageHtml(inputs.pageBody, graph) +
  '</article></main></body></html>';
const home = makeHome();
const options = { focusedViews: discoveryPolicy.focusedViews };
const pages = deriveIndependentPages(home, inputs.graph, inputs.lifecycle.canonicalUrl, options);
const canonicalById = new Map(inputs.graph["@graph"].map((node) => [node["@id"], node]));
const homeById = new Map(inputs.pageJsonLd.flatMap((entry) => entry.document["@graph"])
  .map((node) => [node["@id"], node]));
const attr = (node, key) => node?.attrs?.find((entry) => entry.name === key)?.value;
const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const typed = (node, type) => values(node?.["@type"]).includes(type);
const byIdFor = (page) => new Map(page.document["@graph"].map((node) => [node["@id"], node]));
const pageFor = (path) => {
  const page = pages.find((page) => page.path === path);
  assert(page, "Expected retained resource: " + path);
  return page;
};
const ownerFor = (htmlId) => pageFor(new URL(urlForHtmlId(htmlId), inputs.lifecycle.canonicalUrl).pathname);
const questionFor = (htmlId) => {
  const url = new URL(urlForHtmlId(htmlId), inputs.lifecycle.canonicalUrl).href;
  const question = inputs.graph["@graph"].find((node) => typed(node, "Question") && node.url === url);
  assert(question, "Expected authored Question: " + htmlId);
  return question;
};
const contentHtmlId = (url) => {
  const parsed = new URL(url);
  return parsed.hash ? parsed.hash.slice(1) : parsed.pathname.slice(1);
};
const textContent = (node) => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(textContent).join(" ");
const bodyText = (html) => textContent(inspectHtml(html, { wrapMain: true }).document).replace(/\s+/g, " ").trim();
const inlineText = (node) => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(inlineText).join("");
const normalizedText = (value) => value.replace(/\s+/g, " ").trim();

test("only declared direct resources have canonical documents and readable initial content", () => {
  const resources = URL_ARCHITECTURE.resources.filter((resource) => resource.path !== "/");
  assert.equal(pages.length, resources.length);
  assert.deepEqual(pages.map((page) => page.path), resources.map((resource) => resource.path));
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
test("homepage authority owns the stable physician identity while questions and videos retain their subjects", () => {
  const homeId = inputs.lifecycle.canonicalUrl + "webpage";
  const profile = homeById.get(homeId);
  const person = homeById.get(inputs.lifecycle.primaryEntity.id);
  assert(typed(profile, "ProfilePage"));
  assert(typed(profile, "MedicalWebPage"));
  assert.deepEqual(profile.mainEntity, { "@id": person["@id"] });
  assert.equal(profile.url, inputs.lifecycle.canonicalUrl);
  assert.equal(person["@id"], inputs.lifecycle.canonicalUrl + "#saeed-ghezelbash");
  assert(typed(person, "Person"));
  assert(typed(person, "IndividualPhysician"));
  assert.equal(person.url, inputs.lifecycle.canonicalUrl);
  assert.deepEqual(person.mainEntityOfPage, { "@id": homeId });
  assert.equal(urlForHtmlId("saeed-ghezelbash"), "/#saeed-ghezelbash");
  assert(inspectHtml(home).headings.some((node) => node.tagName === "h1" && attr(node, "id") === "saeed-ghezelbash"));
  assert(!pages.some((page) => page.path === "/saeed-ghezelbash"));
  assert(!homeById.has(inputs.lifecycle.canonicalUrl + "saeed-ghezelbash#webpage"));
  assert(!canonicalById.has(inputs.lifecycle.canonicalUrl + "saeed-ghezelbash#webpage"));
  const question = pageFor("/botox-mechanism-indications-and-limitations");
  assert.equal(question.pageType, "MedicalWebPage");
  assert(question.entityTypes.includes("Question"));
  assert(question.document["@graph"].some((node) => node["@type"] === "Answer"));
  assert.equal(pages.filter((page) => page.path.startsWith("/answer-")).length, 0);
  const video = pageFor("/video-saeed-ghezelbash-jalupro-vs-profhilo");
  assert(video.entityTypes.includes("VideoObject"));
  assert.equal(video.videos.length, 1);
});
test("retained Question-primary topics publish medical FAQ identity with their authored accepted answer", () => {
  const questionPages = pages.filter((page) => page.entityTypes.includes("Question"));
  assert(questionPages.length > 0);
  for (const page of questionPages) {
    const byId = new Map(page.document["@graph"].map((node) => [node["@id"], node]));
    const document = byId.get(page.canonicalUrl + "#webpage");
    const question = byId.get(page.entityId);
    assert.equal(new URL(question["@id"]).pathname, page.path);
    assert(new URL(question["@id"]).hash.startsWith("#question-"));
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

test("context resources attach only their visible authored questions as separate FAQ companions", () => {
  let companions = 0;
  for (const page of pages) {
    const byId = byIdFor(page);
    const document = byId.get(page.canonicalUrl + "#webpage");
    const content = inspectHtml(page.bodyHtml, { wrapMain: true });
    const scopedQuestions = inputs.graph["@graph"].filter((node) => typed(node, "Question") &&
      content.ids.includes(contentHtmlId(node.url)) && values(node.acceptedAnswer).every((answer) =>
        content.ids.includes(contentHtmlId(answer["@id"]))));
    const companion = byId.get(page.canonicalUrl + "#questions");
    if (!scopedQuestions.length || scopedQuestions.length === 1 && page.entityTypes.includes("Question")) {
      assert(!companion);
      continue;
    }
    companions++;
    assert.equal(companion["@type"], "FAQPage");
    assert.equal(companion.url, page.canonicalUrl);
    assert.deepEqual(companion.isPartOf, { "@id": document["@id"] });
    assert(values(document.hasPart).some((ref) => ref["@id"] === companion["@id"]));
    assert.deepEqual(companion.mainEntity, scopedQuestions.map((question) => ({ "@id": question["@id"] })));
    for (const authored of scopedQuestions) {
      const question = byId.get(authored["@id"]);
      assert.equal(new URL(question["@id"]).pathname, page.path);
      assert.deepEqual(question.acceptedAnswer, authored.acceptedAnswer);
      for (const ref of values(question.acceptedAnswer)) {
        const answer = byId.get(ref["@id"]);
        assert.equal(answer["@type"], "Answer");
        assert.equal(new URL(answer["@id"]).pathname, page.path);
        assert(new URL(answer["@id"]).hash.startsWith("#answer-"));
        assert.equal(answer.text, localizedText(canonicalById.get(answer["@id"]).text, page.lang));
        const visibleAnswer = content.elements.find((node) => attr(node, "id") === contentHtmlId(answer["@id"]));
        assert.equal(normalizedText(inlineText(visibleAnswer)), normalizedText(answer.text),
          "The readable answer must match its scoped FAQ data: " + answer["@id"]);
      }
    }
  }
  assert(companions > 0);
  const mechanism = pageFor("/botox-mechanism-indications-and-limitations");
  assert(byIdFor(mechanism).get(mechanism.canonicalUrl + "#questions").mainEntity
    .some((ref) => ref["@id"] === mechanism.entityId), "Question-primary topics retain companion questions in the same scope");
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
test("direct entry presents authored opening prose once while preserving its machine description", () => {
  const page = pageFor("/hyaluronidase-filler-dissolution-limitations");
  const authored = inspectHtml(page.bodyHtml, { wrapMain: true }).elements.find((node) => node.tagName === "p");
  const opening = normalizedText(inlineText(authored));
  assert(opening.startsWith(page.description), "The fixture must exercise a description taken from its authored introduction");
  const rendered = inspectHtml(renderIndependentPage(home, page));
  const context = rendered.elements.find((node) => attr(node, "data-route-context") !== undefined);
  assert(!normalizedText(inlineText(context)).includes(page.description),
    "Route chrome must not repeat a metadata excerpt above the authored introduction");
  assert.equal(rendered.elements.filter((node) => node.tagName === "p" &&
    normalizedText(inlineText(node)) === opening).length, 1,
  "The authored opening paragraph must remain visible exactly once");
  const description = rendered.elements.find((node) => node.tagName === "meta" && attr(node, "name") === "description");
  assert.equal(attr(description, "content"), page.description);
  const schema = rendered.elements.find((node) => node.tagName === "script" && attr(node, "type") === "application/ld+json");
  const pageNode = JSON.parse(inlineText(schema))["@graph"].find((node) => node["@id"] === page.canonicalUrl + "#webpage");
  assert.equal(pageNode.description, page.description);
});
test("physical route files preserve clean paths and reject traversal", () => {
  assert.equal(routeDocumentFile("/botox"), "botox.html");
  assert.throws(() => routeDocumentFile("/../botox"), /Unsafe/);
});

test("focused paths preserve the physician identity and homepage authority without importing its entire graph", () => {
  const original = inputs.graph["@graph"].find((node) => node["@id"] === inputs.lifecycle.primaryEntity.id);
  const homePage = inputs.graph["@graph"].find((node) => node["@id"] === inputs.lifecycle.canonicalUrl + "webpage");
  assert([homePage["@type"]].flat().includes("MedicalWebPage"));
  assert([homePage["@type"]].flat().includes("ProfilePage"));
  for (const page of pages) {
    const author = page.document["@graph"].find((node) => node["@id"] === original["@id"]);
    assert.equal(author["@id"], inputs.lifecycle.canonicalUrl + "#saeed-ghezelbash");
    assert.equal(author.url, inputs.lifecycle.canonicalUrl);
    assert.deepEqual(author["@type"], original["@type"]);
    assert.deepEqual(author.mainEntityOfPage, { "@id": homePage["@id"] });
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
    assert(!page.document["@graph"].some((node) => node["@id"] === inputs.lifecycle.canonicalUrl + "saeed-ghezelbash#webpage"));
  }
});
test("the homepage profile retains its authored primary image while topic pages do not invent one", () => {
  const profile = homeById.get(inputs.lifecycle.canonicalUrl + "webpage");
  const authored = canonicalById.get(profile["@id"]);
  assert(typed(profile, "ProfilePage"));
  assert.deepEqual(profile.primaryImageOfPage, authored.primaryImageOfPage);
  assert(typed(homeById.get(profile.primaryImageOfPage["@id"]), "ImageObject"));
  for (const page of pages) {
    const topicPage = byIdFor(page).get(page.canonicalUrl + "#webpage");
    assert(!topicPage.primaryImageOfPage, "Only authored homepage authority owns the profile image: " + page.path);
    assert(!typed(topicPage, "ProfilePage"));
  }
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
  const botox = ownerFor("botox-clinical-assessment-checklist");
  const byId = new Map(botox.document["@graph"].map((node) => [node["@id"], node]));
  assert(!byId.has(inputs.lifecycle.canonicalUrl + "procedure-facial-and-lip-dermal-filler"));
  assert(!byId.has(inputs.lifecycle.canonicalUrl + "free-online-aesthetic-initial-consultation"));
});
test("FAQ leaves and answers stay inside their retained owner and never become independent routes", () => {
  assert.equal(pages.filter((page) => page.path.startsWith("/answer-")).length, 0);
  assert(!pages.some((page) => page.path === "/botox-onset-of-action"));
  const owner = ownerFor("botox-onset-of-action");
  const parsed = inspectHtml(owner.bodyHtml, { wrapMain: true });
  assert.equal(owner.path, "/botox");
  assert(parsed.ids.includes("botox-onset-of-action"));
  assert(parsed.ids.includes("answer-botox-onset-of-action"));
  assert(owner.bodyHtml.includes("حدود دو هفته"));
  assert(!parsed.ids.includes("answer-botox-dynamic-facial-examination"));
  const byId = byIdFor(owner);
  const authored = questionFor("botox-onset-of-action");
  const question = byId.get(authored["@id"]);
  assert.equal(question.name, "چند روز بعد نتیجه دیده می‌شود؟");
  assert.equal(question["@id"], owner.canonicalUrl + "#question-botox-onset-of-action");
  assert.equal(question.acceptedAnswer["@id"], owner.canonicalUrl + "#answer-botox-onset-of-action");
  const answer = byId.get(question.acceptedAnswer["@id"]);
  assert.equal(answer["@type"], "Answer");
  const faq = byId.get(owner.canonicalUrl + "#questions");
  assert(faq.mainEntity.some((ref) => ref["@id"] === question["@id"]));
  const assessment = ownerFor("botox-dynamic-facial-examination");
  assert.notEqual(assessment.path, owner.path);
  assert(inspectHtml(assessment.bodyHtml, { wrapMain: true }).ids.includes("answer-botox-dynamic-facial-examination"));
});
test("the historical alias retains its own disclosure without unrelated clinic or travel guidance", () => {
  const page = pageFor("/historical-patient-origin-summary");
  assert(page.bodyHtml.includes('id="historical-patient-origin-summary"'));
  assert.equal(page.scopeKind, "disclosure-summary");
  assert(!page.bodyHtml.includes('id="out-of-town-aesthetic-patients-iran"'));
  assert(!page.bodyHtml.includes('id="saeed-ghezelbash-clinic-contact-and-location"'));
  assert(!page.bodyHtml.includes('id="answer-clinic-before-visit-information"'));
  assert(page.entityTypes.includes("CreativeWork"));
});

test("retained video players use their actual video title and original figure and source files", () => {
  assert(!pages.some((page) => ["/video-thread-lift-workshop", "/video-kurdish-patient-experience"].includes(page.path)));
  for (const resource of URL_ARCHITECTURE.resources.filter((resource) => resource.scope === "media")) {
    const page = pageFor(resource.path);
    const video = page.document["@graph"].find((node) => node["@id"] === page.entityId);
    assert(page.entityTypes.includes("VideoObject"));
    assert.equal(page.title, video.name);
    const content = inspectHtml(page.bodyHtml, { wrapMain: true });
    assert.equal(content.videos.length, 1);
    assert(content.ids.includes(resource.htmlId));
    assert(content.elements.some((node) => node.tagName === "figure"));
    assert(content.elements.some((node) => node.tagName === "source" &&
      new URL(attr(node, "src"), inputs.lifecycle.canonicalUrl).href === video.contentUrl));
  }
});

test("topic document titles keep the authored doctor name while the visible heading stays focused", () => {
  const page = pageFor("/botox-mechanism-indications-and-limitations");
  assert.equal(page.title, questionFor(page.htmlId).name);
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
  const translated = ["/aesthetic-guide-en", "/aesthetic-guide-ar-iq", "/aesthetic-guide-ckb-iq"].map(pageFor);
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

test("retained Botox assessment preserves authored topics and its physician provider without unrelated procedures", () => {
  const page = ownerFor("botox-clinical-assessment-checklist");
  assert.equal(page.entityId, page.canonicalUrl);
  const byId = new Map(page.document["@graph"].map((node) => [node["@id"], node]));
  const physicianId = inputs.lifecycle.primaryEntity.id;
  const procedureId = inputs.lifecycle.canonicalUrl + "procedure-botulinum-toxin-aesthetic-treatment";
  const conceptId = inputs.lifecycle.canonicalUrl + "biomedical-concept-botulinum-toxin-a";
  const ownContent = byId.get(page.entityId);
  const route = byId.get(page.canonicalUrl + "#webpage");
  assert.deepEqual(ownContent.about, [{ "@id": procedureId }, { "@id": conceptId }]);
  assert.deepEqual(route.about, [{ "@id": physicianId }, ...ownContent.about]);
  assert.deepEqual(byId.get(procedureId).provider, { "@id": physicianId });
  assert(typed(byId.get(conceptId), "DefinedTerm"));
  assert(byId.has(inputs.lifecycle.canonicalUrl + "biomedical-concept-registry"));
  assert(byId.has(inputs.lifecycle.canonicalUrl + "biomedical-concept-cosmetic-techniques"));
  assert(!byId.has(inputs.lifecycle.canonicalUrl + "procedure-facial-and-lip-dermal-filler"));
  assert(!byId.has(inputs.lifecycle.canonicalUrl + "biomedical-concept-dermal-fillers"));
  assert.equal(byId.get(physicianId).mainEntityOfPage["@id"], inputs.lifecycle.canonicalUrl + "webpage");
  assert.equal(byId.get(physicianId).url, inputs.lifecycle.canonicalUrl);
});

test("a retained Question-primary topic keeps its own authored references instead of the broader containing section", () => {
  const page = pageFor("/botox-mechanism-indications-and-limitations");
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

test("the three language resources retain their full guide and render their target disclosure open", () => {
  for (const [suffix, language, direction] of [["en", "en", "ltr"], ["ar-iq", "ar-IQ", "rtl"],
      ["ckb-iq", "ckb-IQ", "rtl"]]) {
    const page = pageFor("/aesthetic-guide-" + suffix);
    const resource = URL_ARCHITECTURE.resources.find((resource) => resource.path === page.path);
    assert.equal(page.htmlId, resource.htmlId);
    assert.equal(page.lang, language);
    assert.equal(page.dir, direction);
    assert.equal(page.scopeKind, "complete-region");
    const body = inspectHtml(page.bodyHtml, { wrapMain: true });
    const disclosure = body.elements.find((node) => attr(node, "id") === resource.htmlId);
    assert.equal(disclosure.tagName, "details");
    assert(body.ids.includes("central-lip-lift-surgery-" + suffix));
    assert(body.ids.includes("frequently-asked-questions-dr-saeed-ghezelbash-" + suffix));
    assert(body.ids.includes("dr-saeed-ghezelbash-aesthetic-clinic-information-" + suffix));
    assert(body.ids.includes("answer-can-iraqi-patients-send-photos-before-travel-" + suffix));
    const questions = inputs.graph["@graph"].filter((node) => typed(node, "Question") &&
      new URL(node.url).pathname === page.path);
    const faq = byIdFor(page).get(page.canonicalUrl + "#questions");
    assert.deepEqual(faq.mainEntity, questions.map((question) => ({ "@id": question["@id"] })));
    const rendered = inspectHtml(renderIndependentPage(home, page));
    const visibleGuide = rendered.elements.find((node) => attr(node, "id") === resource.htmlId);
    assert.equal(visibleGuide.tagName, "details");
    assert.notEqual(attr(visibleGuide, "open"), undefined, "The canonical language guide must be readable on direct entry: " + page.path);
  }
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

test("a retained topic keeps its embedded question and authored video as distinct supporting parts", () => {
  const page = ownerFor("jalupro-vs-profhilo-selection");
  assert.equal(page.pageType, "MedicalWebPage");
  assert.deepEqual(page.entityTypes, ["WebPageElement"]);
  const byId = byIdFor(page);
  const route = byId.get(page.canonicalUrl + "#webpage");
  assert.equal(route["@type"], "MedicalWebPage");
  const authored = questionFor("jalupro-vs-profhilo-selection");
  const questionId = authored["@id"];
  const answerId = authored.acceptedAnswer["@id"];
  assert.equal(questionId, page.canonicalUrl + "#question-jalupro-vs-profhilo-selection");
  assert.equal(answerId, page.canonicalUrl + "#answer-jalupro-vs-profhilo-selection");
  assert.deepEqual(byId.get(questionId).acceptedAnswer, { "@id": answerId });
  assert.equal(byId.get(answerId)["@type"], "Answer");
  assert.equal(page.videos.length, 1);
  const player = pageFor("/video-saeed-ghezelbash-jalupro-vs-profhilo");
  const videoId = player.entityId;
  assert.equal(byId.get(videoId)["@type"], "VideoObject");
  assert.equal(byId.get(videoId).contentUrl, page.videos[0].contentUrl);
  assert.equal(route.mainEntity["@id"], page.entityId);
  assert.notEqual(page.entityId, videoId);
  const faq = byId.get(page.canonicalUrl + "#questions");
  assert(faq.mainEntity.some((ref) => ref["@id"] === questionId));
  assert.deepEqual(route.hasPart, [{ "@id": videoId }, { "@id": faq["@id"] }]);
  assert(player.entityTypes.includes("VideoObject"));
  assert.equal(player.entityId, videoId);
  const template = home.replace("</head>", '<meta property="og:type" content="article"></head>');
  assert(renderIndependentPage(template, page).includes('<meta property="og:type" content="article">'));
});

test("text headings keep their complete subject and authored topics while visible videos remain supporting parts", () => {
  const authoredById = new Map(inputs.graph["@graph"].map((node) => [node["@id"], node]));
  for (const path of ["/saeed-ghezelbash-research-education-and-clinical-decisions", "/subcision-for-tethered-acne-scars",
      new URL(urlForHtmlId("aesthetic-physician-ratings-patient-satisfaction-ckb-iq"), inputs.lifecycle.canonicalUrl).pathname]) {
    const page = pageFor(path);
    const byId = new Map(page.document["@graph"].map((node) => [node["@id"], node]));
    const route = byId.get(page.canonicalUrl + "#webpage");
    const authored = authoredById.get(page.canonicalUrl);
    assert.deepEqual(page.entityTypes, ["WebPageElement"]);
    assert.equal(page.entityId, authored?.["@id"] ?? page.canonicalUrl + "#content");
    assert.equal(page.entitySelection.basis, authored ? "authored-entity-id" : "synthesized-heading-scope");
    assert.equal(page.entitySelection.authoredSourceId, authored?.["@id"] ?? null);
    assert.deepEqual(page.entitySelection.authoredSourceTypes, authored?.["@type"] ? [authored["@type"]].flat() : []);
    assert.equal(page.videos.length, 1);
    const video = page.document["@graph"].find((node) => node["@type"] === "VideoObject" &&
      node.contentUrl === page.videos[0].contentUrl);
    assert(values(route.hasPart).some((ref) => ref["@id"] === video["@id"]));
    assert.notEqual(route.mainEntity["@id"], video["@id"]);
    assert(page.bodyHtml.includes(new URL(video.contentUrl).pathname));
    if (authored?.about) {
      assert.deepEqual(byId.get(page.entityId).citation, authored.citation);
      assert.deepEqual(page.topicSelection, { basis: "own-about", authoredSourceId: authored["@id"], references: authored.about });
      const topicIds = [...new Set([inputs.lifecycle.primaryEntity.id, ...authored.about.map((ref) => ref["@id"])])];
      assert.deepEqual(route.about, topicIds.map((id) => ({ "@id": id })));
    }
  }
  for (const page of pages.filter((page) => page.entityTypes.includes("VideoObject"))) {
    const target = inspectHtml(home).elements.find((node) => node.attrs?.some((attr) => attr.name === "id" && attr.value === page.htmlId));
    assert(["figure", "video"].includes(target.tagName));
    assert.equal(page.entitySelection.basis, "explicit-media-target");
    const route = page.document["@graph"].find((node) => node["@id"] === page.canonicalUrl + "#webpage");
    assert(!route.hasPart);
  }
});

test("classification inventory records the actual retained subject and authored topic source", () => {
  const question = pageFor("/botox-mechanism-indications-and-limitations");
  assert.deepEqual(question.entitySelection, { basis: "explicit-question-url", authoredSourceId: question.entityId,
    authoredSourceTypes: ["Question"] });
  assert.equal(question.topicSelection.basis, "own-about");
  assert.equal(question.topicSelection.authoredSourceId, question.entityId);
  const heading = ownerFor("botox-clinical-assessment-checklist");
  assert.deepEqual(heading.entitySelection, { basis: "authored-entity-id", authoredSourceId: heading.canonicalUrl,
    authoredSourceTypes: ["WebPageElement"] });
  assert.equal(heading.topicSelection.basis, "own-about");
  assert.equal(heading.topicSelection.authoredSourceId, heading.canonicalUrl);
  assert.deepEqual(heading.topicSelection.references, heading.document["@graph"].find((node) => node["@id"] === heading.entityId).about);
});

test("a retained topic lacking its own about references inherits the nearest authored DOM topic", () => {
  const original = ownerFor("botox-clinical-assessment-checklist");
  const graph = structuredClone(inputs.graph);
  delete graph["@graph"].find((node) => node["@id"] === original.entityId).about;
  const page = deriveIndependentPages(makeHome(graph), graph, inputs.lifecycle.canonicalUrl, options)
    .find((page) => page.path === original.path);
  assert.equal(page.topicSelection.basis, "nearest-authored-dom-about");
  assert.equal(page.topicSelection.authoredSourceId, inputs.lifecycle.canonicalUrl + "botox");
  assert.deepEqual(page.topicSelection.references, canonicalById.get(inputs.lifecycle.canonicalUrl + "botox").about);
});

test("media summaries describe their authored subject without browser fallback or chapter controls", () => {
  for (const resource of URL_ARCHITECTURE.resources.filter((resource) => resource.scope === "media")) {
    const page = pageFor(resource.path);
    const media = page.document["@graph"].find((node) => node["@id"] === page.entityId);
    assert.equal(page.description, media.description);
    assert(!page.description.includes("مرورگر"));
    assert(!page.description.includes("00:00"));
    assert(!page.description.includes("وێبگەڕەکەت"));
    assert(renderIndependentPage(home, page).includes('content="' + page.description + '"'));
  }
});

test("retained body headings start below the route H1 and keep their authored child hierarchy and IDs", () => {
  const page = ownerFor("forehead-botox-brow-compensation-and-ptosis-risk");
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
  assert.equal(original.tagName, "h3");
});

test("retained hubs keep their introduction and leaf answers while nested topics own their substantive text", () => {
  for (const [section, childPath] of [["botox", "/botox-pre-injection-clinical-assessment"],
      ["filler", "/filler-material-selection-and-tissue-behavior"], ["thread-lift", "/thread-lift-pre-treatment-assessment"]]) {
    const hub = pageFor("/" + section), child = pageFor(childPath);
    const content = inspectHtml(hub.bodyHtml, { wrapMain: true });
    assert(!pages.some((page) => page.path === "/" + section + "-heading"));
    assert.equal(urlForHtmlId(section + "-heading"), hub.path + "#" + section + "-heading");
    assert(content.ids.includes(section));
    assert(content.ids.includes(section + "-heading"));
    assert(hub.bodyHtml.includes("قاعده من:"));
    assert(!content.ids.includes(child.htmlId));
    assert(!bodyText(hub.bodyHtml).includes(child.description));
    assert(bodyText(child.bodyHtml).includes(child.description));
    assert(content.ids.includes(section + "-faq"));
    assert.notEqual(hub.bodyHtml, child.bodyHtml);
    assert(renderIndependentPage(home, hub).includes("data-guide-expand"));
  }
});

test("retained question summaries use their authored answer and hub summaries begin with medical prose", () => {
  const question = pageFor("/botox-mechanism-indications-and-limitations");
  const original = inputs.graph["@graph"].find((node) => node["@id"] === question.entityId);
  const answer = inputs.graph["@graph"].find((node) => node["@id"] === original.acceptedAnswer["@id"]);
  assert.equal(question.description, localizedText(answer.description || answer.text, question.lang));
  const overview = pageFor("/botox");
  assert(overview.description.startsWith("قاعده من:"));
  assert(!overview.description.startsWith(overview.title));
});


test("declared historical summary keeps its own geographic evidence distinct from travel guidance", () => {
  const withViews = deriveIndependentPages(home, inputs.graph, inputs.lifecycle.canonicalUrl,
    { focusedViews: discoveryPolicy.focusedViews });
  const summary = withViews.find((page) => page.path === "/historical-patient-origin-summary");
  const travel = withViews.find((page) => page.path === "/out-of-town-aesthetic-patients-iran");
  assert.equal(summary.scopeKind, "disclosure-summary");
  assert(summary.bodyHtml.includes("کرمانشاه و استان کرمانشاه"));
  assert(summary.bodyHtml.includes("عراق و اقلیم کردستان"));
  assert(!travel.bodyHtml.includes("کرمانشاه و استان کرمانشاه"),
    "The historical resource must own its detailed geographic evidence instead of repeating it in the travel article");
  assert(!travel.bodyHtml.includes("عراق و اقلیم کردستان"));
  assert(travel.bodyHtml.includes("نوع مراجعه"), "Travel planning must retain its distinct practical guidance");
  assert(home.includes("کرمانشاه و استان کرمانشاه"), "The comprehensive authored reader must keep the historical evidence");
  assert(!summary.bodyHtml.includes("نوع مراجعه"));
  assert.equal(summary.description, discoveryPolicy.focusedViews[0].description);
  assert.equal(summary.title, discoveryPolicy.focusedViews[0].title);
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
  const valid = discoveryPolicy.focusedViews[0];
  for (const patch of [{ path: "/missing" }, { sourceHeading: "unrelated" }, { mode: "random" }])
    assert.throws(() => deriveIndependentPages(home, inputs.graph, inputs.lifecycle.canonicalUrl,
      { focusedViews: [{ ...valid, ...patch }] }), /declared|Declared/);
});
