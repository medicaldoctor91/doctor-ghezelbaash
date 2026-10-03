import assert from "node:assert/strict";

/** Identify a delivery alias by pathname, including only registered namespaces. */
export function deliveryRuleFor(pathname, rows) {
  return rows.find((row) => row.source === pathname) ?? rows.find((row) =>
    row.source.endsWith("/*") && pathname.startsWith(row.source.slice(0, -1)));
}

/** A redirect or rewrite must resolve straight to its final representation. */
export function assertSingleHopDelivery(rows, canonicalUrl) {
  for (const row of rows) {
    const target = new URL(row.target, canonicalUrl);
    assert.equal(target.origin, new URL(canonicalUrl).origin, "Delivery target escaped canonical origin");
    assert(!deliveryRuleFor(target.pathname, rows),
      `Delivery chain must resolve directly: ${row.source} -> ${row.target}`);
  }
}

/** Native links must already name final browser URLs; entity IRIs are checked separately. */
export function assertFinalNativeUrl(value, pageUrl, { rows, canonicalOrigin, resolveContentUrl, localUiFragment = false }) {
  const url = new URL(value, pageUrl);
  if (url.origin !== canonicalOrigin) return url;
  assert(!deliveryRuleFor(url.pathname, rows), `Native link must use its final URL: ${value}`);
  const readerRootFragment = url.pathname === "/" && Boolean(url.hash);
  if (!localUiFragment && !readerRootFragment) assert.equal(resolveContentUrl(url.href, { absolute: true }), url.href,
    `Native link must use its canonical content owner: ${value}`);
  return url;
}

/** Validate fragments against the actual initial target document, including focused pages. */
export function assertPublishedFragment(url, targetIds, label = url.href) {
  if (!url.hash) return;
  let id;
  try { id = decodeURIComponent(url.hash.slice(1)); }
  catch { assert.fail(`Invalid URL fragment encoding: ${label}`); }
  assert(targetIds?.has(id), `Missing fragment in actual target document: ${label}`);
}

/** No retired or accidental HTML documents may compete with the finite corpus. */
export function assertPhysicalHtmlSurface(files, paths) {
  const expected = ["404.html", ...paths.map((route) => route === "/" ? "index.html" : route.slice(1) + ".html")].sort();
  assert.deepEqual([...files].sort(), expected, "Physical HTML surface differs from the finite canonical corpus");
}
