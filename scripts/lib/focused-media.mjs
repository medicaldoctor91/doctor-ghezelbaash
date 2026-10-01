import { parse } from "parse5";

const attr = (node, name) => node.attrs?.find((entry) => entry.name === name)?.value;
const hasClass = (node, name) => (attr(node, "class") || "").split(/\s+/).includes(name);
const tokens = (value) => String(value || "").toLowerCase().split(/\s+/);
const escapeAttribute = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");

const visit = (node, callback) => {
  callback(node);
  for (const child of node.childNodes || []) visit(child, callback);
  if (node.content) visit(node.content, callback);
};
const sourceSetUrls = (value) => String(value || "").split(",")
  .map((candidate) => candidate.trim().split(/\s+/)[0]).filter(Boolean);
const resourceUrl = (value, canonicalUrl) => {
  if (!value) return undefined;
  try { return new URL(value, canonicalUrl).href; }
  catch { return undefined; }
};

/**
 * Focused documents keep media discovery tied to their visible initial article.
 * Apply edits to original source spans so authored text, data scripts, styles,
 * and executable CSP hashes remain byte-for-byte unchanged.
 */
export function projectFocusedMedia(html, canonicalUrl) {
  const source = String(html);
  const document = parse(source, { sourceCodeLocationInfo: true });
  let documentElement;
  const articles = [], imagePreloads = [];
  visit(document, (node) => {
    if (node.tagName === "html") documentElement = node;
    if (node.tagName === "article" && hasClass(node, "medical-guide")) articles.push(node);
    if (node.tagName === "link" && tokens(attr(node, "rel")).includes("preload") &&
        attr(node, "as")?.toLowerCase() === "image") imagePreloads.push(node);
  });
  // The comprehensive home retains its existing eager portrait and lazy videos.
  if (attr(documentElement, "data-route-view") !== "focused") return source;
  if (articles.length !== 1) throw new Error("Focused media requires one medical guide article");
  const origin = new URL(canonicalUrl).origin;
  const visibleResources = new Set(), replacements = [];
  const addResource = (value) => {
    const url = resourceUrl(value, canonicalUrl);
    if (url) visibleResources.add(url);
  };
  visit(articles[0], (node) => {
    if (node.tagName === "img") {
      addResource(attr(node, "src"));
      for (const value of sourceSetUrls(attr(node, "srcset"))) addResource(value);
    }
    if (node.tagName === "source" && node.parentNode?.tagName === "picture")
      for (const value of sourceSetUrls(attr(node, "srcset"))) addResource(value);
    if (node.tagName !== "video") return;
    addResource(attr(node, "poster"));
    const deferredPoster = attr(node, "data-poster");
    const posterUrl = resourceUrl(deferredPoster, canonicalUrl);
    // Promote only the already authored, same-origin image. Do not add outside
    // requests or replace a native poster selected by the author.
    if (!posterUrl || new URL(posterUrl).origin !== origin) return;
    addResource(deferredPoster);
    if (attr(node, "poster") !== undefined) return;
    const location = node.sourceCodeLocation?.startTag;
    if (!location) throw new Error("Focused video requires an authored start tag");
    const startTag = source.slice(location.startOffset, location.endOffset);
    replacements.push({
      start: location.startOffset, end: location.endOffset,
      text: startTag.replace(/(\s*\/?>)$/, ' poster="' + escapeAttribute(deferredPoster) + '"$1'),
    });
  });
  for (const preload of imagePreloads) {
    const candidates = [attr(preload, "href"), ...sourceSetUrls(attr(preload, "imagesrcset"))]
      .map((value) => resourceUrl(value, canonicalUrl)).filter(Boolean);
    if (candidates.some((value) => visibleResources.has(value))) continue;
    const location = preload.sourceCodeLocation;
    if (!location) throw new Error("Focused image preload requires an authored tag");
    replacements.push({ start: location.startOffset, end: location.endOffset, text: "" });
  }
  let output = source;
  for (const replacement of replacements.sort((a, b) => b.start - a.start))
    output = output.slice(0, replacement.start) + replacement.text + output.slice(replacement.end);
  return output;
}
