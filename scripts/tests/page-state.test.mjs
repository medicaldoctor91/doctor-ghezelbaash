import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "parse5";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../../src/scripts/page-state.js", import.meta.url), "utf8");
const origin = "https://www.ghezelbaash.ir";
const home = '<html lang="fa-IR" dir="rtl"><head><title>Home</title><link rel="canonical" href="' + origin + '/"></head><body><main id="main-content"><article class="medical-guide" lang="fa-IR" dir="rtl" aria-labelledby="home-title"><script type="application/ld+json">{"@graph":[{"@id":"home"}]}</script><h1 id="home-title">Home</h1><h2 id="botox">Botox</h2><h2 id="filler">Filler</h2><h2 id="english">English</h2><video id="patient-video"></video></article></main></body></html>';
const focused = (title, slug, lang = "fa-IR", dir = "rtl", alternates = []) => '<html lang="' + lang + '" dir="' + dir + '" data-route-view="focused"><head><title>' + title + '</title><meta name="description" content="' + title +
  '"><link rel="canonical" href="' + origin + '/' + slug + '">' + alternates.map(({ href, hrefLang }) => '<link rel="alternate" hreflang="' + hrefLang + '" href="' + href + '">').join("") + '<script type="application/ld+json">{"@graph":[{"@id":"' + slug +
  '"}]}</script></head><body><main id="main-content"><article class="medical-guide" lang="' + lang + '" dir="' + dir + '" aria-labelledby="route-page-title"><header data-route-context lang="' + lang + '" dir="' + dir + '"><h1 id="route-page-title">' + title +
  '</h1><a href="/" data-guide-expand data-loading="Loading…" data-error="Retry">Show the complete guide</a><p data-guide-expand-status></p></header><h2 id="' + slug + '">' + title +
  '</h2><video id="patient-video"></video></article></main><input id="guide-search-input"></body></html>';
