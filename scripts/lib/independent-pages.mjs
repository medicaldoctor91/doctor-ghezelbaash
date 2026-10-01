import { parseFragment, serialize } from "parse5";
import { inspectHtml } from "./html-contract.mjs";
import { contentRoutePaths } from "./content-routes.mjs";
import { projectPageJsonLd, browserContext } from "../../src/lib/page-discovery-jsonld.mjs";
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
  const website = browser.find((node) => typed(node, "WebSite"));
  const origin = new URL(canonicalUrl).origin;
  const paths = contentRoutePaths(html, canonicalUrl);
  return paths.map((route) => {
    const htmlId = route.slice(1), target = byHtmlId.get(htmlId), url = origin + route;
    if (!target?.sourceCodeLocation) throw new Error("Route lacks authored HTML target: " + route);
    let owner = target;
    // Empty aliases and media/control destinations inherit their visible region.
    if (!/^h[1-6]$/.test(target.tagName) && !["section", "figure"].includes(target.tagName)) {
      for (let parent = target.parentNode; parent && parent.tagName !== "article"; parent = parent.parentNode) {
        if (["figure", "section", "header"].includes(parent.tagName)) { owner = parent; break; }
      }
    }
    const heading = /^h[1-6]$/.test(target.tagName) ? target
      : headings.find((node) => node.sourceCodeLocation.startOffset >= owner.sourceCodeLocation.startOffset &&
          node.sourceCodeLocation.endOffset <= owner.sourceCodeLocation.endOffset)
        ?? headings.filter((node) => node.sourceCodeLocation.startOffset <= target.sourceCodeLocation.startOffset).at(-1);
    let start = owner.sourceCodeLocation.startOffset, end = owner.sourceCodeLocation.endOffset;
    if (/^h[1-6]$/.test(target.tagName)) {
      const level = Number(target.tagName.slice(1));
      const next = headings.find((node) => node.sourceCodeLocation.startOffset > start && Number(node.tagName.slice(1)) <= level);
      let container = target.parentNode;
      while (container && !["section", "header", "article"].includes(container.tagName)) container = container.parentNode;
      end = Math.min(next?.sourceCodeLocation.startOffset ?? html.length, container?.sourceCodeLocation?.endTag?.startOffset ?? html.length);
    }
    let bodyHtml = serialize(parseFragment(stripData(html.slice(start, end)))).replace(/<h1\b/g, "<h2").replaceAll("</h1>", "</h2>");
    if (!normalize(text(parseFragment(bodyHtml)))) throw new Error("Route has no readable content: " + route);
    // Fragment fallbacks now point to the comprehensive home target.
    bodyHtml = bodyHtml.replace(/href="#([^"]+)"/g, (_, id) => 'href="/' + escape(id) + '"');
    const parsed = inspectHtml(bodyHtml, { wrapMain: true });
    const visible = normalize(text(parseFragment(bodyHtml)));
    const contentUrls = new Set(parsed.videos.flatMap((video) => (video.childNodes || []).filter((child) => child.tagName === "source")
      .map((child) => new URL(attr(child, "src"), canonicalUrl).href)));
    const videoNodes = browser.filter((node) => typed(node, "VideoObject") && contentUrls.has(node.contentUrl));
    const exact = byId.get(url);
    const sourceMatch = browser.find((node) => node.url === url && typed(node, "Question"))
      ?? browser.find((node) => node.url === url && typed(node, "VideoObject"));
        let language = "fa-IR", direction = "rtl";
    for (let parent = target; parent; parent = parent.parentNode) {
      if (attr(parent, "lang")) { language = attr(parent, "lang"); direction = attr(parent, "dir") || (language.startsWith("en") ? "ltr" : "rtl"); break; }
    }
    const title = normalize(exact?.name || sourceMatch?.name || text(heading ?? target));
    if (!title) throw new Error("Route lacks authored title: " + route);
    const description = visible.slice(0, 300);
    const synthesized = { "@id": url + "#content", "@type": "WebPageElement", url, name: title, text: visible, inLanguage: language };
    const entity = sourceMatch ?? exact ?? synthesized;
    const pageType = typed(entity, "Person") ? "ProfilePage"
      : typed(entity, "Question") ? "FAQPage" : typed(entity, "VideoObject") ? "WebPage" : "MedicalWebPage";
    const pageNode = { "@id": url + "#webpage", "@type": pageType, url, name: title, description,
      inLanguage: language, isPartOf: { "@id": website["@id"] }, author: { "@id": person["@id"] },
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
      "instructor", "organizer", "reviewRating", "itemReviewed", "about", "isBasedOn", "citation", "hasPart"];
    while (queue.length) {
      const node = queue.shift();
      if (!node || selected.has(node["@id"])) continue;
      const output = structuredClone(node);
      delete output.mainEntityOfPage; delete output.subjectOf; delete output.mentions;
      if (typed(output, "WebSite")) delete output.hasPart;
      if (typed(output, "WebPageElement")) { delete output.isPartOf; delete output.hasPart; }
      if (typed(output, "Person")) { delete output.knowsAbout; delete output.hasCredential; delete output.memberOf; }
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
    return { path: route, file: routeDocumentFile(route), canonicalUrl: url, title, description, htmlId,
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
  let html = homeHtml.slice(0, location.startTag.endOffset) +
    '<header id="route-context" data-route-context><h1 id="route-page-title">' + escape(record.title) + '</h1><p>' + escape(record.description) +
    '</p><p><a href="/">راهنمای کامل دکتر سعید قزلباش</a></p></header>' +
    record.bodyHtml + homeHtml.slice(location.endTag.startOffset);
  html = html.replace(/(<article\b[^>]*\baria-labelledby=)["\'][^"\']*["\']/i, '$1"route-page-title"');
  html = stripData(html).replace("<html ", '<html data-route-view="focused" ');
  html = html.replace(/<html\b([^>]*)>/i, (_, attrs) => "<html" + attrs.replace(/\s(?:lang|dir)=["\'][^"\']*["\']/gi, "") + ' lang="' + escape(record.lang) + '" dir="' + record.dir + '">');
  html = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + escape(record.title) + "</title>");
  html = html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '<link rel="canonical" href="' + escape(record.canonicalUrl) + '">');
  html = html.replace(/<meta\b[^>]*name=["']description["'][^>]*>/gi, '<meta name="description" content="' + escape(record.description) + '">');
  html = html.replace(/<meta\b([^>]*)>/gi, (whole, attrs) => {
    const key = /(?:name|property)=["']([^"']+)["']/i.exec(attrs)?.[1];
    const changed = { "og:title": record.title, "twitter:title": record.title, "og:description": record.description,
      "twitter:description": record.description, "og:url": record.canonicalUrl, "twitter:url": record.canonicalUrl,
      "og:type": record.pageType === "ProfilePage" ? "profile" : "article", "og:locale": record.lang.replace("-", "_") };
    if (key in changed) return '<meta ' + (key.startsWith("og:") ? "property" : "name") + '="' + key + '" content="' + escape(changed[key]) + '">';
    if (key?.startsWith("profile:") && record.pageType !== "ProfilePage") return "";
    return whole;
  });
  return html.replace("</head>", '<script id="schema-core-mainentity" type="application/ld+json">' +
    scriptJson(record.document) + "</script></head>");
}
