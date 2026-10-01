import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createGuideSearch } from "../../src/lib/guide-search.mjs";

const runtime = "const createGuideSearch = (" + createGuideSearch.toString() + ");\n" +
  readFileSync(new URL("../../src/scripts/guide-runtime.js", import.meta.url), "utf8");
function reader() {
  const origin = "https://www.ghezelbaash.ir", listeners = new Map(), visited = [], pushed = [], metadata = [];
  const target = (id) => ({ id, closest: () => null, hasAttribute: () => true, focus() {}, scrollIntoView: () => visited.push(id) });
  const nodes = { section: target("section"), fragment: target("fragment"), "main-content": target("main-content") };
  const location = { origin, pathname: "/section", hash: "", search: "", href: origin + "/section" };
  const document = {
    documentElement: { classList: { add() {} } },
    getElementById: (id) => nodes[id] || null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener: (type, listener) => { const list = listeners.get(type) || []; list.push(listener); listeners.set(type, list); },
  };
  const history = { pushState(_, __, path) {
    pushed.push(path);
    const next = new URL(path, origin);
    Object.assign(location, { pathname: next.pathname, hash: next.hash, search: next.search, href: next.href });
  } };
  runInNewContext(runtime, {
    document, window: { syncGuidePageState: (path) => metadata.push(path) }, location, history,
    navigator: { userAgent: "" }, Intl, Date, URL, performance: { getEntriesByType: () => [] },
    addEventListener() {}, requestAnimationFrame: () => 1, setTimeout: () => 1, clearTimeout() {}, setInterval() {},
    scrollTo() {}, scrollY: 0, innerHeight: 800,
  });
  return { visited, pushed, metadata, location,
    emit: (type, event = {}) => { for (const listener of listeners.get(type) || []) listener(event); } };
}
test("home fragment links navigate and synchronize within the existing reader", () => {
  const page = reader();
  const link = { href: "https://www.ghezelbaash.ir/#fragment", hasAttribute: () => false };
  const event = { button: 0, target: { closest: () => link }, preventDefault() { this.defaultPrevented = true; } };
  page.emit("click", event);
  assert(event.defaultPrevented);
  assert.deepEqual(page.pushed, ["/#fragment"]);
  assert.deepEqual(page.metadata, ["/"]);
  assert.equal(page.visited.at(-1), "fragment");
});
test("guide expansion respects the reader's latest fragment target", () => {
  const page = reader();
  page.location.hash = "#fragment";
  page.emit("guide:expanded");
  assert.equal(page.visited.at(-1), "fragment");
  assert.deepEqual(page.pushed, []);
});
