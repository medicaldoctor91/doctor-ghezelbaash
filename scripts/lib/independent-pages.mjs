import { parseFragment, serialize } from "parse5";
import { inspectHtml } from "./html-contract.mjs";
import { contentRoutePaths } from "./content-routes.mjs";
import { projectPageJsonLd, browserContext, localizedText } from "../../src/lib/page-discovery-jsonld.mjs";
import { assertRichResultsDocument } from "../../src/lib/rich-results-contract.mjs";

const attr = (node, key) => node.attrs?.find((entry) => entry.name === key)?.value;
const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const typed = (node, type) => values(node?.["@type"]).includes(type);
const text = (node) => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join(" ");
const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const scriptJson = (document) => JSON.stringify(document).replaceAll("<", "\\u003c");
const stripData = (html) => html.replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "");
export const routeDocumentFile = (route) => {
  if (!/^\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(route)) throw new Error("Unsafe independent route: " + route);
  return route.slice(1) + ".html";
};

/** Every authored HTML destination gets a meaningful initial document. */
export function deriveIndependentPages(html, graph, canonicalUrl) {
  const inspected = inspectHtml(html);
  const byHtmlId = new Map(inspected.elements.filter((node) => attr(node, "id")).map((node) => [attr(node, "id"), node]));
  const scripts = inspected.elements.filter((node) => node.tagName === "script" && attr(node, "type") === "application/ld+json")
    .map((node) => ({ id: attr(node, "id"), document: JSON.parse(node.childNodes.map((child) => child.value || "").join("")) }));
  // The rendered home already contains the browser-formatted complete graph.
  const browser = scripts.flatMap((script) => script.document["@graph"]);
  const byId = new Map(browser.map((node) => [node["@id"], node]));
  const headings = inspected.headings.filter((node) => node.sourceCodeLocation);
  const homePage = browser.find((node) => node.url === canonicalUrl && typed(node, "ProfilePage"));
  const revision = graph["@graph"].find((node) => node["@id"] === homePage["@id"]).dateModified;
  const person = byId.get(homePage.mainEntity["@id"]);
  const authoredPerson = graph["@graph"].find((node) => node["@id"] === person["@id"]);
  const website = browser.find((node) => typed(node, "WebSite"));
  const origin = new URL(canonicalUrl).origin;
  const paths = contentRoutePaths(html, canonicalUrl);
  const pathSet = new Set(paths);
  return paths.map((route) => {
    const htmlId = route.slice(1), target = byHtmlId.get(htmlId), url = origin + route;
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
    const heading = /^h[1-6]$/.test(target.tagName) ? target
      : aliasHeading ?? headings.find((node) => node.sourceCodeLocation.startOffset >= owner.sourceCodeLocation.startOffset &&
          node.sourceCodeLocation.endOffset <= owner.sourceCodeLocation.endOffset)
        ?? headings.filter((node) => node.sourceCodeLocation.startOffset <= target.sourceCodeLocation.startOffset).at(-1);
    let start = owner.sourceCodeLocation.startOffset, end = owner.sourceCodeLocation.endOffset;
    const regionHeading = /^h[1-6]$/.test(target.tagName) ? target : aliasHeading;
    if (regionHeading) {
      if (aliasHeading) start = target.sourceCodeLocation.startOffset;
      const level = Number(regionHeading.tagName.slice(1));
      const next = headings.find((node) => node.sourceCodeLocation.startOffset > regionHeading.sourceCodeLocation.startOffset && Number(node.tagName.slice(1)) <= level);
      let container = regionHeading.parentNode;
      while (container && !["section", "header", "article"].includes(container.tagName)) container = container.parentNode;
      end = Math.min(next?.sourceCodeLocation.startOffset ?? html.length, container?.sourceCodeLocation?.endTag?.startOffset ?? html.length);
    }
    let bodyHtml = serialize(parseFragment(stripData(html.slice(start, end)))).replace(/<h1\b/g, "<h2").replaceAll("</h1>", "</h2>");
    if (!normalize(text(parseFragment(bodyHtml)))) throw new Error("Route has no readable content: " + route);
    // Fragment fallbacks now point to the comprehensive home target.
    bodyHtml = bodyHtml.replace(/(<a\b[^>]*\bhref=)"#([^"]+)"/g, (_, prefix, id) => prefix + '"' + (pathSet.has("/" + id) ? "/" : "/#") + escape(id) + '"');
    const parsed = inspectHtml(bodyHtml, { wrapMain: true });
    const visible = normalize(text(parseFragment(bodyHtml)));
    const contentUrls = new Set(parsed.videos.flatMap((video) => (video.childNodes || []).filter((child) => child.tagName === "source")
      .map((child) => new URL(attr(child, "src"), canonicalUrl).href)));
    const videoNodes = browser.filter((node) => typed(node, "VideoObject") && contentUrls.has(node.contentUrl));
    const exact = byId.get(url);
    const sourceMatch = browser.find((node) => node.url === url && typed(node, "VideoObject") && contentUrls.has(node.contentUrl))
      ?? (["video", "figure"].includes(target.tagName) && videoNodes.length === 1 ? videoNodes[0] : undefined)
      ?? browser.find((node) => node.url === url && typed(node, "Question"));
        let language = "fa-IR", direction = "rtl";
    for (let parent = target; parent; parent = parent.parentNode) {
      if (attr(parent, "lang")) { language = attr(parent, "lang"); direction = attr(parent, "dir") || (language.startsWith("en") ? "ltr" : "rtl"); break; }
    }
    const mediaEntity = sourceMatch ?? exact;
    const mediaTitle = ["video", "figure"].includes(target.tagName) && (typed(mediaEntity, "VideoObject") || typed(mediaEntity, "ImageObject")) ? mediaEntity.name : "";
    const title = normalize(mediaTitle || text(heading ?? target) || exact?.name || sourceMatch?.name);
    if (!title) throw new Error("Route lacks authored title: " + route);
    const physicianName = localizedText(authoredPerson.name, language);
    const documentTitle = title.includes(physicianName) ? title : title + " | " + physicianName;
    const description = visible.slice(0, 300);
    const synthesized = { "@id": url + "#content", "@type": "WebPageElement", url, name: title, text: visible, inLanguage: language };
    const entity = sourceMatch ?? exact ?? synthesized;
    const pageType = typed(entity, "Person") ? "ProfilePage"
      : typed(entity, "Question") ? "FAQPage" : typed(entity, "VideoObject") ? "WebPage" : "MedicalWebPage";
    const pageNode = { "@id": url + "#webpage", "@type": pageType, url, name: title, description,
      inLanguage: language, isPartOf: [{ "@id": website["@id"] }, { "@id": homePage["@id"] }], author: { "@id": person["@id"] }, publisher: { "@id": person["@id"] },
      mainEntity: typed(entity, "Question") ? [{ "@id": entity["@id"] }] : { "@id": entity["@id"] },
      dateModified: revision };
    if (pageType === "ProfilePage") delete pageNode.dateModified;
        const breadcrumb = { "@id": url + "#breadcrumb", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "دکتر سعید قزلباش", item: canonicalUrl },
      { "@type": "ListItem", position: 2, name: title, item: url },
    ] };
    pageNode.breadcrumb = { "@id": breadcrumb["@id"] };
    const selected = new Map([[pageNode["@id"], pageNode], [breadcrumb["@id"], breadcrumb]]);
    const queue = [entity, person, website, ...videoNodes];
    // Relevant outward relationships only: broad home hasPart/mentions would
    // accidentally turn every scoped page back into the complete graph.
    const relationKeys = ["acceptedAnswer", "suggestedAnswer", "creator", "publisher", "author", "address", "geo",
      "openingHoursSpecification", "provider", "image", "logo", "primaryImageOfPage", "hasCourseInstance", "location",
      "instructor", "organizer", "reviewRating", "itemReviewed", "about", "isBasedOn", "citation", "hasPart",
      "hasCredential", "memberOf", "worksFor", "affiliation", "alumniOf", "recognizedBy", "identifier", "hasOccupation", "medicalSpecialty"];
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
        if (ref && typeof ref === "object" && byId.has(ref["@id"])) queue.push(byId.get(ref["@id"]));
      }
    }
    const document = { "@context": browserContext, "@graph": [...selected.values()] };
    assertRichResultsDocument(document, { primaryPageId: pageNode["@id"] });
    const imageUrls = [...new Set(parsed.elements.filter((node) => node.tagName === "img").map((node) => attr(node, "src"))
      .filter(Boolean).map((value) => new URL(value, canonicalUrl).href).filter((value) => value.startsWith(origin + "/")))];
    return { path: route, file: routeDocumentFile(route), canonicalUrl: url, title, documentTitle, description, htmlId,
      lang: language, dir: direction, entityId: entity["@id"], entityTypes: values(entity["@type"]), pageType, bodyHtml, document,
      lastmod: revision, imageUrls, videos: videoNodes.map((video) => ({ thumbnailUrl: values(video.thumbnailUrl)[0],
        contentUrl: video.contentUrl, title: video.name, description: video.description,
        publicationDate: video.uploadDate, duration: video.duration })) };
  });
}

