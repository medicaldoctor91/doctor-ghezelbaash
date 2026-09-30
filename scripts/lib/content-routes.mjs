import { inspectHtml } from "./html-contract.mjs";

/** Finite aliases of the one authored document; never a catchall route. */
export function contentRoutePaths(html, canonicalUrl) {
  const { elements, ids } = inspectHtml(html);
  const idSet = new Set(ids);
  const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
  const paths = new Set(elements.filter((node) =>
    /^h[1-6]$/.test(node.tagName) || String(attr(node, "class") || "").split(/\s+/).includes("answer-projection"))
    .map((node) => attr(node, "id")).filter(Boolean).map((id) => `/${id}`));
  for (const node of elements.filter((node) => node.tagName === "a" && attr(node, "href"))) {
    const url = new URL(attr(node, "href"), canonicalUrl);
    if (url.origin === new URL(canonicalUrl).origin && !url.hash && !url.search && idSet.has(url.pathname.slice(1)))
      paths.add(url.pathname);
  }
  for (const route of paths)
    if (!/^\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(route)) throw new Error(`Unsupported authored content route: ${route}`);
  return [...paths].sort();
}