// The adapter executes actual page-state code and its delegated user events.
const matches = (node, selector) => {
  if (selector === "script") return node.tagName === "script";
  if (selector === 'link[rel="alternate"][hreflang]') return node.tagName === "link" && node.getAttribute("rel") === "alternate" && node.hasAttribute("hreflang");
  if (selector === "article.medical-guide") return node.tagName === "article" && (node.getAttribute("class") || "").split(/\s+/).includes("medical-guide");
  if (selector.startsWith("#")) return node.id === selector.slice(1);
  const present = /^(?:(a|video))?\[([a-z-]+)\]$/.exec(selector);
  if (present) return (!present[1] || node.tagName === present[1]) && node.hasAttribute(present[2]);
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
  hasAttribute(key) { return this.getAttribute(key) !== null; }
  setAttribute(key, value) { const attr = this.attrs.find((attr) => attr.name === key); if (attr) attr.value = value; else this.attrs.push({ name: key, value }); }
  removeAttribute(key) { this.attrs = this.attrs.filter((attr) => attr.name !== key); }
  querySelectorAll(selector) {
    const results = [], selectors = selector.split(",");
    const visit = (node) => { if (selectors.some((entry) => matches(node, entry))) results.push(node); for (const child of node.childNodes) visit(child); };
    for (const child of this.childNodes) visit(child);
    return results;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { for (let node = this; node; node = node.parentNode) if (matches(node, selector)) return node; return null; }
  remove() { if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter((node) => node !== this); this.parentNode = null; }
  cloneNode() { return new DomNode({ tagName: this.tagName, value: this.value, attrs: this.attrs, childNodes: this.childNodes }); }
  append(node) { node.remove(); node.parentNode = this; this.childNodes.push(node); }
  prepend(node) { node.remove(); node.parentNode = this; this.childNodes.unshift(node); }
  replaceWith(node) { const parent = this.parentNode, index = parent.childNodes.indexOf(this); node.remove(); parent.childNodes.splice(index, 1, node); node.parentNode = parent; this.parentNode = null; }
  replaceChildren(...nodes) { this.childNodes = []; for (const node of nodes) this.append(node); }
  get textContent() { return this.value ?? this.childNodes.map((node) => node.textContent).join(""); }
  set textContent(value) { this.replaceChildren(new DomNode({ value })); }
  get id() { return this.getAttribute("id"); }
  get href() { return new URL(this.getAttribute("href"), origin).href; }
  set href(value) { this.setAttribute("href", value); }
  click() {
    let root = this; while (root.parentNode) root = root.parentNode;
    root.dispatchEvent({ type: "click", target: this, button: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } });
  }
}
function documentFor(html) {
  const root = new DomNode(parse(html)), listeners = new Map();
  const all = []; const collect = (node) => { all.push(node); node.childNodes.forEach(collect); }; collect(root);
  root.documentElement = all.find((node) => node.tagName === "html");
  root.head = all.find((node) => node.tagName === "head");
  root.body = all.find((node) => node.tagName === "body");
  root.addEventListener = (type, listener) => { const list = listeners.get(type) || []; list.push(listener); listeners.set(type, list); };
  root.dispatchEvent = (event) => { for (const listener of listeners.get(event.type) || []) listener(event); };
  root.createElement = (tagName) => new DomNode({ tagName });
  const title = all.find((node) => node.tagName === "title");
  Object.defineProperty(root, "title", { get: () => title.textContent, set: (value) => { title.textContent = value; } });
  root.getElementById = (id) => { const nodes = []; const walk = (node) => { nodes.push(node); node.childNodes.forEach(walk); }; walk(root); return nodes.find((node) => node.id === id); };
  return root;
}
function reader({ initial = focused("Botox", "botox"), path = "/botox", failOnce = false } = {}) {
  const document = documentFor(initial), location = { origin, pathname: path, assign() { throw new Error("Unexpected document navigation"); } };
  const window = { document, location, history: {
    pushState: (_, __, path) => { location.pathname = path; },
    replaceState: (_, __, path) => { location.pathname = path; },
  } };
  const requests = [];
  const englishAlternates = [
    { href: origin + "/english", hrefLang: "en" },
    { href: origin + "/arabic", hrefLang: "ar-IQ" },
  ];
  const fetch = async (path) => {
    requests.push(path);
    if (failOnce) { failOnce = false; return { ok: false }; }
    return { ok: true, text: async () => path === "/" ? home : path === "/english" ? focused("English", "english", "en", "ltr", englishAlternates) : focused("Filler", "filler") };
  };
  class DOMParser { parseFromString(html) { return documentFor(html); } }
  class CustomEvent { constructor(type) { this.type = type; } }
  runInNewContext(source, { document, window, location, DOMParser, fetch, URL, CustomEvent });
  return { window, requests };
}
test("direct entry stays focused and initializes without fetching or injecting the full home", async () => {
  const { window, requests } = reader();
  await window.completeGuideReady;
  assert.equal(window.location.pathname, "/botox");
  assert.equal(window.document.title, "Botox");
  assert(!window.document.getElementById("filler"));
  assert.equal(window.document.documentElement.dataset.routeView, "focused");
  assert.deepEqual(requests, []);
});
test("explicit expansion loads the full guide once in the same document and preserves route metadata", async () => {
  const { window, requests } = reader(), document = window.document;
  let expansions = 0; document.addEventListener("guide:expanded", () => expansions++);
  document.querySelector("[data-guide-expand]").click();
  await Promise.all([window.expandCompleteGuide(), window.expandCompleteGuide()]);
  assert.equal(window.location.pathname, "/botox");
  assert.equal(document.title, "Botox");
  assert.equal(document.querySelectorAll("article.medical-guide").length, 1);
  assert(document.getElementById("filler"));
  assert.equal(document.querySelector('link[rel="canonical"]').href, origin + "/botox");
  assert.equal(document.querySelectorAll('script[type="application/ld+json"]').length, 1);
  assert(!document.querySelector("[data-guide-expand]"));
  assert.equal(expansions, 1);
  await window.expandCompleteGuide();
  assert.deepEqual(requests, ["/"]);
});
test("SPA navigation and Back synchronize language, direction and metadata with cache reuse", async () => {
  const { window, requests } = reader(), document = window.document;
  await window.expandCompleteGuide();
  window.history.pushState(null, "", "/english");
  await window.syncGuidePageState("/english");
  assert.equal(document.title, "English");
  assert.equal(document.documentElement.getAttribute("lang"), "en");
  assert.equal(document.documentElement.getAttribute("dir"), "ltr");
  assert.equal(document.querySelector('link[rel="canonical"]').href, origin + "/english");
  assert.equal(JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)["@graph"][0]["@id"], "english");
  window.history.replaceState(null, "", "/botox");
  await window.syncGuidePageState("/botox");
  assert.equal(document.title, "Botox");
  assert.equal(document.documentElement.getAttribute("lang"), "fa-IR");
  assert.equal(document.documentElement.getAttribute("dir"), "rtl");
  assert(!document.querySelector("[data-guide-expand]"));
  assert(document.getElementById("filler"));
  assert.deepEqual(requests, ["/", "/english"]);
});
test("failed expansion retains the readable topic and allows an explicit retry", async () => {
  const { window, requests } = reader({ failOnce: true }), document = window.document;
  assert.equal(await window.expandCompleteGuide(), false);
  assert.equal(document.documentElement.dataset.routeView, "focused");
  assert(document.getElementById("botox"));
  assert(!document.getElementById("filler"));
  assert.equal(document.querySelector("[data-guide-expand-status]").textContent, "Retry");
  assert.equal(await window.expandCompleteGuide(), true);
  assert(document.getElementById("filler"));
  assert.deepEqual(requests, ["/", "/"]);
});
test("search focus is a deliberate expansion and does not change the route", async () => {
  const { window, requests } = reader(), document = window.document;
  document.dispatchEvent({ type: "focusin", target: document.getElementById("guide-search-input") });
  await window.expandCompleteGuide();
  assert(document.getElementById("filler"));
  assert.equal(window.location.pathname, "/botox");
  assert.deepEqual(requests, ["/"]);
});
test("expanding a video entry preserves its existing player and playback state", async () => {
  const { window } = reader(), document = window.document, player = document.getElementById("patient-video");
  player.currentTime = 37; player.paused = false;
  await window.expandCompleteGuide();
  assert.equal(document.getElementById("patient-video"), player);
  assert.equal(player.currentTime, 37);
  assert.equal(player.paused, false);
});
test("home is already complete and never fetches itself during initialization or expansion", async () => {
  const { window, requests } = reader({ initial: home, path: "/" });
  await window.completeGuideReady;
  await window.expandCompleteGuide();
  assert(window.document.getElementById("filler"));
  assert.deepEqual(requests, []);
});

