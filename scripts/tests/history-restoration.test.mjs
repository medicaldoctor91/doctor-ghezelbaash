import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGuideSearch } from "../../src/lib/guide-search.mjs";
import { runInNewContext } from "node:vm";

const runtime = readFileSync(new URL("../../src/scripts/guide-runtime.js", import.meta.url), "utf8");
function loadPage(type, pathname = "/section", aliases = {}, { hash = "", completeGuideReady, completeGuideInteraction = false, targetId = "section",
  historyState = null, fontsReady = Promise.resolve(), syncRoute } = {}) {
  let scrolls = 0;
  const listeners = new Map(), documentListeners = new Map(), visited = [], focused = [], focusedNodes = [], metadata = [], restoredPositions = [], nativeNavigations = [], timers = new Map(), origin = "https://www.ghezelbaash.ir";
  let clock = 0, nextTimer = 0;
  const makeTarget = (id) => ({ id, closest: () => null, hasAttribute: () => true,
    focus() { focused.push(this.id); focusedNodes.push(this); },
    scrollIntoView() { scrolls++; visited.push(this.id); },
    getBoundingClientRect: () => ({ top: 2000, bottom: 2100 }) });
  const nodes = { [targetId]: makeTarget(targetId) };
  const document = {
    documentElement: { classList: { add() {} } },
    fonts: { ready: fontsReady },
    getElementById: (id) => nodes[id] || (id === "guide-search" ? { dataset: { contentRouteAliases: JSON.stringify(aliases), canonicalOrigin: origin } } : null),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener: (name, listener) => { const callbacks=documentListeners.get(name)||[];callbacks.push(listener);documentListeners.set(name,callbacks); },
  };
  const history = { state: historyState };
  const window = { completeGuideReady, completeGuideInteraction, history };
  if (syncRoute !== null) window.syncGuidePageState = (path) => { metadata.push(path); return syncRoute?.(path); };
  const setTimeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: clock + delay }); return id; };
  const clearTimeout = (id) => timers.delete(id);
  const advanceTime = (duration) => {
    clock += duration;
    for (const [id, timer] of timers) if (timer.at <= clock) { timers.delete(id); timer.callback(); }
  };
  const emit = (name, event = {}) => Promise.all((listeners.get(name) || []).map((listener) => listener(event)));
  const location = { origin, pathname, search: "", hash, href: origin + pathname + hash,
    assign: (destination) => nativeNavigations.push(destination) };
  const context = { document, window, Intl, Date, URL, URLSearchParams, Set, Map,
    navigator: { userAgent: "" },
    location,
    performance: { getEntriesByType: () => [{ type }] },
    addEventListener: (name, fn) => {
      const callbacks = listeners.get(name) || [];
      callbacks.push(fn); listeners.set(name, callbacks);
    },
    removeEventListener: (name, fn) => listeners.set(name,(listeners.get(name)||[]).filter(listener=>listener!==fn)),
    requestAnimationFrame: (fn) => { fn(); return 1; },
    setTimeout, clearTimeout, setInterval() {},
    scrollTo(options) { scrolls++; restoredPositions.push({ x: options.left ?? 0, y: options.top ?? 0 }); },
    scrollY: 0, innerHeight: 800,
  };
  const ready = runInNewContext("const createGuideSearch = (" + createGuideSearch.toString() + ");\n" + runtime, context);
  return {
    ready, window, history, visited, focused, focusedNodes, metadata, restoredPositions, nativeNavigations, advanceTime,
    addTarget: (id) => (nodes[id] = makeTarget(id)), getTarget: (id) => nodes[id],
    setLocation(path) {
      const next = new URL(path, origin);
      Object.assign(location, { pathname: next.pathname, hash: next.hash, search: next.search, href: next.href });
    },
    scrolls: () => scrolls,
    pageshow: (persisted) => emit("pageshow", { persisted }),
    popstate: () => emit("popstate"),
    interact: (type) => emit(type),
    primaryChanged: () => {for(const listener of documentListeners.get("guide:primary-changed")||[])listener();},
    listenerCount: (type) => (listeners.get(type)||[]).length,
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

test("legacy content paths open their mapped section while retaining the requested path", () => {
  const page = loadPage("navigate", "/contact/", { "/contact/": "/#section" });
  assert.equal(page.scrolls(), 1);
});
test("encoded Persian legacy paths resolve their decoded mapping", () => {
  const page = loadPage("navigate", "/%D8%AF%DA%A9%D8%AA%D8%B1%20%D9%82%D8%B2%D9%84%D8%A8%D8%A7%D8%B4",
    { "/دکتر قزلباش": "/#section" });
  assert.equal(page.scrolls(), 1);
});
test("malformed encoded paths do not break the navigation runtime", () => {
  assert.equal(loadPage("navigate", "/%invalid").scrolls(), 0);
});
test("Back does not reposition after the complete guide finishes loading", async () => {
  let finish;
  const completeGuideReady = new Promise((resolve) => { finish = resolve; });
  const page = loadPage("back_forward", "/section", {}, { hash: "#section", completeGuideReady });
  assert.equal(page.scrolls(), 0);
  finish(true);
  await page.ready;
  assert.equal(page.scrolls(), 0);
  page.pageshow(false);
  assert.equal(page.scrolls(), 0);
});
test("interaction during automatic loading prevents initial and pageshow repositioning", async () => {
  let finish;
  const completeGuideReady = new Promise((resolve) => { finish = resolve; });
  const page = loadPage("navigate", "/section", {}, { completeGuideReady });
  assert.equal(page.scrolls(), 0);
  page.window.completeGuideInteraction = true;
  finish(true);
  await page.ready;
  assert.equal(page.scrolls(), 0);
  page.pageshow(false);
  assert.equal(page.scrolls(), 0);
});
test("fresh canonical language paths position at their authored ID after expansion", async () => {
  const page = loadPage("navigate", "/en-aesthetic-guide", { "/en-aesthetic-guide": "/#old-existing-section-id" },
    { targetId: "old-existing-section-id", completeGuideReady: Promise.resolve(true) });
  await page.ready;
  assert.deepEqual(page.visited, ["old-existing-section-id"]);
  page.pageshow(false);
  assert.deepEqual(page.visited, ["old-existing-section-id", "old-existing-section-id"]);
});
test("Back to a canonical language URL preserves saved scroll through expansion and pageshow", async () => {
  let finish;
  const completeGuideReady = new Promise((resolve) => { finish = resolve; });
  const page = loadPage("back_forward", "/en-aesthetic-guide", { "/en-aesthetic-guide": "/#old-existing-section-id" },
    { targetId: "old-existing-section-id", completeGuideReady });
  assert.equal(page.scrolls(), 0);
  finish(true);
  await page.ready;
  page.pageshow(false);
  assert.equal(page.scrolls(), 0);
  await page.popstate();
  assert.equal(page.scrolls(), 0);
  assert.deepEqual(page.focused, ["old-existing-section-id"]);
  assert.deepEqual(page.metadata, ["/en-aesthetic-guide"]);
});
test("BFCache restoration of a canonical language URL does not reapply its section position", () => {
  const page = loadPage("navigate", "/en-aesthetic-guide", { "/en-aesthetic-guide": "/#old-existing-section-id" },
    { targetId: "old-existing-section-id" });
  assert.deepEqual(page.visited, ["old-existing-section-id"]);
  page.pageshow(true);
  assert.deepEqual(page.visited, ["old-existing-section-id"]);
});
test("popstate resolves a legacy alias fragment without scrolling the restored page", async () => {
  const page = loadPage("back_forward", "/legacy/guide/", { "/legacy/guide/": "/#section" });
  await page.popstate();
  assert.equal(page.scrolls(), 0);
  assert.deepEqual(page.focused, ["section"]);
  assert.deepEqual(page.metadata, ["/legacy/guide/"]);
});
test("a saved Back position waits for the complete guide and fonts instead of jumping to its heading", async () => {
  let guideReady, fontsReady;
  const completeGuideReady = new Promise((resolve) => { guideReady = resolve; });
  const fontLoad = new Promise((resolve) => { fontsReady = resolve; });
  const page = loadPage("back_forward", "/section", {}, { completeGuideReady, fontsReady: fontLoad,
    historyState: { otherIntegration: "preserved", __completeGuideScroll: { x: 12.5, y: 4217.25 } } });
  assert.deepEqual(page.restoredPositions, []);
  guideReady(true);
  await new Promise(setImmediate);
  assert.deepEqual(page.restoredPositions, []);
  fontsReady();
  await page.ready;
  assert.deepEqual(page.restoredPositions, [{ x: 12.5, y: 4217.25 }]);
  assert.deepEqual(page.visited, []);
  assert.equal(page.window.history.state.otherIntegration, "preserved");
  page.pageshow(false);
  assert.deepEqual(page.restoredPositions, [{ x: 12.5, y: 4217.25 }]);
});
test("a stalled font load has a bounded wait before restoring the saved Back position", async () => {
  const page = loadPage("back_forward", "/section", {}, { fontsReady: new Promise(() => {}),
    historyState: { __completeGuideScroll: { x: 0, y: 7350 } } });
  page.advanceTime(349);
  await new Promise(setImmediate);
  assert.deepEqual(page.restoredPositions, []);
  page.advanceTime(1);
  await page.ready;
  assert.deepEqual(page.restoredPositions, [{ x: 0, y: 7350 }]);
});
for (const type of ["wheel", "touchstart", "pointerdown", "keydown"]) {
  test(type + " input during layout readiness prevents overwriting the reader's position", async () => {
    let finishFonts;
    const fontsReady = new Promise((resolve) => { finishFonts = resolve; });
    const page = loadPage("back_forward", "/section", {}, { fontsReady,
      historyState: { __completeGuideScroll: { x: 0, y: 4500 } } });
    page.interact(type);
    finishFonts();
    await page.ready;
    assert.deepEqual(page.restoredPositions, []);
    assert.deepEqual(page.visited, []);
  });
}
test("interaction recorded during guide loading prevents saved-position restoration", async () => {
  let finishGuide;
  const completeGuideReady = new Promise((resolve) => { finishGuide = resolve; });
  const page = loadPage("back_forward", "/section", {}, { completeGuideReady,
    historyState: { __completeGuideScroll: { x: 0, y: 4500 } } });
  page.window.completeGuideInteraction = true;
  finishGuide(true);
  await page.ready;
  assert.deepEqual(page.restoredPositions, []);
});
test("a native scroll event without reader input still permits saved-position restoration", async () => {
  let finishFonts;
  const fontsReady = new Promise((resolve) => { finishFonts = resolve; });
  const page = loadPage("back_forward", "/section", {}, { fontsReady,
    historyState: { __completeGuideScroll: { x: 0, y: 4500 } } });
  page.interact("scroll");
  finishFonts();
  await page.ready;
  assert.deepEqual(page.restoredPositions, [{ x: 0, y: 4500 }]);
});
test("persisted pageshow preserves BFCache scroll while a known snapshot is waiting for layout", async () => {
  let finishFonts;
  const fontsReady = new Promise((resolve) => { finishFonts = resolve; });
  const page = loadPage("back_forward", "/section", {}, { fontsReady,
    historyState: { __completeGuideScroll: { x: 0, y: 4500 } } });
  page.pageshow(true);
  finishFonts();
  await page.ready;
  assert.deepEqual(page.restoredPositions, []);
});
for (const type of ["navigate", "reload"]) {
  test(type + " follows its direct target instead of restoring an old history snapshot", async () => {
    const page = loadPage(type, "/section", {}, { historyState: { __completeGuideScroll: { x: 0, y: 4500 } } });
    await page.ready;
    assert.deepEqual(page.visited, ["section"]);
    assert.deepEqual(page.restoredPositions, []);
  });
}
test("absent or invalid saved coordinates leave native Back restoration in control", async () => {
  for (const snapshot of [null, { x: 0, y: -1 }, { x: 0, y: Infinity }, { x: NaN, y: 100 }, { x: "0", y: 100 }, { x: 0 }]) {
    const page = loadPage("back_forward", "/section", {}, { historyState: { __completeGuideScroll: snapshot } });
    await page.ready;
    page.pageshow(false);
    assert.deepEqual(page.restoredPositions, []);
    assert.deepEqual(page.visited, []);
  }
});
test("popstate waits for route metadata and focuses the reconstructed article without scrolling", async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  let metadataReady = false, currentTarget;
  const page = loadPage("back_forward", "/section", {}, { syncRoute: () => pending.then(() => {
    metadataReady = true;
    currentTarget = page.addTarget("section");
  }) });
  const detachedTarget = page.getTarget("section"), completion = page.popstate();
  assert.deepEqual(page.metadata, ["/section"]);
  assert.equal(metadataReady, false);
  assert.deepEqual(page.focusedNodes, []);
  assert.equal(page.scrolls(), 0);
  finish(true);
  await completion;
  assert.equal(metadataReady, true);
  assert.notEqual(currentTarget, detachedTarget);
  assert.deepEqual(page.focusedNodes, [currentTarget]);
  assert.equal(page.scrolls(), 0);
  assert.deepEqual(page.restoredPositions, []);
});
test("a failed popstate article commit loads the physical route without positioning stale content", async () => {
  const page = loadPage("back_forward", "/section", {}, { syncRoute: async () => false });
  await page.popstate();
  assert.deepEqual(page.nativeNavigations, ["/section"]);
  assert.equal(page.scrolls(), 0);
  assert.deepEqual(page.focusedNodes, []);
});
test("popstate retains native scroll when no page-state helper is installed", async () => {
  const page = loadPage("back_forward", "/section", {}, { syncRoute: null });
  await page.popstate();
  assert.deepEqual(page.metadata, []);
  assert.deepEqual(page.focusedNodes, [page.getTarget("section")]);
  assert.equal(page.scrolls(), 0);
});
test("racing popstate loads only focus the latest reconstructed route", async () => {
  const resolvers = [];
  const page = loadPage("back_forward", "/section", {}, {
    syncRoute: () => new Promise((resolve) => resolvers.push(resolve)),
  });
  const first = page.popstate();
  page.setLocation("/fragment");
  const currentTarget = page.addTarget("fragment"), latest = page.popstate();
  resolvers[1](true);
  await latest;
  assert.deepEqual(page.focusedNodes, [currentTarget]);
  resolvers[0](true);
  await first;
  assert.deepEqual(page.focusedNodes, [currentTarget]);
  assert.deepEqual(page.metadata, ["/section", "/fragment"]);
  assert.equal(page.scrolls(), 0);
});
test("a destination change during popstate loading cannot focus an obsolete route", async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const page = loadPage("back_forward", "/section", {}, { syncRoute: () => pending });
  const completion = page.popstate();
  page.setLocation("/section#different-fragment");
  finish(false);
  await completion;
  assert.deepEqual(page.nativeNavigations, []);
  assert.deepEqual(page.focusedNodes, []);
  assert.equal(page.scrolls(), 0);
});
test("a failed asynchronous Back document load uses native navigation with the restored fragment", async () => {
  let fail;
  const pending = new Promise((_, reject) => { fail = reject; });
  const page = loadPage("back_forward", "/legacy/guide/", { "/legacy/guide/": "/#section" }, {
    hash: "#section", syncRoute: () => pending.catch(() => false),
  });
  const completion = page.popstate();
  assert.deepEqual(page.nativeNavigations, []);
  assert.deepEqual(page.focusedNodes, []);
  assert.equal(page.scrolls(), 0);
  fail(new Error("Focused document fetch failed"));
  await completion;
  assert.deepEqual(page.nativeNavigations, ["/legacy/guide/#section"]);
  assert.deepEqual(page.focusedNodes, []);
  assert.equal(page.scrolls(), 0);
});
test("an obsolete failed popstate cannot reload a newer restored route", async () => {
  const resolvers = [];
  const page = loadPage("back_forward", "/section", {}, {
    syncRoute: () => new Promise((resolve) => resolvers.push(resolve)),
  });
  const first = page.popstate();
  page.setLocation("/fragment");
  const currentTarget = page.addTarget("fragment"), latest = page.popstate();
  resolvers[1](true);
  await latest;
  resolvers[0](false);
  await first;
  assert.deepEqual(page.nativeNavigations, []);
  assert.deepEqual(page.focusedNodes, [currentTarget]);
  assert.equal(page.scrolls(), 0);
});

