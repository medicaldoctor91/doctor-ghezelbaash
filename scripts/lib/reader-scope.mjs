import { createHash } from "node:crypto";
import { serialize } from "parse5";
import { inspectHtml } from "./html-contract.mjs";

const attr = (node, name) => node.attrs?.find((entry) => entry.name === name)?.value;
export const guideSourceSignature = (article) => {
  if (!article?.sourceCodeLocation?.startTag || !article.sourceCodeLocation.endTag)
    throw new Error("Reader source requires an explicitly closed article");
  return createHash("sha256").update(serialize(article)).digest("hex");
};

/** Stamp the exact compiled reader source, without publishing another content copy. */
export function stampGuideSource(html) {
  const inspected = inspectHtml(html), article = inspected.guideArticles[0];
  const signature = guideSourceSignature(article);
  const markers = inspected.elements.filter((node) => node.tagName === "meta" && attr(node, "name") === "guide-source-signature");
  if (markers.length > 1 || markers.length === 1 && attr(markers[0], "content") !== signature)
    throw new Error("Conflicting compiled guide source signature");
  if (markers.length) return html;
  if (!html.includes("</head>")) throw new Error("Reader source requires a document head");
  return html.replace("</head>", '<meta name="guide-source-signature" content="' + signature + '"></head>');
}

/**
 * Compile source intervals to native DOM Range boundaries. Offsets identify
 * authored tag/text boundaries, never guessed words or user-visible content.
 * Child-node paths include whitespace, comments and inert JSON-LD scripts.
 */
export function createReaderScopeCompiler(article) {
  const signature = guideSourceSignature(article);
  const positions = new Map();
  const remember = (offset, path, index) => {
    if (Number.isInteger(offset) && !positions.has(offset)) positions.set(offset, { path: [...path], offset: index });
  };
  const visit = (node, path) => {
    const location = node.sourceCodeLocation;
    if (path.length && location) {
      const parent = path.slice(0, -1), index = path.at(-1);
      remember(location.startOffset, parent, index);
      remember(location.endOffset, parent, index + 1);
    }
    if (location?.startTag) remember(location.startTag.endOffset, path, 0);
    if (location?.endTag) remember(location.endTag.startOffset, path, (node.childNodes || []).length);
    for (const [index, child] of (node.childNodes || []).entries()) visit(child, [...path, index]);
  };
  visit(article, []);
  const lower = article.sourceCodeLocation.startTag.endOffset;
  const upper = article.sourceCodeLocation.endTag.startOffset;
  return (intervals) => {
    if (!Array.isArray(intervals) || !intervals.length)
      throw new Error("Reader primary content needs owned source intervals");
    let previousEnd = lower;
    const ranges = intervals.map(({ start, end }) => {
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < previousEnd || end <= start || start < lower || end > upper)
        throw new Error("Invalid or overlapping reader primary source interval");
      previousEnd = end;
      const point = (offset) => {
        const result = positions.get(offset);
        if (!result) throw new Error("Reader interval is not an authored DOM boundary: " + offset);
        return structuredClone(result);
      };
      return { start: point(start), end: point(end) };
    });
    return { schemaVersion: 1, sourceSignature: signature, ranges, insertion: structuredClone(ranges[0].start) };
  };
}

export const compileReaderScope = (article, intervals) => createReaderScopeCompiler(article)(intervals);
