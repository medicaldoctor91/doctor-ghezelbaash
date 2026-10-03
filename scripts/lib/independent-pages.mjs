import { parseFragment, serialize } from "parse5";
import { inspectHtml } from "./html-contract.mjs";
import { contentRoutePaths } from "./content-routes.mjs";
import { browserContextFor, localizedText } from "../../src/lib/page-discovery-jsonld.mjs";
import { temporalValue } from "../../src/lib/graph-dates.mjs";
import { URL_ARCHITECTURE, urlForHtmlId } from "../../src/lib/url-architecture.mjs";
import { canonicalContentHtmlId } from "../../src/lib/graph-core.mjs";
import { discoveryPolicy } from "../../src/config/site-policy.mjs";
import { assertRichResultsDocument } from "../../src/lib/rich-results-contract.mjs";
import { projectFocusedMedia } from "./focused-media.mjs";
import { renderTopicNavigation } from "./topic-navigation.mjs";
import { createReaderScopeCompiler, stampGuideSource } from "./reader-scope.mjs";

const attr = (node, key) => node.attrs?.find((entry) => entry.name === key)?.value;
const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const typed = (node, type) => values(node?.["@type"]).includes(type);
const namedReferences = (value) => values(value).filter((entry) =>
  entry && typeof entry === "object" && typeof entry["@id"] === "string").map((entry) => ({ "@id": entry["@id"] }));
const uniqueReferences = (references) => [...new Map(references.map((entry) => [entry["@id"], entry])).values()];
const text = (node) => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join(" ");
const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const scriptJson = (document) => JSON.stringify(document).replaceAll("<", "\\u003c");
const stripData = (html) => html.replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "");
const excludedSummaryTags = new Set(["script", "style", "template", "button", "nav", "video", "noscript"]);
const summaryText = (node) => {
  if (node.nodeName === "#text") return node.value;
  if (excludedSummaryTags.has(node.tagName) || attr(node, "hidden") !== undefined ||
      attr(node, "aria-hidden") === "true" || (attr(node, "class") || "").split(/\s+/).includes("video-chapters")) return "";
  return (node.childNodes || []).map(summaryText).join(" ");
};
const normalizeFocusedHeadings = (fragment) => {
  const headings = [];
  const visit = (node) => {
    if (/^h[1-6]$/.test(node.tagName || "")) headings.push(node);
    for (const child of node.childNodes || []) visit(child);
  };
  visit(fragment);
  if (!headings.length) return fragment;
  const delta = 2 - Number(headings[0].tagName.slice(1));
  for (const heading of headings)
    heading.tagName = heading.nodeName = "h" + Math.max(2, Math.min(6, Number(heading.tagName.slice(1)) + delta));
  return fragment;
};
const scopedDescription = (parsed, entity, byId, authoredById, language, mediaTarget) => {
  const original = authoredById.get(entity["@id"]) ?? entity;
  let authored;
  if (mediaTarget && (typed(entity, "VideoObject") || typed(entity, "ImageObject")))
    authored = localizedText(original.description, language);
  else if (typed(entity, "Answer")) authored = localizedText(original.description ?? original.text, language);
  else if (typed(entity, "Question")) {
    const answerId = values(entity.acceptedAnswer)[0]?.["@id"];
    const answer = authoredById.get(answerId) ?? byId.get(answerId);
    if (answer) authored = localizedText(answer.description ?? answer.text, language);
  }
  if (typeof authored === "string" && normalize(authored)) return normalize(authored).slice(0, 300);
  if (typed(entity, "Person")) {
    const profile = localizedText(original.disambiguatingDescription ?? original.description, language);
    if (typeof profile === "string" && normalize(profile)) return normalize(profile).slice(0, 300);
  }
  const eligible = parsed.elements.filter((node) => ["p", "address", "figcaption", "li"].includes(node.tagName));
  const prose = eligible.map((node) => {
    for (let parent = node.parentNode; parent; parent = parent.parentNode)
      if (excludedSummaryTags.has(parent.tagName) || attr(parent, "hidden") !== undefined ||
          attr(parent, "aria-hidden") === "true" || (attr(parent, "class") || "").split(/\s+/).includes("video-chapters")) return "";
    return normalize(summaryText(node));
  }).find(Boolean);
  return (prose || normalize(summaryText(parsed.document))).slice(0, 300);
};
export const routeDocumentFile = (route) => {
  if (!/^\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(route)) throw new Error("Unsafe independent route: " + route);
  return route.slice(1) + ".html";
};

