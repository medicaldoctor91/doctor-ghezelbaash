import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createGuideSearch } from "../../src/lib/guide-search.mjs";
import { pageBody, canonicalLifecycle } from "../../src/lib/canonical-inputs.mjs";
import { intentTargets, guideSearch } from "../../src/config/site-policy.mjs";
import { urlForHtmlId } from "../../src/lib/url-architecture.mjs";
import { inspectHtml } from "../lib/html-contract.mjs";

const source = "const createGuideSearch = (" + createGuideSearch.toString() + ");\n" +
  readFileSync(new URL("../../src/scripts/guide-runtime.js", import.meta.url), "utf8");
const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const text = (node) => node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(text).join("");
const headings = inspectHtml(pageBody, { wrapMain: true }).elements
  .filter((node) => /^h[1-6]$/.test(node.tagName) && attr(node, "id"))
  .map((node) => ({ id: attr(node, "id"), textContent: text(node), tagName: node.tagName.toUpperCase(),
    dataset: { retrievalAlias: attr(node, "data-retrieval-alias") ?? "", canonicalHref: urlForHtmlId(attr(node, "id")) } }));
const destination = (value) => { const url = new URL(value, canonicalLifecycle.canonicalUrl); return url.pathname + url.hash; };
const targetIds = (targets) => Object.fromEntries(Object.entries(targets)
  .map(([intent, value]) => { const url = new URL(value, canonicalLifecycle.canonicalUrl); return [intent, url.hash ? decodeURIComponent(url.hash.slice(1)) : url.pathname.slice(1)]; }));
function searchFor(query, routeTitle, { targets = intentTargets, sourceHeadings = headings, supplementalHeadings = [], updatedHeadings, capture, extraTargets = {}, prepositioned = false } = {}) {
  let indexedHeadings = routeTitle ? [{ id: "route-page-title", textContent: routeTitle, tagName: "H1", dataset: {}, closest: () => ({}) }, ...sourceHeadings] : sourceHeadings;
  const listeners = new Map(), documentListeners = new Map();
  const element = (tagName) => ({
    tagName, children: [], dataset: {},
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    addEventListener() {},
  });
  const search = element("search"), input = element("input"), results = element("ol"), status = element("p");
  if (prepositioned) search.closest = (selector) => selector === "[data-guide-reader]" ? {} : null;
  search.dataset = {
    intentTargets: JSON.stringify(targets),
    intentHeadings: JSON.stringify(targetIds(targets)),
    copy: JSON.stringify(guideSearch),
    canonicalOrigin: new URL(canonicalLifecycle.canonicalUrl).origin,
  };
  input.value = "";
  input.addEventListener = (event, callback) => listeners.set(event, callback);
  const nodes = { "guide-search": search, "guide-search-input": input, "guide-search-results": results, "guide-search-status": status, ...extraTargets };
  const launcher = { replaceWith() {}, remove() {} };
  const document = {
    documentElement: { classList: { add() {} } },
    getElementById: (id) => nodes[id] ?? null,
    querySelector: (selector) => selector === "[data-guide-search-open]" && !prepositioned ? launcher : null,
    querySelectorAll: (selector) => selector.startsWith("main h1") ? [...indexedHeadings, ...(selector.includes(".guide-reader h1") ? supplementalHeadings : [])] : [],
    createElement: element, addEventListener: (type, listener) => documentListeners.set(type, listener),
  };
  const window = {}, location = { pathname: "/", search: "", hash: "", href: canonicalLifecycle.canonicalUrl, origin: new URL(canonicalLifecycle.canonicalUrl).origin };
  const history = { pushState(_, __, path) { const url = new URL(path, location.origin); Object.assign(location, { pathname: url.pathname, search: url.search, hash: url.hash, href: url.href }); } };
  runInNewContext(source, {
    document, window, location, history, navigator: { userAgent: "" }, Intl, Date, URL,
    performance: { getEntriesByType: () => [] },
    addEventListener() {}, requestAnimationFrame: () => 1, setTimeout: () => 1,
    clearTimeout() {}, setInterval() {}, scrollTo() {}, scrollY: 0, innerHeight: 800,
  });
  input.value = query;
  listeners.get("input")();
  if (updatedHeadings) {
    indexedHeadings = updatedHeadings;
    documentListeners.get("guide:primary-changed")?.();
  }
  capture?.({ window, documentListeners, results, input, search });
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
    assert.equal(searchFor(query)[0], destination(intentTargets[intent]));
  });
  test("runtime preserves " + intent + " for Arabic letters and vocalization", () => {
    const variant = query.replaceAll("ک", "ك").replaceAll("ی", "ي").replace("بوتاكس", "بُوتَاكِس");
    assert.equal(searchFor(variant)[0], destination(intentTargets[intent]));
  });
}

