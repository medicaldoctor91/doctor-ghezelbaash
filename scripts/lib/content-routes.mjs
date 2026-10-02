import { inspectHtml } from "./html-contract.mjs";

/** Finite authored content destinations, served as independently described documents. */
export function contentRoutePaths(html, canonicalUrl) {
  const { elements, ids } = inspectHtml(html);
  const idSet = new Set(ids);
  const origin = new URL(canonicalUrl).origin;
  const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
  const paths = new Set(elements.filter((node) =>
    /^h[1-6]$/.test(node.tagName) || String(attr(node, "class") || "").split(/\s+/)
      .includes("semantic-alias-anchor"))
    .map((node) => attr(node, "id")).filter((id) => id && !id.startsWith("answer-")).map((id) => `/${id}`));
  for (const node of elements.filter((node) => node.tagName === "a" && attr(node, "href"))) {
    const url = new URL(attr(node, "href"), canonicalUrl);
    // Pages matches the path, while video/chapter parameters remain available to
    // the browser. These authored links need the same finite document alias.
    if (url.origin === origin && !url.hash && idSet.has(url.pathname.slice(1)) &&
        !url.pathname.slice(1).startsWith("answer-"))
      paths.add(url.pathname);
  }
  for (const route of paths)
    if (!/^\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(route)) throw new Error(`Unsupported authored content route: ${route}`);
  return [...paths].sort();
}
