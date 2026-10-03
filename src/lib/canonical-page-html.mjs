import { parseFragment } from "parse5";
import { projectPageJsonLd } from "./page-discovery-jsonld.mjs";
import { resolveContentUrl, urlForHtmlId } from "./url-architecture.mjs";

const attr = (node, name) => node.attrs?.find((attribute) => attribute.name === name)?.value;
const escapeAttribute = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");

export function renderCanonicalPageHtml(body, graph) {
  const source = String(body);
  const document = parseFragment(source, { sourceCodeLocationInfo: true });
  if (document.childNodes.some((node) => node.nodeName === "#text" && node.value.trim()))
    throw new Error("Canonical page body must be authored HTML");

  const discovery = projectPageJsonLd(graph);
  const replacements = [];
  const rendered = new Set();
  const visit = (node) => {
    if (/^h[1-6]$/.test(node.tagName || "") && attr(node, "id") && node.sourceCodeLocation?.startTag) {
      const href = urlForHtmlId(attr(node, "id"));
      replacements.push({
        start: node.sourceCodeLocation.startTag.endOffset - 1,
        end: node.sourceCodeLocation.startTag.endOffset - 1,
        text: ' data-canonical-href="' + escapeAttribute(href) + '"',
      });
    }

    if (node.tagName === "a" && attr(node, "href")) {
      const authoredHref = attr(node, "href");
      const canonicalHref = resolveContentUrl(authoredHref);
      if (canonicalHref !== authoredHref) {
        const location = node.sourceCodeLocation?.attrs?.href;
        if (!location) throw new Error("Canonical content link lacks a source location");
        replacements.push({
          start: location.startOffset,
          end: location.endOffset,
          text: 'href="' + escapeAttribute(canonicalHref) + '"',
        });
      }
    }

    if (attr(node, "data-guide-search-open") !== undefined &&
        (node.tagName !== "a" ||
         resolveContentUrl(attr(node, "href")) !== urlForHtmlId("aesthetic-medicine-table-of-contents")))
      throw new Error("Canonical guide launcher must be authored as its native guide link");

    if (attr(node, "itemprop") === "creator" &&
        (node.tagName !== "span" || attr(node, "itemscope") === undefined ||
         attr(node, "itemtype") !== "https://schema.org/Person"))
      throw new Error("Canonical image creator must be authored as a typed Person");

    if (node.tagName === "script") {
      if (attr(node, "type") !== "application/ld+json")
        throw new Error("Canonical page supports JSON-LD data scripts only");
      const location = node.sourceCodeLocation;
      if (!location?.startTag || !location.endTag)
        throw new Error("Canonical JSON-LD script must have explicit HTML tags");
      const projected = discovery.find((entry) => entry.id === attr(node, "id"));
      if (!projected)
        throw new Error("Unknown canonical JSON-LD placeholder: " + attr(node, "id"));
      rendered.add(projected.id);
      replacements.push({
        start: location.startTag.endOffset,
        end: location.endTag.startOffset,
        text: JSON.stringify(projected.document).replaceAll("<", "\\u003c"),
      });
    }

    for (const child of node.childNodes || []) visit(child);
    if (node.content) visit(node.content);
  };

  visit(document);
  if (rendered.size !== discovery.length)
    throw new Error("Canonical JSON-LD placeholder is missing");

  let output = source;
  for (const { start, end, text } of replacements.sort((a, b) => b.start - a.start))
    output = output.slice(0, start) + text + output.slice(end);
  return output;
}