test("English entry expansion preserves route language while the full Persian article retains its direction", async () => {
  const { window } = reader({ initial: focused("English", "english", "en", "ltr"), path: "/english" });
  const document = window.document, article = document.querySelector("article.medical-guide");
  assert.equal(article.getAttribute("lang"), "en");
  assert.equal(article.getAttribute("dir"), "ltr");
  assert.equal(await window.expandCompleteGuide(), true);
  assert.equal(document.documentElement.getAttribute("lang"), "en");
  assert.equal(document.documentElement.getAttribute("dir"), "ltr");
  assert.equal(article.getAttribute("lang"), "fa-IR");
  assert.equal(article.getAttribute("dir"), "rtl");
  assert.equal(document.querySelector("[data-route-context]").getAttribute("lang"), "en");
  assert.equal(document.querySelector("[data-route-context]").getAttribute("dir"), "ltr");
});
test("same-document route language never changes the complete Persian article's direction", async () => {
  const { window } = reader({ initial: home, path: "/" }), document = window.document;
  window.history.pushState(null, "", "/english");
  await window.syncGuidePageState("/english");
  assert.equal(document.documentElement.getAttribute("lang"), "en");
  assert.equal(document.querySelector("article.medical-guide").getAttribute("lang"), "fa-IR");
  assert.equal(document.querySelector("article.medical-guide").getAttribute("dir"), "rtl");
  assert.equal(document.querySelector("[data-route-context]").getAttribute("lang"), "en");
  assert.equal(document.querySelector("[data-route-context]").getAttribute("dir"), "ltr");
});
test("SPA navigation removes stale language alternates and restores them from its cache", async () => {
  const { window, requests } = reader({ initial: home, path: "/" }), document = window.document;
  window.history.pushState(null, "", "/english");
  await window.syncGuidePageState("/english");
  const selector = 'link[rel="alternate"][hreflang]';
  assert.equal(document.head.querySelectorAll(selector).length, 2);
  assert.equal(document.head.querySelectorAll(selector)[0].getAttribute("hreflang"), "en");
  window.history.pushState(null, "", "/filler");
  await window.syncGuidePageState("/filler");
  assert.equal(document.head.querySelectorAll(selector).length, 0);
  window.history.replaceState(null, "", "/english");
  await window.syncGuidePageState("/english");
  assert.equal(document.head.querySelectorAll(selector).length, 2);
  assert.deepEqual(requests, ["/english", "/filler"]);
});
