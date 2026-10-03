import { createHash } from "node:crypto";
import { parse } from "parse5";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const attribute = (node, name) => node.attrs?.find((entry) => entry.name === name)?.value;
const elements = (source) => {
  const output = [];
  const visit = (node) => {
    if (node.tagName) output.push(node);
    for (const child of node.childNodes || []) visit(child);
    if (node.content) visit(node.content);
  };
  visit(parse(source, { sourceCodeLocationInfo: true }));
  return output;
};

/** Move only the emitted 404 styles; CSS bytes and authored document content stay intact. */
export function externalizeNotFoundCss(html) {
  const source = String(html);
  const styles = elements(source).filter((node) => node.tagName === "style");
  if (!styles.length) throw new Error("404 CSS extraction requires emitted inline styles");
  const bodies = styles.map((node) => {
    const location = node.sourceCodeLocation;
    if (node.parentNode?.tagName !== "head" || !location?.startTag || !location.endTag ||
        node.attrs.some((entry) => entry.name !== "type" || entry.value.toLowerCase() !== "text/css"))
      throw new Error("404 CSS extraction requires unconditional head styles with explicit tags");
    const body = source.slice(location.startTag.endOffset, location.endTag.startOffset);
    // Concatenating independent sheets must not relocate imports, encodings or
    // document-relative resources. Existing emitted CSS uses absolute asset paths.
    if (/@(?:import|charset)\b/i.test(body)) throw new Error("404 CSS extraction cannot concatenate imports or encodings");
    for (const match of body.matchAll(/url\(\s*(["']?)([^)]*?)\1\s*\)/gi)) {
      const url = match[2].trim();
      if (!url.startsWith("/") && !/^[a-z][a-z0-9+.-]*:/i.test(url))
        throw new Error("404 CSS extraction cannot relocate a relative URL: " + url);
    }
    return body;
  });
  const css = bodies.join("\n"), sha256 = hash(css);
  const assetPath = "assets/not-found." + sha256.slice(0, 12) + ".css";
  let output = source;
  const replacements = styles.map((node, index) => ({
    start: node.sourceCodeLocation.startOffset,
    end: node.sourceCodeLocation.endOffset,
    text: index === 0 ? '<link rel="stylesheet" href="/' + assetPath + '" data-not-found-stylesheet>' : "",
  }));
  for (const { start, end, text } of replacements.reverse())
    output = output.slice(0, start) + text + output.slice(end);
  return {
    html: output, css, assetPath,
    measurement: { inlineStyles: bodies.length, inlineStyleSha256: bodies.map(hash), cssSha256: sha256, cssBytes: Buffer.byteLength(css) },
  };
}

/** Verify the external sheet is the only 404 style delivery and matches its fingerprint. */
export function notFoundStylesheetPath(html) {
  const nodes = elements(String(html));
  if (nodes.some((node) => node.tagName === "style"))
    throw new Error("404 must not depend on inline style hashes");
  const links = nodes.filter((node) => attribute(node, "data-not-found-stylesheet") !== undefined);
  if (links.length !== 1 || links[0].tagName !== "link" || attribute(links[0], "rel") !== "stylesheet" ||
      links[0].parentNode?.tagName !== "head" ||
      !/^\/assets\/not-found\.[0-9a-f]{12}\.css$/.test(attribute(links[0], "href") || ""))
    throw new Error("404 requires one fingerprinted same-origin head stylesheet");
  return attribute(links[0], "href").slice(1);
}

export function assertNotFoundStylesheet(html, css) {
  const assetPath = notFoundStylesheetPath(html);
  if (assetPath !== "assets/not-found." + hash(css).slice(0, 12) + ".css")
    throw new Error("404 stylesheet fingerprint does not match its bytes");
  return assetPath;
}
