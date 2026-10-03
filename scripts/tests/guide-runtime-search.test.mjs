import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createGuideSearch } from "../../src/lib/guide-search.mjs";
import { pageBody, canonicalLifecycle } from "../../src/lib/canonical-inputs.mjs";
import { intentTargets, guideSearch } from "../../src/config/site-policy.mjs";
import { inspectHtml } from "../lib/html-contract.mjs";

const source = "const createGuideSearch = (" + createGuideSearch.toString() + ");\n" +
  readFileSync(new URL("../../src/scripts/guide-runtime.js", import.meta.url), "utf8");
const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const text = (node) => node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(text).join("");
const headings = inspectHtml(pageBody, { wrapMain: true }).elements
  .filter((node) => /^h[1-6]$/.test(node.tagName) && attr(node, "id"))
  .map((node) => ({ id: attr(node, "id"), textContent: text(node), tagName: node.tagName.toUpperCase(),
    dataset: { retrievalAlias: attr(node, "data-retrieval-alias") ?? "" } }));
const intentHeadings = Object.fromEntries(Object.entries(intentTargets)
  .map(([intent, url]) => [intent, new URL(url).pathname.slice(1)]));
function searchFor(query, routeTitle) {
  const indexedHeadings = routeTitle ? [{ id: "route-page-title", textContent: routeTitle, tagName: "H1", dataset: {}, closest: () => ({}) }, ...headings] : headings;
  const listeners = new Map();
  const element = (tagName) => ({
    tagName, children: [], dataset: {},
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    addEventListener() {},
  });
  const search = element("search"), input = element("input"), results = element("ol"), status = element("p");
  search.dataset = {
    intentTargets: JSON.stringify(intentTargets),
    intentHeadings: JSON.stringify(intentHeadings),
    copy: JSON.stringify(guideSearch),
    canonicalOrigin: new URL(canonicalLifecycle.canonicalUrl).origin,
  };
  input.value = "";
  input.addEventListener = (event, callback) => listeners.set(event, callback);
  const nodes = { "guide-search": search, "guide-search-input": input, "guide-search-results": results, "guide-search-status": status };
  const launcher = { replaceWith() {} };
  const document = {
    documentElement: { classList: { add() {} } },
    getElementById: (id) => nodes[id] ?? null,
    querySelector: (selector) => selector === "[data-guide-search-open]" ? launcher : null,
    querySelectorAll: (selector) => selector.startsWith("main h1") ? indexedHeadings : [],
    createElement: element, addEventListener() {},
  };
  runInNewContext(source, {
    document, window: {}, navigator: { userAgent: "" }, Intl, Date, URL,
    location: { pathname: "/", search: "", hash: "", href: canonicalLifecycle.canonicalUrl, origin: new URL(canonicalLifecycle.canonicalUrl).origin },
    performance: { getEntriesByType: () => [] },
    addEventListener() {}, requestAnimationFrame: () => 1, setTimeout: () => 1,
    clearTimeout() {}, setInterval() {}, scrollTo() {}, scrollY: 0, innerHeight: 800,
  });
  input.value = query;
  listeners.get("input")();
  return results.children.map((item) => item.children[0]?.href).filter(Boolean);
}
const queries = {
  botox: "بهترین دکتر بوتاکس کرمانشاه",
  filler: "بهترین دکتر فیلر کرمانشاه",
  "aesthetic-physician": "انتخاب دکتر زیبایی کرمانشاه",
  "migraine-botox": "بوتاکس میگرن",
  revision: "اصلاح نتیجه نامطلوب",
  "second-opinion": "نظر دوم پزشکی",
  "complex-correction": "اورفیل صورت پر شده",
};
for (const [intent, query] of Object.entries(queries)) {
  test("runtime ranks the authored " + intent + " destination first", () => {
    assert.equal(searchFor(query)[0], new URL(intentTargets[intent]).pathname);
  });
  test("runtime preserves " + intent + " for Arabic letters and vocalization", () => {
    const variant = query.replaceAll("ک", "ك").replaceAll("ی", "ي").replace("بوتاكس", "بُوتَاكِس");
    assert.equal(searchFor(variant)[0], new URL(intentTargets[intent]).pathname);
  });
}

test("focused route context titles never become nonexistent search destinations", () => {
  const results = searchFor("بوتاکس", "بوتاکس");
  assert(results.length > 0);
  assert(!results.includes("/route-page-title"));
});
