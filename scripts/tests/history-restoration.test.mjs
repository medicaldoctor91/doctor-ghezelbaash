import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const runtime = readFileSync(new URL("../../src/scripts/guide-runtime.js", import.meta.url), "utf8");
function loadPage(type) {
  let scrolls = 0;
  const listeners = new Map();
  const target = { id: "section", closest: () => null,
    scrollIntoView: () => scrolls++,
    getBoundingClientRect: () => ({ top: 2000, bottom: 2100 }) };
  const document = {
    documentElement: { classList: { add() {} } },
    getElementById: (id) => id === "section" ? target : null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {},
  };
  const context = { document, window: {}, Intl, Date, URL, URLSearchParams, Set, Map,
    navigator: { userAgent: "" },
    location: { pathname: "/section", search: "", hash: "", href: "https://www.ghezelbaash.ir/section" },
    performance: { getEntriesByType: () => [{ type }] },
    addEventListener: (name, fn) => {
      const callbacks = listeners.get(name) || [];
      callbacks.push(fn); listeners.set(name, callbacks);
    },
    requestAnimationFrame: (fn) => { fn(); return 1; },
    setTimeout: () => 1, clearTimeout() {}, setInterval() {},
    scrollTo: () => scrolls++, scrollY: 0, innerHeight: 800,
  };
  runInNewContext(runtime, context);
  return {
    scrolls: () => scrolls,
    pageshow: (persisted) => listeners.get("pageshow").forEach((fn) => fn({ persisted })),
  };
}
test("Back without BFCache does not reposition the saved scroll on load or pageshow", () => {
  const page = loadPage("back_forward");
  assert.equal(page.scrolls(), 0);
  page.pageshow(false);
  assert.equal(page.scrolls(), 0);
});
test("fresh deep links still position before pageshow and delayed layout", () => {
  const page = loadPage("navigate");
  assert.equal(page.scrolls(), 1);
  page.pageshow(false);
  assert.equal(page.scrolls(), 2);
});
test("BFCache pageshow preserves its restored position", () => {
  const page = loadPage("navigate");
  const before = page.scrolls();
  page.pageshow(true);
  assert.equal(page.scrolls(), before);
});
