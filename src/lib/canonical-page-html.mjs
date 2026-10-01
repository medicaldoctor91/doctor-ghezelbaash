import { parseFragment } from "parse5";
import { projectPageJsonLd } from "./page-discovery-jsonld.mjs";

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
 * text intact; derive a native guide link and browser JSON-LD discovery at
 * their parsed source spans.
 * Escaping '<' prevents JSON strings from entering HTML script escape states or
 * terminating a data script. The full authored graph remains in graph.jsonld.
 */
export function renderCanonicalPageHtml(body) {
  const source = String(body);
  const document = parseFragment(source, { sourceCodeLocationInfo: true });
  const replacements = [];
  const scripts = [];
  const collectScripts = (node) => {
    if (node.tagName === "script" && attr(node, "type") === "application/ld+json")
      scripts.push({ id: attr(node, "id"), document: JSON.parse(
        source.slice(node.sourceCodeLocation.startTag.endOffset, node.sourceCodeLocation.endTag.startOffset)) });
    for (const child of node.childNodes || []) collectScripts(child);
  };
  collectScripts(document);
  const discovery = projectPageJsonLd(scripts);
  const people = scripts.flatMap((script) => script.document["@graph"]);
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
    if (node.tagName === "link" && attr(node, "itemprop") === "creator") {
      const id = attr(node, "href");
      const person = people.find((entry) => entry["@id"] === id &&
        [entry["@type"]].flat().includes("Person"));
      if (!person) throw new Error("Image creator must resolve to an authored Person");
      const names = [person.name].flat();
      const name = names.find((entry) => entry?.["@language"] === "fa")?.["@value"]
        ?? names.find((entry) => entry?.["@value"])?.["@value"] ?? names[0];
      if (typeof name !== "string") throw new Error("Image creator name missing");
      replacements.push({
        start: node.sourceCodeLocation.startOffset,
        end: node.sourceCodeLocation.endOffset,
        text: '<span itemprop="creator" itemscope itemtype="https://schema.org/Person" itemid="' +
          escapeAttribute(id) + '"><meta itemprop="name" content="' + escapeAttribute(name) +
          '"><link itemprop="url" href="' + escapeAttribute(id) + '"></span>',
      });
    }
    if (node.tagName === "script") {
      if (attr(node, "type") !== "application/ld+json")
        throw new Error("Canonical page supports JSON-LD data scripts only");
      const location = node.sourceCodeLocation;
      if (!location?.startTag || !location.endTag)
        throw new Error("Canonical JSON-LD script must have explicit HTML tags");
      const projected = discovery.find((script) => script.id === attr(node, "id"));
      if (!projected) {
        replacements.push({ start: location.startOffset, end: location.endOffset, text: "" });
        return;
      }
      const compact = JSON.stringify(projected.document).replaceAll("<", "\\u003c");
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