/** Keep a focused route context visible after loading the shared guide. */
let homeTemplate;
export function renderIndependentPage(homeHtml, record) {
  if (homeTemplate?.source !== homeHtml) homeTemplate = { source: homeHtml, parsed: inspectHtml(homeHtml) };
  const parsed = homeTemplate.parsed;
  const article = parsed.guideArticles[0], location = article.sourceCodeLocation;
  const copies = {
    fa: ["نمایش راهنمای کامل", "صفحهٔ اصلی دکتر سعید قزلباش", "در حال بارگذاری راهنمای کامل…", "بارگذاری انجام نشد؛ دوباره تلاش کنید."],
    en: ["Show the complete guide", "Dr. Saeed Ghezelbash homepage", "Loading the complete guide…", "The guide could not load. Please try again."],
    ar: ["عرض الدليل الكامل", "الصفحة الرئيسية للدكتور سعيد قزلباش", "جارٍ تحميل الدليل الكامل…", "تعذّر التحميل. حاول مرة أخرى."],
    ckb: ["پیشاندانی ڕێبەری تەواو", "پەڕەی سەرەکی دکتۆر سەعید قزڵباش", "ڕێبەری تەواو بار دەکرێت…", "بارکردن سەرکەوتوو نەبوو؛ دووبارە هەوڵ بدەوە."],
  };
  const copy = copies[record.lang.split("-")[0]] || copies.fa;
  const declaredLocales = parsed.elements.filter((node) => node.tagName === "meta" &&
    ["og:locale", "og:locale:alternate"].includes(attr(node, "property"))).map((node) => attr(node, "content"));
  const regionalLocale = record.lang.replace("-", "_");
  const socialLocale = /^[a-z]{2,3}_[A-Z]{2}$/.test(regionalLocale) ? regionalLocale
    : declaredLocales.find((locale) => locale?.startsWith(record.lang.split("-")[0] + "_"));
  let html = homeHtml.slice(0, location.startTag.endOffset) +
    '<header id="route-context" data-route-context><h1 id="route-page-title">' + escape(record.title) + '</h1><p>' + escape(record.description) +
    '</p><p><a href="/" data-guide-expand aria-controls="main-content" data-loading="' + escape(copy[2]) + '" data-error="' +
    escape(copy[3]) + '">' + escape(copy[0]) + '</a> · <a href="/">' + escape(copy[1]) +
    '</a></p><p data-guide-expand-status role="status" aria-live="polite"></p></header>' +
    record.bodyHtml + homeHtml.slice(location.endTag.startOffset);
  html = html.replace(/(<article\b[^>]*\baria-labelledby=)["\'][^"\']*["\']/i, '$1"route-page-title"');
  html = stripData(html).replace("<html ", '<html data-route-view="focused" ');
  html = html.replace(/<html\b([^>]*)>/i, (_, attrs) => "<html" + attrs.replace(/\s(?:lang|dir)=["\'][^"\']*["\']/gi, "") + ' lang="' + escape(record.lang) + '" dir="' + record.dir + '">');
  html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + escape(record.documentTitle) + "</title>");
  html = html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '<link rel="canonical" href="' + escape(record.canonicalUrl) + '">');
  html = html.replace(/<meta\b[^>]*name=["']description["'][^>]*>/gi, '<meta name="description" content="' + escape(record.description) + '">');
  html = html.replace(/<meta\b([^>]*)>/gi, (whole, attrs) => {
    const key = /(?:name|property)=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (key === "og:locale" && !socialLocale) return "";
    if (key === "og:locale:alternate" && /content=["\']([^"\']+)["\']/i.exec(attrs)?.[1] === socialLocale) return "";
    const changed = { "og:title": record.documentTitle, "twitter:title": record.documentTitle, "og:description": record.description,
      "twitter:description": record.description, "og:url": record.canonicalUrl, "twitter:url": record.canonicalUrl,
      "og:type": record.pageType === "ProfilePage" ? "profile" : "article", "og:locale": socialLocale };
    if (key in changed) return '<meta ' + (key.startsWith("og:") ? "property" : "name") + '="' + key + '" content="' + escape(changed[key]) + '">';
    if (key?.startsWith("profile:") && record.pageType !== "ProfilePage") return "";
    return whole;
  });
  return html.replace("</head>", '<script id="schema-core-mainentity" type="application/ld+json">' +
    scriptJson(record.document) + "</script></head>");
}
