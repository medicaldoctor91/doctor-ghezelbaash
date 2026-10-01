import { parseFragment } from "parse5";

const attr = (node, name) =>
  node.attrs?.find((attribute) => attribute.name === name)?.value;
const escapeAttribute = (value) => String(value)
  .replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const replaceSpans = (source, replacements) => {
  let output = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start))
    output = output.slice(0, replacement.start) + replacement.text + output.slice(replacement.end);
  return output;
};

/**
 * The finite canonical page body is already HTML. Keep its medical markup and
 * text intact; derive a native guide link and compact JSON-LD data scripts at
 * their parsed source spans.
 * Escaping '<' prevents JSON strings from entering HTML script escape states or
 * terminating a data script. It leaves the decoded JSON-LD values unchanged.
 */
export function renderCanonicalPageHtml(body) {
  const source = String(body);
  const document = parseFragment(source, { sourceCodeLocationInfo: true });
  const replacements = [];
  const visit = (node) => {
    // The enhanced search replaces this link after initialization. Until then,
    // it is a useful native table-of-contents link, including without JavaScript.
    if (node.tagName === "button" && attr(node, "data-guide-search-open") !== undefined) {
      const location = node.sourceCodeLocation;
      if (!location?.startTag || !location.endTag)
        throw new Error("Canonical guide launcher requires explicit HTML tags");
      const start = location.startTag.endOffset;
      const children = (node.childNodes || []).filter((child) => child.tagName);
      const label = children.find((child) => child.tagName === "span");
      const shortcut = children.find((child) => child.tagName === "kbd");
      if (!label?.sourceCodeLocation?.startTag || !label.sourceCodeLocation.endTag)
        throw new Error("Canonical guide launcher requires its visible label");
      const innerReplacements = [{
        start: label.sourceCodeLocation.startTag.endOffset - start,
        end: label.sourceCodeLocation.endTag.startOffset - start,
        text: "فهرست راهنما",
      }];
      if (shortcut?.sourceCodeLocation)
        innerReplacements.push({
          start: shortcut.sourceCodeLocation.startOffset - start,
          end: shortcut.sourceCodeLocation.endOffset - start,
          text: "",
        });
      const attributes = node.attrs.filter(({ name }) =>
        !["type", "aria-controls", "aria-haspopup", "aria-keyshortcuts", "aria-label"].includes(name));
      attributes.push({ name: "href", value: "#aesthetic-medicine-table-of-contents" });
      attributes.push({ name: "aria-label", value: "فهرست راهنمای جامع" });
      const inner = replaceSpans(source.slice(start, location.endTag.startOffset), innerReplacements);
      replacements.push({
        start: location.startOffset,
        end: location.endOffset,
        text: `<a ${attributes.map(({ name, value }) => `${name}="${escapeAttribute(value)}"`).join(" ")}>${inner}</a>`,
      });
    }
    if (node.tagName === "script") {
      if (attr(node, "type") !== "application/ld+json")
        throw new Error("Canonical page supports JSON-LD data scripts only");
      const location = node.sourceCodeLocation;
      if (!location?.startTag || !location.endTag)
        throw new Error("Canonical JSON-LD script must have explicit HTML tags");
      const text = source.slice(location.startTag.endOffset, location.endTag.startOffset);
      const compact = JSON.stringify(JSON.parse(text)).replaceAll("<", "\\u003c");
      replacements.push({
        start: location.startTag.endOffset,
        end: location.endTag.startOffset,
        text: compact,
      });
    }
    for (const child of node.childNodes || []) visit(child);
    if (node.content) visit(node.content);
  };
  // An authored Markdown block would become visible literal text on this direct
  // HTML path. The fixed release contract requires HTML at the document root.
  if (document.childNodes.some((node) => node.nodeName === "#text" && node.value.trim()))
    throw new Error("Canonical page body must be authored HTML");
  visit(document);
  return replaceSpans(source, replacements);
}