test("focused route context titles never become nonexistent search destinations", () => {
  const results = searchFor("بوتاکس", "بوتاکس");
  assert(results.length > 0);
  assert(!results.includes("/route-page-title"));
});
test("search results retain a heading's final canonical language path", () => {
  const sourceHeadings = [{ id: "old-english-guide-id", textContent: "English language guide", tagName: "H2",
    dataset: { canonicalHref: "/en-aesthetic-guide" } }];
  assert.deepEqual(searchFor("language guide", undefined, { sourceHeadings, targets: {} }), ["/en-aesthetic-guide"]);
});
test("search results retain a heading's final topic path and fragment", () => {
  const sourceHeadings = [{ id: "old-detail-id", textContent: "چراغ سبز", tagName: "H2",
    dataset: { canonicalHref: "/botox#old-detail-id" } }];
  assert.deepEqual(searchFor("چراغ سبز", undefined, { sourceHeadings, targets: {} }), ["/botox#old-detail-id"]);
});
test("an unannotated heading falls back to its encoded homepage fragment", () => {
  const sourceHeadings = [{ id: "راهنما", textContent: "چراغ سبز", tagName: "H2", dataset: {} }];
  assert.deepEqual(searchFor("چراغ سبز", undefined, { sourceHeadings, targets: {} }), ["/#" + encodeURIComponent("راهنما")]);
});
test("search includes the continuous guide's supplemental headings outside main", () => {
  const supplementalHeadings = [{ id: "supplemental-topic", textContent: "چراغ سبز", tagName: "H2",
    dataset: { canonicalHref: "/supplemental-topic" } }];
  assert.deepEqual(searchFor("چراغ سبز", undefined, { sourceHeadings: [], supplementalHeadings, targets: {} }), ["/supplemental-topic"]);
});
test("fresh focused expansion initializes search already placed in its context hero", () => {
  const sourceHeadings = [{ id: "live-topic", textContent: "چراغ سبز", tagName: "H2", dataset: { canonicalHref: "/live-topic" } }];
  let mounted;
  assert.deepEqual(searchFor("چراغ سبز", undefined, { sourceHeadings, targets: {}, prepositioned: true,
    capture: ({ search }) => { mounted = search.dataset.mounted; } }), ["/live-topic"]);
  assert.equal(mounted, "true");
});
test("primary reconstruction invalidates cached search headings and refreshes an active query", () => {
  const sourceHeadings = [{ id: "old-topic", textContent: "چراغ سبز", tagName: "H2",
    dataset: { canonicalHref: "/old-topic" } }];
  const updatedHeadings = [{ id: "current-topic", textContent: "چراغ سبز", tagName: "H2",
    dataset: { canonicalHref: "/current-topic" } }];
  assert.deepEqual(searchFor("چراغ سبز", undefined, { sourceHeadings, updatedHeadings, targets: {} }), ["/current-topic"]);
});
test("a clicked search result stays closed after the primary update refreshes its active query", async () => {
  const sourceHeadings = [{ id: "fragment", textContent: "چراغ سبز", tagName: "H2", dataset: { canonicalHref: "/#fragment" } }];
  const fragment = { id: "fragment", closest: () => null, hasAttribute: () => true, scrollIntoView() {}, focus() {} };
  let navigation, results;
  searchFor("چراغ سبز", undefined, { sourceHeadings, targets: {}, extraTargets: { fragment }, capture: (fixture) => {
    results = fixture.results;
    fixture.window.syncGuidePageState = async () => { fixture.documentListeners.get("guide:primary-changed")(); return true; };
    const link = { href: canonicalLifecycle.canonicalUrl + "#fragment", hasAttribute: () => false };
    navigation = fixture.documentListeners.get("click")({ button: 0, target: { closest: () => link }, preventDefault() {} });
  } });
  await navigation;
  assert.equal(results.hidden, true);
});
for (const href of ["/#doctor-selection-criteria", "/botox#doctor-selection-criteria"]) {
  test("intent matching prefers the hash ID and retains the final href: " + href, () => {
    const sourceHeadings = [{ id: "doctor-selection-criteria", textContent: "تصمیم بالینی", tagName: "H3",
      dataset: { canonicalHref: href } }];
    const targets = { botox: new URL(href, canonicalLifecycle.canonicalUrl).href };
    assert.deepEqual(searchFor("بهترین دکتر بوتاکس", undefined, { sourceHeadings, targets }), [href]);
  });
}
