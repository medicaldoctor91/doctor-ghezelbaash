import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "parse5";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../../src/scripts/page-state.js", import.meta.url), "utf8");
const home = '<html><head><title>Home</title><link rel="canonical" href="https://www.ghezelbaash.ir/"></head><body><main><article class="medical-guide" aria-labelledby="home-title"><script type="application/ld+json">{"@graph":[{"@id":"home"}]}</script><h1 id="home-title">Home</h1><h2 id="botox">Botox</h2><h2 id="filler">Filler</h2></article></main></body></html>';
const focused = (title, slug) => '<html data-route-view="focused"><head><title>' + title + '</title><meta name="description" content="' + title +
  '"><link rel="canonical" href="https://www.ghezelbaash.ir/' + slug + '"><script type="application/ld+json">{"@graph":[{"@id":"' + slug +
  '"}]}</script></head><body><main><article class="medical-guide" aria-labelledby="route-page-title"><header data-route-context><h1 id="route-page-title">' + title +
  '</h1></header><h2 id="' + slug + '">' + title + '</h2></article></main></body></html>';
// Small parse5-backed DOM adapter exercises the actual bootstrap without a new dependency.
const matches = (node, selector) => {
  if (selector === "script") return node.tagName === "script";
  if (selector === "article.medical-guide") return node.tagName === "article" && (node.getAttribute("class") || "").split(/\s+/).includes("medical-guide");
  if (selector === "[data-route-context]") return node.getAttribute("data-route-context") !== null;
  const match = /^(meta|link|script)\[(name|property|rel|type)(\^?)="([^"]+)"\]$/.exec(selector);
  if (!match || node.tagName !== match[1]) return false;
  const value = node.getAttribute(match[2]);
  return match[3] ? value?.startsWith(match[4]) : value === match[4];
};
class DomNode {
  constructor(raw) {
    this.tagName = raw.tagName; this.value = raw.value; this.attrs = (raw.attrs || []).map((attr) => ({ ...attr }));
    this.childNodes = (raw.childNodes || []).map((child) => new DomNode(child));
    for (const child of this.childNodes) child.parentNode = this;
    this.dataset = Object.fromEntries(this.attrs.filter((attr) => attr.name.startsWith("data-")).map((attr) =>
      [attr.name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), attr.value]));
  }
  getAttribute(key) { return this.attrs.find((attr) => attr.name === key)?.value ?? null; }
  setAttribute(key, value) { const attr = this.attrs.find((attr) => attr.name === key); if (attr) attr.value = value; else this.attrs.push({ name: key, value }); }
  querySelectorAll(selector) {
    const results = [], selectors = selector.split(",");
    const visit = (node) => { if (selectors.some((entry) => matches(node, entry))) results.push(node); for (const child of node.childNodes) visit(child); };
    for (const child of this.childNodes) visit(child);
    return results;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  remove() { if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter((node) => node !== this); this.parentNode = null; }
  cloneNode() { return new DomNode({ tagName: this.tagName, value: this.value, attrs: this.attrs, childNodes: this.childNodes }); }
  append(node) { node.remove(); node.parentNode = this; this.childNodes.push(node); }
  prepend(node) { node.remove(); node.parentNode = this; this.childNodes.unshift(node); }
  replaceChildren(...nodes) { this.childNodes = []; for (const node of nodes) this.append(node); }
  get textContent() { return this.value ?? this.childNodes.map((node) => node.textContent).join(""); }
  get href() { return this.getAttribute("href"); }
}
function documentFor(html) {
  const root = new DomNode(parse(html));
  const all = []; const collect = (node) => { all.push(node); node.childNodes.forEach(collect); }; collect(root);
  root.documentElement = all.find((node) => node.tagName === "html");
  root.head = all.find((node) => node.tagName === "head");
  root.body = all.find((node) => node.tagName === "body");
  root.addEventListener = () => {};
  const title = all.find((node) => node.tagName === "title");
  Object.defineProperty(root, "title", { get: () => title.textContent, set: (value) => title.replaceChildren(new DomNode({ value })) });
  root.getElementById = (id) => { const nodes = []; const walk = (node) => { nodes.push(node); node.childNodes.forEach(walk); }; walk(root); return nodes.find((node) => node.getAttribute("id") === id); };
  return root;
}
function reader() {
  const document = documentFor(focused("Botox", "botox")), location = { origin: "https://www.ghezelbaash.ir", pathname: "/botox" };
  const window = { document, location, history: {
    pushState: (_, __, path) => { location.pathname = path; },
    replaceState: (_, __, path) => { location.pathname = path; },
  } };
  const requests = [];
  const fetch = async (path) => { requests.push(path); return { ok: true, text: async () => path === "/" ? home : focused("Filler", "filler") }; };
  class DOMParser { parseFromString(html) { return documentFor(html); } }
  runInNewContext(source, { document, window, location, DOMParser, fetch });
  return { dom: { window }, requests };
}
test("direct entry expands the same full guide without changing URL or its entity metadata", async () => {
  const { dom, requests } = reader();
  await dom.window.completeGuideReady;
  assert.equal(dom.window.location.pathname, "/botox");
  assert.equal(dom.window.document.title, "Botox");
  assert.equal(dom.window.document.querySelectorAll("article.medical-guide").length, 1);
  assert(dom.window.document.getElementById("filler"));
  assert.equal(dom.window.document.querySelector('link[rel="canonical"]').href, "https://www.ghezelbaash.ir/botox");
  assert.equal(dom.window.document.querySelectorAll('script[type="application/ld+json"]').length, 1);
  assert.deepEqual(requests, ["/"]);
});
test("SPA navigation and Back synchronize canonical, title and main-entity graph with cache reuse", async () => {
  const { dom, requests } = reader();
  await dom.window.completeGuideReady;
  dom.window.history.pushState(null, "", "/filler");
  await dom.window.syncGuidePageState("/filler");
  assert.equal(dom.window.document.title, "Filler");
  assert.equal(dom.window.document.querySelector('link[rel="canonical"]').href, "https://www.ghezelbaash.ir/filler");
  assert.equal(JSON.parse(dom.window.document.querySelector('script[type="application/ld+json"]').textContent)["@graph"][0]["@id"], "filler");
  dom.window.history.replaceState(null, "", "/botox");
  await dom.window.syncGuidePageState("/botox");
  assert.equal(dom.window.document.title, "Botox");
  assert(dom.window.document.getElementById("filler"));
  assert.deepEqual(requests, ["/", "/filler"]);
});