/** Every authored HTML destination gets a meaningful initial document. */
export function deriveIndependentPages(html, graph, canonicalUrl, {
  focusedViews = discoveryPolicy.focusedViews, resources = URL_ARCHITECTURE.resources.filter((entry) => entry.path !== "/"),
} = {}) {
  const inspected = inspectHtml(html);
  const compileReaderScope = createReaderScopeCompiler(inspected.guideArticles[0]);
  const byHtmlId = new Map(inspected.elements.filter((node) => attr(node, "id")).map((node) => [attr(node, "id"), node]));
  const scripts = inspected.elements.filter((node) => node.tagName === "script" && attr(node, "type") === "application/ld+json")
    .map((node) => ({ id: attr(node, "id"), document: JSON.parse(node.childNodes.map((child) => child.value || "").join("")) }));
  // The rendered home contains the route-aware browser discovery graph.
  const browser = scripts.flatMap((script) => script.document["@graph"]);
  const byId = new Map(browser.map((node) => [node["@id"], node]));
  const headings = inspected.headings.filter((node) => node.sourceCodeLocation);
  const homePage = browser.find((node) => node["@id"] === canonicalUrl + "webpage" &&
    typed(node, "MedicalWebPage"));
  if (!homePage) throw new Error("Independent routes require the canonical MedicalWebPage");
  const revision = temporalValue(graph["@graph"].find((node) => node["@id"] === homePage["@id"]).dateModified);
  const person = byId.get(homePage.mainEntity["@id"]);
  const authoredById = new Map(graph["@graph"].map((node) => [node["@id"], node]));
  const authoredPerson = authoredById.get(person["@id"]);
  const website = browser.find((node) => typed(node, "WebSite"));
  const origin = new URL(canonicalUrl).origin;
  const paths = resources.map((entry) => entry.path);
  const resourceByPath = new Map(resources.map((entry) => [entry.path, entry]));
  const pathSet = new Set(paths);
  const views = new Map();
  for (const view of focusedViews) {
    if (!pathSet.has(view.path) || views.has(view.path) || view.mode !== "first-disclosure" ||
        !view.sourceHeading || typeof view.title !== "string" || !view.title.trim() ||
        typeof view.description !== "string" || !view.description.trim())
      throw new Error("Invalid declared focused view: " + view.path);
    views.set(view.path, view);
  }
  return paths.map((route) => {
    const resource = resourceByPath.get(route);
    const htmlId = resource.htmlId, target = byHtmlId.get(htmlId), url = origin + route;
    if (!target?.sourceCodeLocation) throw new Error("Route lacks authored HTML target: " + route);
    let owner = target;
    const classes = (attr(target, "class") || "").split(/\s+/);
    const answerTarget = classes.includes("answer-projection") && normalize(text(target));
    const emptyAlias = classes.includes("semantic-alias-anchor") && !normalize(text(target));
    // Readable answer paragraphs own their scope. Empty aliases and controls
    // need a visible region rather than inheriting unrelated whole sections.
    if (!answerTarget && !/^h[1-6]$/.test(target.tagName) && !["section", "figure"].includes(target.tagName)) {
      for (let parent = target.parentNode; parent && parent.tagName !== "article"; parent = parent.parentNode) {
        if (["figure", "section", "header"].includes(parent.tagName)) { owner = parent; break; }
      }
    }
    const aliasHeading = emptyAlias ? headings.find((node) =>
      node.sourceCodeLocation.startOffset >= target.sourceCodeLocation.endOffset &&
      node.sourceCodeLocation.endOffset <= owner.sourceCodeLocation.endOffset) : undefined;
    const labelledHeading = String(attr(target, "aria-labelledby") || "").split(/\s+/)
      .map((id) => byHtmlId.get(id)).find((node) => /^h[1-6]$/.test(node?.tagName));
    const heading = /^h[1-6]$/.test(target.tagName) ? target
      : labelledHeading ?? aliasHeading ?? headings.find((node) => node.sourceCodeLocation.startOffset >= owner.sourceCodeLocation.startOffset &&
          node.sourceCodeLocation.endOffset <= owner.sourceCodeLocation.endOffset)
        ?? headings.filter((node) => node.sourceCodeLocation.startOffset <= target.sourceCodeLocation.startOffset).at(-1);
    let start = owner.sourceCodeLocation.startOffset, end = owner.sourceCodeLocation.endOffset, overviewEntry = false;
    const regionHeading = /^h[1-6]$/.test(target.tagName) ? target : aliasHeading;
    if (regionHeading) {
      if (aliasHeading) start = target.sourceCodeLocation.startOffset;
      const level = Number(regionHeading.tagName.slice(1));
      const next = headings.find((node) => node.sourceCodeLocation.startOffset > regionHeading.sourceCodeLocation.startOffset && Number(node.tagName.slice(1)) <= level);
      let container = regionHeading.parentNode;
      while (container && !["section", "header", "article"].includes(container.tagName)) container = container.parentNode;
      end = Math.min(next?.sourceCodeLocation.startOffset ?? html.length, container?.sourceCodeLocation?.endTag?.startOffset ?? html.length);
      // A named section's first heading is its overview entry. The section URL
      // retains the complete authored hierarchy; its heading URL presents the
      // introduction before the first subtopic in the same shared reader.
      if (target === regionHeading && container?.tagName === "section" &&
          pathSet.has("/" + attr(container, "id")) && attr(container, "id") !== htmlId) {
        const first = headings.find((node) => node.sourceCodeLocation.startOffset >= container.sourceCodeLocation.startOffset &&
          node.sourceCodeLocation.endOffset <= container.sourceCodeLocation.endOffset);
        const subtopic = headings.find((node) => node.sourceCodeLocation.startOffset > regionHeading.sourceCodeLocation.startOffset &&
          node.sourceCodeLocation.startOffset < end);
        if (first === regionHeading && subtopic &&
            Number(subtopic.tagName.slice(1)) > Number(regionHeading.tagName.slice(1))) {
          const introduction = parseFragment(stripData(html.slice(regionHeading.sourceCodeLocation.endOffset, subtopic.sourceCodeLocation.startOffset)));
          if (normalize(summaryText(introduction))) { end = subtopic.sourceCodeLocation.startOffset; overviewEntry = true; }
        }
      }
    }
    // Retained nested topics own their substantive text. Their parent keeps its
    // original introduction and remaining material, with native child links
    // added by topic navigation; the comprehensive reader still contains all text.
    const focusedView = views.get(route);
    const cuts = [];
    for (const child of resources) {
      if (focusedView) break;
      if (child.path === route || child.scope === "media") continue;
      const node = byHtmlId.get(child.htmlId), location = node?.sourceCodeLocation;
      if (!location || location.startOffset <= start || location.startOffset >= end) continue;
      let stop = location.endOffset;
      if (/^h[1-6]$/.test(node.tagName)) {
        const level = Number(node.tagName.slice(1));
        const next = headings.find((entry) => entry.sourceCodeLocation.startOffset > location.startOffset &&
          Number(entry.tagName.slice(1)) <= level);
        let container = node.parentNode;
        while (container && !["section", "header", "article"].includes(container.tagName)) container = container.parentNode;
        stop = Math.min(next?.sourceCodeLocation.startOffset ?? end,
          container?.sourceCodeLocation?.endTag?.startOffset ?? end);
      }
      if (stop <= end) cuts.push({ start: location.startOffset, end: stop });
    }
    const mergedCuts = [];
    for (const cut of cuts.sort((a, b) => a.start - b.start)) {
      const previous = mergedCuts.at(-1);
      if (previous && cut.start <= previous.end) previous.end = Math.max(previous.end, cut.end);
      else mergedCuts.push({ ...cut });
    }
    let intervalStart = start;
    let primaryIntervals = [];
    for (const cut of mergedCuts) {
      if (cut.start > intervalStart) primaryIntervals.push({ start: intervalStart, end: cut.start });
      intervalStart = cut.end;
    }
    if (intervalStart < end) primaryIntervals.push({ start: intervalStart, end });
    let scopedHtml = html.slice(start, end);
    for (const cut of mergedCuts.reverse()) scopedHtml = scopedHtml.slice(0, cut.start - start) + scopedHtml.slice(cut.end - start);
    let bodyHtml = serialize(normalizeFocusedHeadings(parseFragment(stripData(scopedHtml))));
    if (resource.scope === "language")
      bodyHtml = bodyHtml.replace(/^<details\b/, "<details open");
    if (focusedView) {
      const authored = authoredById.get(url);
      if (!emptyAlias || attr(aliasHeading, "id") !== focusedView.sourceHeading ||
          !typed(authored, "CreativeWork") || authored.temporalCoverage !== "historical")
        throw new Error("Declared disclosure view must match its authored historical work: " + route);
      const fragment = parseFragment(bodyHtml, { sourceCodeLocationInfo: true });
      let disclosure;
      const find = (node) => {
        if (!disclosure && node.tagName === "details") disclosure = node;
        for (const child of node.childNodes || []) find(child);
      };
      find(fragment);
      const location = disclosure?.sourceCodeLocation;
      if (!location || !normalize(summaryText(disclosure)))
        throw new Error("Declared historical view has no readable source disclosure: " + route);
      bodyHtml = html.slice(target.sourceCodeLocation.startOffset, target.sourceCodeLocation.endOffset) +
        bodyHtml.slice(location.startOffset, location.endOffset);
      const originalDisclosure = inspected.elements.find((node) => node.tagName === "details" &&
        node.sourceCodeLocation?.startOffset >= start && node.sourceCodeLocation.endOffset <= end);
      if (!originalDisclosure) throw new Error("Historical reader scope has no authored disclosure");
      primaryIntervals = [
        { start: target.sourceCodeLocation.startOffset, end: target.sourceCodeLocation.endOffset },
        { start: originalDisclosure.sourceCodeLocation.startOffset, end: originalDisclosure.sourceCodeLocation.endOffset },
      ];
    }
    if (!normalize(text(parseFragment(bodyHtml)))) throw new Error("Route has no readable content: " + route);
    // Fragment fallbacks now point to the comprehensive home target.
    bodyHtml = bodyHtml.replace(/(<a\b[^>]*\bhref=)"#([^"]+)"/g,
      (_, prefix, id) => prefix + '"' + escape(urlForHtmlId(id)) + '"');
    const parsed = inspectHtml(bodyHtml, { wrapMain: true });
    const visible = normalize(text(parseFragment(bodyHtml)));
    let language = "fa-IR", direction = "rtl";
    for (let parent = target; parent; parent = parent.parentNode) {
      if (attr(parent, "lang")) { language = attr(parent, "lang"); direction = attr(parent, "dir") || (language.startsWith("en") ? "ltr" : "rtl"); break; }
    }
    const browserize = (value, key) => {
      const localized = localizedText(value, language);
      if (localized !== value) return browserize(localized, key);
      if (Array.isArray(value)) return value.map((entry) => browserize(entry, key));
      if (!value || typeof value !== "object") return value;
      if (Object.hasOwn(value, "@value")) return value["@value"];
      if (["width", "height"].includes(key)) {
        const quantity = authoredById.get(value["@id"]) ?? byId.get(value["@id"]) ?? value;
        if (typed(quantity, "QuantitativeValue")) return quantity.value;
      }
      if (Object.keys(value).length === 1 && value["@id"] &&
          !authoredById.has(value["@id"]) && !byId.has(value["@id"]) &&
          ["image", "sameAs", "gender", "credentialCategory", "knowsAbout"].includes(key))
        return value["@id"];
      return Object.fromEntries(Object.entries(value).map(([property, entry]) => [property, browserize(entry, property)]));
    };
    const browserNode = (id) => byId.get(id) ?? (authoredById.has(id) ? browserize(authoredById.get(id)) : undefined);
    const contentUrls = new Set(parsed.videos.flatMap((video) => (video.childNodes || []).filter((child) => child.tagName === "source")
      .map((child) => new URL(attr(child, "src"), canonicalUrl).href)));
    const videoNodes = graph["@graph"].filter((node) => typed(node, "VideoObject") && contentUrls.has(node.contentUrl))
      .map((node) => browserNode(node["@id"])).filter(Boolean);
    const exact = browserNode(url);
    const mediaTarget = ["video", "figure"].includes(target.tagName);
    const questionSource = graph["@graph"].find((node) => node.url === url && typed(node, "Question"));
    const questionMatch = questionSource ? browserNode(questionSource["@id"]) : undefined;
    const videoSource = graph["@graph"].find((node) => node.url === url && typed(node, "VideoObject") && contentUrls.has(node.contentUrl));
    const videoMatch = mediaTarget ? (videoSource ? browserNode(videoSource["@id"]) : undefined)
      ?? (videoNodes.length === 1 ? videoNodes[0] : undefined) : undefined;
    // A question remains the primary authored subject when its answer embeds a video.
    // Explicit figures and players still describe that media as their main entity.
    const sourceMatch = mediaTarget ? videoMatch ?? questionMatch : questionMatch;
    const exactSubject = !mediaTarget && typed(exact, "VideoObject") ? undefined : exact;
    const mediaEntity = sourceMatch ?? exact;
    const mediaTitle = ["video", "figure"].includes(target.tagName) && (typed(mediaEntity, "VideoObject") || typed(mediaEntity, "ImageObject")) ? mediaEntity.name : "";
    const title = normalize(focusedView?.title || resource.title || mediaTitle || text(heading ?? target) || exact?.name || sourceMatch?.name);
    if (!title) throw new Error("Route lacks authored title: " + route);
    const physicianName = localizedText(authoredPerson.name, language);
    const overviewLabels = { fa: "مرور", en: "Overview:", ar: "نظرة عامة:", ckb: "پوختە:" };
    const contextTitle = overviewEntry ? (overviewLabels[language.split("-")[0]] || overviewLabels.fa) + " " + title : title;
    const documentTitle = contextTitle.includes(physicianName) ? contextTitle : contextTitle + " | " + physicianName;
    const synthesized = { "@id": url + "#content", "@type": "WebPageElement", url, name: title, text: visible, inLanguage: language };
    const entity = sourceMatch ?? exactSubject ?? synthesized;
    const authoredEntity = authoredById.get(entity["@id"]);
    const entitySelection = {
      basis: entity === questionMatch ? "explicit-question-url"
        : mediaTarget && typed(entity, "VideoObject") ? "explicit-media-target"
          : entity === exactSubject ? "authored-entity-id" : "synthesized-heading-scope",
      authoredSourceId: authoredEntity?.["@id"] ?? null,
      authoredSourceTypes: values(authoredEntity?.["@type"]),
    };
    const description = focusedView?.description || scopedDescription(parsed, entity, byId, authoredById, language, mediaTarget);
    // A fine-grained heading inherits its existing authored section's topic.
    // An entity's own topic remains authoritative when it is explicitly set.
    const ownAbout = namedReferences(entity.about);
    let inheritedAbout = [], inheritedAboutSource;
    if (!ownAbout.length) for (let parent = target.parentNode; parent; parent = parent.parentNode) {
      const id = attr(parent, "id");
      const authored = id ? (authoredById.get(origin + "/" + id) ?? byId.get(origin + "/" + id)) : undefined;
      const references = namedReferences(authored?.about);
      if (references.length) { inheritedAbout = references; inheritedAboutSource = authored; break; }
    }
    const topicalReferences = uniqueReferences(ownAbout.length ? ownAbout : inheritedAbout);
    const topicSelection = {
      basis: ownAbout.length ? "own-about" : inheritedAbout.length ? "nearest-authored-dom-about" : "none",
      authoredSourceId: ownAbout.length ? authoredEntity?.["@id"] ?? null : inheritedAboutSource?.["@id"] ?? null,
      references: topicalReferences,
    };
    if (entity === synthesized && topicalReferences.length) synthesized.about = topicalReferences;
    const pageType = typed(entity, "Person") ? "ProfilePage"
      : typed(entity, "VideoObject") ? "WebPage" : "MedicalWebPage";
    const questionWithAnswer = typed(entity, "Question") && values(entity.acceptedAnswer).length > 0;
    const pageNode = { "@id": url + "#webpage", "@type": questionWithAnswer ? [pageType, "FAQPage"] : pageType, url, name: contextTitle, description,
      inLanguage: language, isPartOf: [{ "@id": website["@id"] }, { "@id": homePage["@id"] }], author: { "@id": person["@id"] }, publisher: { "@id": person["@id"] },
      mainEntity: { "@id": entity["@id"] },
      about: uniqueReferences([{ "@id": person["@id"] }, ...topicalReferences]),
      dateModified: revision };
    if (!typed(entity, "VideoObject") && videoNodes.length)
      pageNode.hasPart = uniqueReferences(videoNodes.map((video) => ({ "@id": video["@id"] })));
    if (pageType === "ProfilePage") delete pageNode.dateModified;
        const breadcrumb = { "@id": url + "#breadcrumb", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "دکتر سعید قزلباش", item: canonicalUrl },
      { "@type": "ListItem", position: 2, name: title, item: url },
    ] };
    pageNode.breadcrumb = { "@id": breadcrumb["@id"] };
    const selected = new Map([[pageNode["@id"], pageNode], [breadcrumb["@id"], breadcrumb]]);
    const scopedQuestions = graph["@graph"].filter((node) => typed(node, "Question") &&
      parsed.ids.includes(canonicalContentHtmlId(node.url, canonicalUrl)) &&
      values(node.acceptedAnswer).every((ref) => parsed.ids.includes(canonicalContentHtmlId(ref["@id"], canonicalUrl))))
      .map((node) => browserNode(node["@id"])).filter(Boolean);
    const queue = [entity, person, website, ...videoNodes, ...scopedQuestions,
      ...topicalReferences.map((ref) => browserNode(ref["@id"]))];
    // Relevant outward relationships only: broad home hasPart/mentions would
    // accidentally turn every scoped page back into the complete graph.
    const relationKeys = ["acceptedAnswer", "suggestedAnswer", "creator", "publisher", "author", "address", "geo",
      "potentialAction", "contactPoint", "areaServed",
      "openingHoursSpecification", "provider", "image", "logo", "primaryImageOfPage", "hasCourseInstance", "location",
      "instructor", "organizer", "reviewRating", "itemReviewed", "about", "isBasedOn", "citation", "hasPart",
      "hasCredential", "memberOf", "worksFor", "affiliation", "alumniOf", "recognizedBy", "identifier", "hasOccupation", "medicalSpecialty",
      "dcterms:subject", "category", "inDefinedTermSet", "spatialCoverage", "containedInPlace"];
    while (queue.length) {
      const node = queue.shift();
      if (!node || selected.has(node["@id"])) continue;
      const output = structuredClone(node);
      if (output["@id"] !== person["@id"]) delete output.mainEntityOfPage;
      delete output.subjectOf; delete output.mentions;
      if (typed(output, "WebSite")) delete output.hasPart;
      if (typed(output, "WebPageElement")) { delete output.isPartOf; delete output.hasPart; }
      if (typed(output, "Person") && output["@id"] !== person["@id"]) { delete output.knowsAbout; delete output.hasCredential; delete output.memberOf; }
      if (!typed(output, "VideoObject") && !typed(output, "Question")) delete output.hasPart;
      if (typed(output, "WebPage") || typed(output, "ProfilePage") || typed(output, "MedicalWebPage")) continue;
      selected.set(output["@id"], output);
      for (const key of relationKeys) for (const ref of values(output[key])) {
        const id = typeof ref === "string" ? ref : ref?.["@id"];
        const related = browserNode(id);
        if (related) queue.push(related);
      }
    }
    if (pageType === "ProfilePage") {
      const authoredProfile = authoredById.get(pageNode["@id"]);
      const primaryImage = authoredProfile?.primaryImageOfPage;
      if (typed(authoredProfile, "ProfilePage") && typed(selected.get(primaryImage?.["@id"]), "ImageObject"))
        pageNode.primaryImageOfPage = structuredClone(primaryImage);
    }
    if (scopedQuestions.length > 1 || scopedQuestions.length === 1 && !questionWithAnswer) {
      const faqId = url + "#questions";
      selected.set(faqId, { "@id": faqId, "@type": "FAQPage", url,
        name: title, inLanguage: language, isPartOf: { "@id": pageNode["@id"] },
        mainEntity: scopedQuestions.map((node) => ({ "@id": node["@id"] })) });
      pageNode.hasPart = uniqueReferences([...values(pageNode.hasPart), { "@id": faqId }]);
    }
    const document = { "@context": browserContextFor(graph), "@graph": [...selected.values()] };
    assertRichResultsDocument(document, { primaryPageId: pageNode["@id"] });
    const imageUrls = [...new Set(parsed.elements.filter((node) => node.tagName === "img").map((node) => attr(node, "src"))
      .filter(Boolean).map((value) => new URL(value, canonicalUrl).href).filter((value) => value.startsWith(origin + "/")))];
    return { path: route, file: routeDocumentFile(route), canonicalUrl: url, title, contextTitle, scopeKind: focusedView ? "disclosure-summary" : overviewEntry ? "overview" : "complete-region", documentTitle, description, htmlId,
      lang: language, dir: direction, entityId: entity["@id"], entityTypes: values(entity["@type"]), entitySelection, topicSelection, pageType, bodyHtml, document,
      readerScope: compileReaderScope(primaryIntervals),
      lastmod: revision, imageUrls, videos: videoNodes.map((video) => ({ thumbnailUrl: values(video.thumbnailUrl)[0],
        contentUrl: video.contentUrl, title: video.name, description: video.description,
        publicationDate: temporalValue(video.uploadDate), duration: video.duration })) };
  });
}