const settle = async () => { for(let index=0;index<5;index++)await Promise.resolve(); };
test("same-document Back restores the known entry only after its replacement body and fonts are ready", async () => {
  let finishBody,finishFonts;
  const body=new Promise(resolve=>{finishBody=resolve;}),fontsReady=new Promise(resolve=>{finishFonts=resolve;});
  const state={custom:"retained",__completeGuideScroll:{x:7,y:11511}};
  let page;
  page=loadPage("navigate","/",{}, {historyState:state,fontsReady,syncRoute:async()=>{await body;page.primaryChanged();return true;}});
  await page.ready;
  const completion=page.popstate();
  assert.deepEqual(page.restoredPositions,[]);
  finishBody();await settle();
  assert.deepEqual(page.restoredPositions,[]);
  finishFonts();await completion;
  assert.deepEqual(page.restoredPositions,[{x:7,y:11511}]);
  assert.equal(page.history.state,state);assert.equal(state.custom,"retained");
});
test("an unchanged same-path fragment keeps native restoration despite a known snapshot", async () => {
  const page=loadPage("navigate","/",{}, {historyState:{__completeGuideScroll:{x:0,y:11511}},syncRoute:async()=>true});
  await page.ready;await page.popstate();
  assert.deepEqual(page.restoredPositions,[]);
});
for(const position of [undefined,{x:0,y:-1},{x:0,y:"11511"},{x:Number.NaN,y:11511}]){
  test("body replacement with an absent or invalid same-document snapshot preserves native scroll: "+JSON.stringify(position),async()=>{
    let page;page=loadPage("navigate","/",{}, {historyState:{__completeGuideScroll:position},syncRoute:async()=>{page.primaryChanged();return true;}});
    await page.ready;await page.popstate();assert.deepEqual(page.restoredPositions,[]);
  });
}
for(const input of ["pointerdown","wheel","keydown","touchstart"]){
  test(input+" during same-document layout cancels saved restoration and releases its temporary guards",async()=>{
    let finishFonts;
    const fontsReady=new Promise(resolve=>{finishFonts=resolve;});
    let page;page=loadPage("navigate","/",{}, {historyState:{__completeGuideScroll:{x:0,y:11511}},fontsReady,syncRoute:async()=>{page.primaryChanged();return true;}});
    await page.ready;const original=page.listenerCount(input),completion=page.popstate();await settle();
    await page.interact(input);finishFonts();await completion;
    assert.deepEqual(page.restoredPositions,[]);assert.equal(page.listenerCount(input),original);
  });
}
test("reader input during a same-document fetch keeps its new focus and position",async()=>{
  let finishBody;const body=new Promise(resolve=>{finishBody=resolve;});
  let page;page=loadPage("navigate","/",{}, {historyState:{__completeGuideScroll:{x:0,y:11511}},syncRoute:async()=>{await body;page.primaryChanged();return true;}});
  await page.ready;const completion=page.popstate();await page.interact("keydown");finishBody();await completion;
  assert.deepEqual(page.restoredPositions,[]);assert.deepEqual(page.focusedNodes,[]);
});
test("a newer history destination cancels saved same-document restoration still waiting for layout",async()=>{
  let finishFonts;const fontsReady=new Promise(resolve=>{finishFonts=resolve;});
  let page;page=loadPage("navigate","/",{}, {historyState:{__completeGuideScroll:{x:0,y:11511}},fontsReady,syncRoute:async()=>{page.primaryChanged();return true;}});
  await page.ready;const first=page.popstate();await settle();
  page.setLocation("/fragment");page.addTarget("fragment");page.history.state={__completeGuideScroll:{x:0,y:23000}};
  const latest=page.popstate();await settle();finishFonts();await Promise.all([first,latest]);
  assert.deepEqual(page.restoredPositions,[{x:0,y:23000}]);
});
test("a changed URL or newer body revision cannot receive obsolete saved restoration",async()=>{
  for(const change of [page=>page.setLocation("/#new-fragment"),page=>page.primaryChanged()]){
    let finishFonts;const fontsReady=new Promise(resolve=>{finishFonts=resolve;});
    let page;page=loadPage("navigate","/",{}, {historyState:{__completeGuideScroll:{x:0,y:11511}},fontsReady,syncRoute:async()=>{page.primaryChanged();return true;}});
    await page.ready;const completion=page.popstate();await settle();change(page);finishFonts();await completion;
    assert.deepEqual(page.restoredPositions,[]);
  }
});
test("BFCache pageshow during same-document readiness retains native saved scroll",async()=>{
  let finishFonts;const fontsReady=new Promise(resolve=>{finishFonts=resolve;});
  let page;page=loadPage("navigate","/",{}, {historyState:{__completeGuideScroll:{x:0,y:11511}},fontsReady,syncRoute:async()=>{page.primaryChanged();return true;}});
  await page.ready;const completion=page.popstate();await settle();await page.pageshow(true);finishFonts();await completion;
  assert.deepEqual(page.restoredPositions,[]);
});
test("same-document saved restoration also has a bounded font readiness wait",async()=>{
  let page;page=loadPage("navigate","/",{}, {historyState:{__completeGuideScroll:{x:0,y:11511}},fontsReady:new Promise(()=>{}),syncRoute:async()=>{page.primaryChanged();return true;}});
  await page.ready;const completion=page.popstate();await settle();page.advanceTime(349);await settle();assert.deepEqual(page.restoredPositions,[]);
  page.advanceTime(1);await completion;assert.deepEqual(page.restoredPositions,[{x:0,y:11511}]);
});
