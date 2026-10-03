import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createGuideSearch } from "../../src/lib/guide-search.mjs";

const runtime = "const createGuideSearch = (" + createGuideSearch.toString() + ");\n" +
  readFileSync(new URL("../../src/scripts/guide-runtime.js", import.meta.url), "utf8");
function reader({ pathname = "/section", hash = "", search = "", aliases = {}, extraTargets = {}, completeGuideReady,
  syncRoute, initialVideos = [] } = {}) {
  const origin = "https://www.ghezelbaash.ir", listeners = new Map(), windowListeners = new Map(), visited = [],
    scrolledNodes = [], focusedNodes = [], pushed = [], metadata = [], navigationEvents = [], nativeNavigations = [];
  class HTMLVideoElement {}
  const target = (id) => ({ id, closest: () => null, hasAttribute: () => true,
    focus() { focusedNodes.push(this); },
    scrollIntoView() { visited.push(this.id); scrolledNodes.push(this); } });
  const nodes = { section: target("section"), fragment: target("fragment"), "main-content": target("main-content"),
    "old-existing-section-id": target("old-existing-section-id"),
    "guide-search": { dataset: { contentRouteAliases: JSON.stringify(aliases), canonicalOrigin: origin } }, ...extraTargets };
  const addVideo = (id, options = {}) => {
    const videoListeners = new Map(), classes = new Set();
    const video = Object.assign(new HTMLVideoElement(), target(id), {
      currentTime: 0, duration: 90, readyState: 0, poster: "", dataset: { poster: "/poster.jpg" }, playCalls: 0,
      closest: (selector) => selector === "figure" ? { classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) } } : null,
      addEventListener: (name, listener) => videoListeners.set(name, listener),
      removeEventListener: (name, listener) => { if (videoListeners.get(name) === listener) videoListeners.delete(name); },
      play() { this.playCalls++; },
      metadataLoaded() { this.readyState = 1; videoListeners.get("loadedmetadata")?.(); },
      isHighlighted: () => classes.has("video-deeplink-target"),
    }, options);
    nodes[id] = video;
    return video;
  };
  for (const { id, ...options } of initialVideos) addVideo(id, options);
  const location = { origin, pathname, hash, search, href: origin + pathname + search + hash,
    assign: (destination) => nativeNavigations.push(destination) };
  const setLocation = (path) => {
    const next = new URL(path, origin);
    Object.assign(location, { pathname: next.pathname, hash: next.hash, search: next.search, href: next.href });
  };
  const document = {
    documentElement: { classList: { add() {} } },
    getElementById: (id) => nodes[id] || null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener: (type, listener) => { const list = listeners.get(type) || []; list.push(listener); listeners.set(type, list); },
  };
  const history = { pushState(_, __, path) {
    navigationEvents.push({ operation: "push", path });
    pushed.push(path);
    setLocation(path);
  } };
  const window = { completeGuideReady,
    saveGuideScrollState: () => navigationEvents.push({ operation: "save", path: location.pathname }) };
  if (syncRoute !== null) window.syncGuidePageState = (path) => { metadata.push(path); return syncRoute?.(path); };
  const ready = runInNewContext(runtime, {
    document, window, location, history,
    navigator: { userAgent: "" }, Intl, Date, URL, HTMLVideoElement, performance: { getEntriesByType: () => [] },
    addEventListener(type, listener) { const list = windowListeners.get(type) || []; list.push(listener); windowListeners.set(type, list); },
    requestAnimationFrame: () => 1, setTimeout: () => 1, clearTimeout() {}, setInterval() {},
    scrollTo() {}, scrollY: 0, innerHeight: 800,
  });
  return { visited, scrolledNodes, focusedNodes, pushed, metadata, location, ready, navigationEvents, nativeNavigations, setLocation,
    addTarget: (id) => (nodes[id] = target(id)), getTarget: (id) => nodes[id], addVideo,
    popstate: () => Promise.all((windowListeners.get("popstate") || []).map((listener) => listener({}))),
    emit: (type, event = {}) => Promise.all((listeners.get(type) || []).map((listener) => listener(event))) };
}
function click(page, destination) {
  const link = { href: new URL(destination, page.location.origin).href, hasAttribute: () => false };
  const event = { button: 0, target: { closest: () => link }, preventDefault() { this.defaultPrevented = true; } };
  event.completion = page.emit("click", event);
  return event;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((finish, fail) => { resolve = finish; reject = fail; });
  return { promise, resolve, reject };
}
test("home fragment links navigate and synchronize within the existing reader", async () => {
  const page = reader();
  const event = click(page, "/#fragment");
  await event.completion;
  assert(event.defaultPrevented);
  assert.deepEqual(page.pushed, ["/#fragment"]);
  assert.deepEqual(page.metadata, ["/"]);
  assert.equal(page.visited.at(-1), "fragment");
});
test("reader navigation saves the outgoing entry before pushing the destination", async () => {
  const page = reader();
  const event = click(page, "/#fragment");
  await event.completion;
  assert(event.defaultPrevented);
  assert.deepEqual(page.navigationEvents, [
    { operation: "save", path: "/section" }, { operation: "push", path: "/#fragment" },
  ]);
});
test("clicking the current reader URL does not save or create a history entry", async () => {
  const page = reader();
  const event = click(page, "/section");
  await event.completion;
  assert(event.defaultPrevented);
  assert.deepEqual(page.navigationEvents, []);
});
test("guide expansion respects the reader's latest fragment target", () => {
  const page = reader();
  page.location.hash = "#fragment";
  page.emit("guide:expanded");
  assert.equal(page.visited.at(-1), "fragment");
  assert.deepEqual(page.pushed, []);
});
test("direct path positioning waits for its target in the complete guide", async () => {
  let finish;
  const completeGuideReady = new Promise((resolve) => { finish = resolve; });
  const page = reader({ pathname: "/complete-section", completeGuideReady });
  assert.deepEqual(page.visited, []);
  page.addTarget("complete-section");
  finish(true);
  await page.ready;
  assert.deepEqual(page.visited, ["complete-section"]);
  assert.deepEqual(page.pushed, []);
  assert.equal(page.location.pathname, "/complete-section");
});
test("a fresh hash takes precedence after the complete guide becomes available", async () => {
  let finish;
  const completeGuideReady = new Promise((resolve) => { finish = resolve; });
  const page = reader({ hash: "#complete-fragment", completeGuideReady });
  assert.deepEqual(page.visited, []);
  page.addTarget("complete-fragment");
  finish(true);
  await page.ready;
  assert.deepEqual(page.visited, ["complete-fragment"]);
  assert.deepEqual(page.pushed, []);
  assert.equal(page.location.hash, "#complete-fragment");
});
test("a fresh homepage fragment positions within the complete document", async () => {
  const page = reader({ pathname: "/", hash: "#fragment", completeGuideReady: Promise.resolve(true) });
  await page.ready;
  assert.deepEqual(page.visited, ["fragment"]);
  assert.deepEqual(page.pushed, []);
});
test("a canonical language path initially opens its existing authored section", () => {
  const page = reader({ pathname: "/en-aesthetic-guide", aliases: { "/en-aesthetic-guide": "/#old-existing-section-id" } });
  assert.deepEqual(page.visited, ["old-existing-section-id"]);
  assert.deepEqual(page.pushed, []);
  assert.equal(page.location.pathname, "/en-aesthetic-guide");
});
test("a direct canonical language URL opens its mapped disclosure and ancestors before scrolling", async () => {
  const atScroll = [], outer = { tagName: "DETAILS", open: false, parentElement: null };
  const wrapper = { tagName: "SECTION", parentElement: outer };
  const parent = { tagName: "DETAILS", open: false, parentElement: wrapper };
  const disclosure = {
    id: "old-existing-section-id", tagName: "DETAILS", open: false, parentElement: parent,
    closest: (selector) => selector === "details" ? disclosure : null,
    scrollIntoView: () => atScroll.push([disclosure.open, parent.open, outer.open]),
  };
  const page = reader({ pathname: "/en-aesthetic-guide",
    aliases: { "/en-aesthetic-guide": "/#old-existing-section-id" },
    extraTargets: { "old-existing-section-id": disclosure } });
  await page.ready;
  assert.deepEqual(atScroll, [[true, true, true]]);
  assert.deepEqual(page.pushed, []);
  assert.equal(page.location.pathname, "/en-aesthetic-guide");
});
test("clicking a canonical language path moves within the reader and keeps its final URL", async () => {
  const page = reader({ pathname: "/", aliases: { "/en-aesthetic-guide": "/#old-existing-section-id" } });
  const event = click(page, "/en-aesthetic-guide");
  await event.completion;
  assert(event.defaultPrevented);
  assert.deepEqual(page.visited, ["old-existing-section-id"]);
  assert.deepEqual(page.pushed, ["/en-aesthetic-guide"]);
  assert.deepEqual(page.metadata, ["/en-aesthetic-guide"]);
});
test("legacy content aliases can point to an authored home fragment", async () => {
  const page = reader({ pathname: "/", aliases: { "/old/english-guide/": "/#old-existing-section-id" } });
  const event = click(page, "/old/english-guide/");
  await event.completion;
  assert(event.defaultPrevented);
  assert.equal(page.visited.at(-1), "old-existing-section-id");
  assert.deepEqual(page.pushed, ["/old/english-guide/"]);
});
test("legacy aliases follow a canonical language URL to its authored fragment", async () => {
  const page = reader({ pathname: "/", aliases: {
    "/old/english-guide/": "/en-aesthetic-guide", "/en-aesthetic-guide": "/#old-existing-section-id",
  } });
  const event = click(page, "/old/english-guide/");
  await event.completion;
  assert(event.defaultPrevented);
  assert.deepEqual(page.visited, ["old-existing-section-id"]);
  assert.deepEqual(page.pushed, ["/old/english-guide/"]);
});
test("cyclic aliases do not fall back to an unrelated matching heading", async () => {
  const page = reader({ pathname: "/", aliases: { "/fragment": "/section", "/section": "/fragment" } });
  const event = click(page, "/fragment");
  await event.completion;
  assert(!event.defaultPrevented);
  assert.deepEqual(page.visited, []);
  assert.deepEqual(page.pushed, []);
});
test("a fragment takes precedence over a canonical language path's mapped section", async () => {
  const page = reader({ pathname: "/", aliases: { "/en-aesthetic-guide": "/#old-existing-section-id" } });
  const event = click(page, "/en-aesthetic-guide#fragment");
  await event.completion;
  assert(event.defaultPrevented);
  assert.deepEqual(page.visited, ["fragment"]);
  assert.deepEqual(page.pushed, ["/en-aesthetic-guide#fragment"]);
});
test("a mapped fragment decodes the authored target ID", async () => {
  const page = reader({ pathname: "/", aliases: { "/old-guide": "/#" + encodeURIComponent("راهنما") } });
  page.addTarget("راهنما");
  const event = click(page, "/old-guide");
  await event.completion;
  assert(event.defaultPrevented);
  assert.deepEqual(page.visited, ["راهنما"]);
});
test("a known home alias resolves to the main content", async () => {
  const page = reader({ pathname: "/", aliases: { "/old-home": "/" } });
  const event = click(page, "/old-home");
  await event.completion;
  assert(event.defaultPrevented);
  assert.deepEqual(page.visited, ["main-content"]);
});
test("canonical language path positioning waits for its authored section", async () => {
  let finish;
  const completeGuideReady = new Promise((resolve) => { finish = resolve; });
  const page = reader({ pathname: "/en-aesthetic-guide", aliases: { "/en-aesthetic-guide": "/#late-authored-section" }, completeGuideReady });
  assert.deepEqual(page.visited, []);
  page.addTarget("late-authored-section");
  finish(true);
  await page.ready;
  assert.deepEqual(page.visited, ["late-authored-section"]);
  assert.deepEqual(page.pushed, []);
});
for (const destination of ["/#%invalid", "/%invalid#fragment", "https://outside.example/#fragment", "//outside.example/#fragment",
  "javascript:alert(1)", "/?tracking=1#fragment", "/section?tracking=1"]) {
  test("an invalid alias does not navigate: " + destination, async () => {
    const aliases = { "/fragment": destination };
    const initial = reader({ pathname: "/fragment", aliases });
    assert.deepEqual(initial.visited, []);
    const page = reader({ pathname: "/", aliases });
    const event = click(page, "/fragment");
    await event.completion;
    assert(!event.defaultPrevented);
    assert.deepEqual(page.visited, []);
    assert.deepEqual(page.pushed, []);
    assert.deepEqual(page.metadata, []);
  });
}
test("canonical video query navigation reveals the player and waits for metadata before seeking", async () => {
  const page = reader({ pathname: "/" });
  const id = "video-saeed-ghezelbash-subcision-technique", video = page.addVideo(id);
  const href = "/" + id + "?video=subcision-technique&t=120";
  const event = click(page, href);
  await event.completion;
  assert(event.defaultPrevented);
  assert.deepEqual(page.pushed, [href]);
  assert.equal(page.visited.at(-1), id);
  assert.equal(video.poster, "/poster.jpg");
  assert.equal(video.preload, "metadata");
  assert.equal(video.currentTime, 0);
  const beforeMetadata = page.visited.length;
  video.metadataLoaded();
  assert.equal(video.currentTime, 90);
  assert.equal(page.visited.length, beforeMetadata);
  assert.equal(video.playCalls, 0);
});
for (const { destination, id, aliases } of [
  { destination: "/#fragment", id: "fragment", aliases: {} },
  { destination: "/en-aesthetic-guide", id: "old-existing-section-id", aliases: { "/en-aesthetic-guide": "/#old-existing-section-id" } },
]) {
  test("click waits for the replacement article before scrolling and focusing: " + destination, async () => {
    const pending = deferred();
    let currentTarget, metadataReady = false;
    const page = reader({ pathname: "/", aliases, syncRoute: () => pending.promise.then(() => {
      metadataReady = true;
      currentTarget = page.addTarget(id);
    }) });
    const detachedTarget = page.getTarget(id), event = click(page, destination);
    assert(event.defaultPrevented);
    assert.deepEqual(page.pushed, [destination]);
    assert.equal(metadataReady, false);
    assert.deepEqual(page.scrolledNodes, []);
    assert.deepEqual(page.focusedNodes, []);
    pending.resolve(true);
    await event.completion;
    assert.equal(metadataReady, true);
    assert.deepEqual(page.scrolledNodes, [currentTarget]);
    assert.deepEqual(page.focusedNodes, [currentTarget]);
    assert.notEqual(currentTarget, detachedTarget);
  });
}
test("video clicks resolve the replacement player after the article is ready", async () => {
  const pending = deferred(), id = "video-saeed-ghezelbash-subcision-technique";
  let currentVideo;
  const page = reader({ pathname: "/", syncRoute: () => pending.promise.then(() => {
    currentVideo = page.addVideo(id);
  }) });
  const detachedVideo = page.addVideo(id), event = click(page, "/" + id + "?video=subcision-technique&t=6");
  assert(event.defaultPrevented);
  assert.deepEqual(page.scrolledNodes, []);
  assert.deepEqual(page.focusedNodes, []);
  assert.equal(detachedVideo.isHighlighted(), false);
  pending.resolve(true);
  await event.completion;
  assert.equal(currentVideo.isHighlighted(), true);
  assert.equal(detachedVideo.isHighlighted(), false);
  assert(page.scrolledNodes.length > 0);
  assert(page.scrolledNodes.every((node) => node === currentVideo));
  assert.deepEqual(page.focusedNodes, [currentVideo]);
  detachedVideo.metadataLoaded();
  assert.equal(detachedVideo.currentTime, 0);
  assert.equal(currentVideo.currentTime, 0);
  currentVideo.metadataLoaded();
  assert.equal(currentVideo.currentTime, 6);
  assert.equal(currentVideo.playCalls, 0);
});
test("a fresh video URL resolves its player after complete-guide readiness", async () => {
  const pending = deferred(), id = "video-saeed-ghezelbash-subcision-technique";
  const page = reader({ pathname: "/" + id, search: "?video=subcision-technique&t=6",
    completeGuideReady: pending.promise, initialVideos: [{ id, readyState: 1 }] });
  const detachedVideo = page.getTarget(id), currentVideo = page.addVideo(id, { readyState: 1 });
  assert.deepEqual(page.scrolledNodes, []);
  pending.resolve(true);
  await page.ready;
  assert.equal(currentVideo.currentTime, 6);
  assert.equal(currentVideo.isHighlighted(), true);
  assert.equal(detachedVideo.currentTime, 0);
  assert.equal(detachedVideo.isHighlighted(), false);
  assert(page.scrolledNodes.length > 0);
  assert(page.scrolledNodes.every((node) => node === currentVideo));
  assert.deepEqual(page.focusedNodes, [currentVideo]);
});
test("reader navigation remains usable when the page-state helper is unavailable", async () => {
  const page = reader({ pathname: "/", syncRoute: null });
  const event = click(page, "/#fragment");
  await event.completion;
  assert(event.defaultPrevented);
  assert.deepEqual(page.pushed, ["/#fragment"]);
  assert.deepEqual(page.metadata, []);
  assert.deepEqual(page.scrolledNodes, [page.getTarget("fragment")]);
  assert.deepEqual(page.focusedNodes, [page.getTarget("fragment")]);
});
test("a rejected article commit loads the physical destination without positioning the previous DOM", async () => {
  const page = reader({ pathname: "/", syncRoute: async () => false });
  const event = click(page, "/#fragment");
  await event.completion;
  assert(event.defaultPrevented);
  assert.deepEqual(page.pushed, ["/#fragment"]);
  assert.deepEqual(page.nativeNavigations, ["/#fragment"]);
  assert.deepEqual(page.scrolledNodes, []);
  assert.deepEqual(page.focusedNodes, []);
});
test("racing A to B to A clicks only position the latest A even when the old URL matches", async () => {
  const pending = [deferred(), deferred(), deferred()];
  let next = 0;
  const page = reader({ pathname: "/", syncRoute: () => pending[next++].promise });
  const first = click(page, "/fragment"), second = click(page, "/section"), latest = click(page, "/fragment");
  const liveTarget = page.addTarget("fragment");
  pending[2].resolve(true);
  await latest.completion;
  assert.deepEqual(page.scrolledNodes, [liveTarget]);
  assert.deepEqual(page.focusedNodes, [liveTarget]);
  pending[0].resolve(true);
  pending[1].resolve(true);
  await Promise.all([first.completion, second.completion]);
  assert.deepEqual(page.scrolledNodes, [liveTarget]);
  assert.deepEqual(page.focusedNodes, [liveTarget]);
  assert.equal(page.location.pathname, "/fragment");
});
test("a location change during an article fetch prevents obsolete click positioning", async () => {
  const pending = deferred(), page = reader({ pathname: "/", syncRoute: () => pending.promise });
  const event = click(page, "/fragment");
  page.setLocation("/section");
  pending.resolve(false);
  await event.completion;
  assert.deepEqual(page.nativeNavigations, []);
  assert.deepEqual(page.scrolledNodes, []);
  assert.deepEqual(page.focusedNodes, []);
});
test("primary-article replacement refreshes the reader without unsolicited scrolling", async () => {
  const page = reader({ pathname: "/" });
  page.setLocation("/fragment");
  page.addTarget("fragment");
  await page.emit("guide:primary-changed");
  assert.deepEqual(page.scrolledNodes, []);
  assert.deepEqual(page.focusedNodes, []);
});
test("an asynchronously reconstructed disclosure opens its live ancestors before scrolling and focus", async () => {
  const pending = deferred(), outer = { tagName: "DETAILS", open: false, parentElement: null }, observations = [];
  let currentTarget;
  const page = reader({ pathname: "/", syncRoute: () => pending.promise.then(() => {
    currentTarget = page.addTarget("fragment");
    const originalScroll = currentTarget.scrollIntoView, originalFocus = currentTarget.focus;
    Object.assign(currentTarget, { tagName: "DETAILS", open: false, parentElement: outer,
      closest: (selector) => selector === "details" ? currentTarget : null,
      scrollIntoView() { observations.push(["scroll", this.open, outer.open]); originalScroll.call(this); },
      focus() { observations.push(["focus", this.open, outer.open]); originalFocus.call(this); },
    });
  }) });
  const event = click(page, "/#fragment");
  assert.deepEqual(observations, []);
  pending.resolve(true);
  await event.completion;
  assert.deepEqual(observations, [["scroll", true, true], ["focus", true, true]]);
  assert.deepEqual(page.scrolledNodes, [currentTarget]);
  assert.deepEqual(page.focusedNodes, [currentTarget]);
});
test("leaving a video while metadata is pending cancels its obsolete seek and highlight", async () => {
  const page = reader({ pathname: "/" }), id = "video-saeed-ghezelbash-subcision-technique", video = page.addVideo(id);
  await click(page, "/" + id + "?video=subcision-technique&t=6").completion;
  assert.equal(video.isHighlighted(), true);
  await click(page, "/#fragment").completion;
  video.metadataLoaded();
  assert.equal(video.currentTime, 0);
  assert.equal(video.isHighlighted(), false);
  assert.equal(video.playCalls, 0);
});
test("a newer timestamp on the same player replaces its pending metadata seek", async () => {
  const page = reader({ pathname: "/" }), id = "video-saeed-ghezelbash-subcision-technique", video = page.addVideo(id);
  await click(page, "/" + id + "?video=subcision-technique&t=6").completion;
  await click(page, "/" + id + "?video=subcision-technique&t=15").completion;
  assert.equal(video.currentTime, 0);
  video.metadataLoaded();
  assert.equal(video.currentTime, 15);
  assert.equal(video.isHighlighted(), true);
  assert.equal(video.playCalls, 0);
});
test("video popstate seeks and highlights the live player after sync while preserving native scroll", async () => {
  const pending = deferred(), id = "video-saeed-ghezelbash-subcision-technique";
  let currentVideo;
  const page = reader({ pathname: "/", syncRoute: () => pending.promise.then(() => {
    currentVideo = page.addVideo(id, { readyState: 1 });
  }) });
  const detachedVideo = page.addVideo(id, { readyState: 1 });
  page.setLocation("/" + id + "?video=subcision-technique&t=9");
  const completion = page.popstate();
  assert.deepEqual(page.focusedNodes, []);
  assert.equal(detachedVideo.currentTime, 0);
  pending.resolve(true);
  await completion;
  assert.equal(currentVideo.currentTime, 9);
  assert.equal(currentVideo.isHighlighted(), true);
  assert.equal(currentVideo.playCalls, 0);
  assert.equal(detachedVideo.currentTime, 0);
  assert.equal(detachedVideo.isHighlighted(), false);
  assert.deepEqual(page.focusedNodes, [currentVideo]);
  assert.deepEqual(page.scrolledNodes, []);
});
test("a failed asynchronous document load falls back to the full physical video URL", async () => {
  const pending = deferred(), page = reader({ pathname: "/", syncRoute: () => pending.promise.catch(() => false) });
  const id = "video-saeed-ghezelbash-subcision-technique", oldVideo = page.addVideo(id, { readyState: 1 });
  const destination = "/" + id + "?video=subcision-technique&t=6", event = click(page, destination);
  assert(event.defaultPrevented);
  assert.equal(page.location.pathname, "/" + id);
  assert.equal(page.getTarget(id), oldVideo);
  assert.deepEqual(page.nativeNavigations, []);
  assert.deepEqual(page.focusedNodes, []);
  pending.reject(new Error("Focused document fetch failed"));
  await event.completion;
  assert.deepEqual(page.nativeNavigations, [destination]);
  assert.deepEqual(page.scrolledNodes, []);
  assert.deepEqual(page.focusedNodes, []);
  assert.equal(oldVideo.currentTime, 0);
  assert.equal(oldVideo.isHighlighted(), false);
});
test("an obsolete failed A to B to A click never starts native navigation even when its URL matches", async () => {
  const pending = [deferred(), deferred(), deferred()];
  let next = 0;
  const page = reader({ pathname: "/", syncRoute: () => pending[next++].promise });
  const first = click(page, "/fragment"), second = click(page, "/section"), latest = click(page, "/fragment");
  pending[0].resolve(false);
  await first.completion;
  assert.deepEqual(page.nativeNavigations, []);
  assert.deepEqual(page.scrolledNodes, []);
  const liveTarget = page.addTarget("fragment");
  pending[2].resolve(true);
  await latest.completion;
  pending[1].resolve(false);
  await second.completion;
  assert.deepEqual(page.nativeNavigations, []);
  assert.deepEqual(page.scrolledNodes, [liveTarget]);
  assert.deepEqual(page.focusedNodes, [liveTarget]);
});