/** Keep a focused route context visible after loading the shared guide. */
let homeTemplate;
export function renderIndependentPage(homeHtml, record, { declaredSocialLocales = [] } = {}) {
  if (homeTemplate?.input !== homeHtml) {
    const stamped = stampGuideSource(homeHtml);
    homeTemplate = { input: homeHtml, source: stamped, parsed: inspectHtml(stamped) };
  }
  homeHtml = homeTemplate.source;
  const parsed = homeTemplate.parsed;
  const article = parsed.guideArticles[0], location = article.sourceCodeLocation;
  const copies = {
    fa: ["نمایش راهنمای کامل", "صفحهٔ اصلی دکتر سعید قزلباش", "در حال بارگذاری راهنمای کامل…", "بارگذاری انجام نشد؛ دوباره تلاش کنید."],
    en: ["Show the complete guide", "Dr. Saeed Ghezelbash homepage", "Loading the complete guide…", "The guide could not load. Please try again."],
    ar: ["عرض الدليل الكامل", "الصفحة الرئيسية للدكتور سعيد قزلباش", "جارٍ تحميل الدليل الكامل…", "تعذّر التحميل. حاول مرة أخرى."],
    ckb: ["پیشاندانی ڕێبەری تەواو", "پەڕەی سەرەکی دکتۆر سەعید قزڵباش", "ڕێبەری تەواو بار دەکرێت…", "بارکردن سەرکەوتوو نەبوو؛ دووبارە هەوڵ بدەوە."],
  };
  const copy = copies[record.lang.split("-")[0]] || copies.fa;
  const declaredLocales = [...declaredSocialLocales, ...parsed.elements.filter((node) => node.tagName === "meta" &&
    ["og:locale", "og:locale:alternate"].includes(attr(node, "property"))).map((node) => attr(node, "content"))]
    .filter((locale) => typeof locale === "string" && /^[a-z]{2}_[A-Z]{2}$/.test(locale));
  const socialLocaleForLanguage = (language) => {
    const socialLanguage = language.replace(/^ckb(?=-|$)/, "ku");
    const regionalLocale = socialLanguage.replace("-", "_");
    return /^[a-z]{2}_[A-Z]{2}$/.test(regionalLocale) ? regionalLocale
      : declaredLocales.find((locale) => locale?.startsWith(socialLanguage.split("-")[0] + "_"));
  };
  const socialLocale = socialLocaleForLanguage(record.lang);
  let html = homeHtml.slice(0, location.startTag.endOffset) +
    '<header id="route-context" data-route-context lang="' + escape(record.lang) + '" dir="' + escape(record.dir) +
    '"><h1 id="route-page-title">' + escape(record.contextTitle || record.title) + '</h1><p>' + escape(record.description) +
    '</p><p><a href="/" data-guide-expand aria-controls="main-content" data-loading="' + escape(copy[2]) + '" data-error="' +
    escape(copy[3]) + '">' + escape(copy[0]) + '</a> · <a href="/">' + escape(copy[1]) +
    '</a></p><p data-guide-expand-status role="status" aria-live="polite"></p>' +
    (record.navigation ? renderTopicNavigation(record) : '') + '</header>' +
    record.bodyHtml + homeHtml.slice(location.endTag.startOffset);
  html = html.replace(/<article\b([^>]*)>/i, (_, attrs) => "<article" +
    attrs.replace(/\s(?:lang|dir|aria-labelledby)=["\'][^"\']*["\']/gi, "") +
    ' aria-labelledby="route-page-title" lang="' + escape(record.lang) + '" dir="' + escape(record.dir) + '">');
  html = stripData(html).replace("<html ", '<html data-route-view="focused" ');
  html = html.replace(/<html\b([^>]*)>/i, (_, attrs) => "<html" + attrs.replace(/\s(?:lang|dir)=["\'][^"\']*["\']/gi, "") + ' lang="' + escape(record.lang) + '" dir="' + record.dir + '">');
  html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + escape(record.documentTitle) + "</title>");
  html = html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '<link rel="canonical" href="' + escape(record.canonicalUrl) + '">');
  html = html.replace(/<meta\b[^>]*name=["']description["'][^>]*>/gi, '<meta name="description" content="' + escape(record.description) + '">');
  html = html.replace(/<meta\b([^>]*)>/gi, (whole, attrs) => {
    const key = /(?:name|property)=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (key === "og:locale" && !socialLocale) return "";
    if (key === "og:locale:alternate") return "";
    const changed = { "og:title": record.documentTitle, "twitter:title": record.documentTitle, "og:description": record.description,
      "twitter:description": record.description, "og:url": record.canonicalUrl, "twitter:url": record.canonicalUrl,
      "og:type": record.pageType === "ProfilePage" ? "profile" : "article", "og:locale": socialLocale };
    if (key in changed) return '<meta ' + (key.startsWith("og:") ? "property" : "name") + '="' + key + '" content="' + escape(changed[key]) + '">';
    if (key?.startsWith("profile:") && record.pageType !== "ProfilePage") return "";
    return whole;
  });
  const declaredAlternates = values(record.alternates);
  const locales = new Set();
  const alternateLinks = declaredAlternates.map(({ href, hrefLang }) => {
    if (typeof hrefLang !== "string" || !/^(?:[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*|x-default)$/.test(hrefLang) ||
        locales.has(hrefLang.toLowerCase()) || typeof href !== "string" || !URL.canParse(href) ||
        new URL(href).origin !== new URL(record.canonicalUrl).origin || new URL(href).hash)
      throw new Error("Invalid authored language alternate for " + record.path);
    locales.add(hrefLang.toLowerCase());
    return '<link rel="alternate" hreflang="' + escape(hrefLang) + '" href="' + escape(href) + '">';
  }).join("");
  const socialAlternateMetas = [...new Set(declaredAlternates.map(({ hrefLang }) => socialLocaleForLanguage(hrefLang))
    .filter((locale) => locale && locale !== socialLocale))]
    .map((locale) => '<meta property="og:locale:alternate" content="' + escape(locale) + '">').join("");
  html = html.replace(/<link\b[^>]*\bhreflang=["\'][^"\']*["\'][^>]*>/gi, "");
  return projectFocusedMedia(html.replace("</head>", alternateLinks + socialAlternateMetas +
    '<script id="guide-reader-scope" type="application/json">' + scriptJson(record.readerScope) + '</script>' +
    '<script id="schema-core-mainentity" type="application/ld+json">' +
    scriptJson(record.document) + "</script></head>"), record.canonicalUrl);
}
