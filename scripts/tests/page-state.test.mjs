import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const source = readFileSync(new URL("../../src/scripts/page-state.js", import.meta.url), "utf8");
const origin = "https://www.ghezelbaash.ir";
const botoxBody = '<section id="botox-source-wrapper"><h2 id="botox">Botox</h2><p id="botox-summary">Botox requires a clinical assessment before treatment.</p><div id="diagnostic-group"><h3 id="botox-assessment">Assessment and contraindications</h3><p id="botox-assessment-body">Review muscle function, prior treatment and the patient’s goals.</p><details id="botox-faq"><summary>Can everyone have treatment?</summary><p id="botox-faq-answer">Treatment can be deferred after an individual assessment.</p></details></div></section>';
const fillerBody = '<section id="filler-source-wrapper"><h2 id="filler">Filler</h2><p id="filler-summary">Volume, structural support and treatment risks require assessment.</p></section>';
const englishBody = '<section id="english-source-wrapper" lang="en" dir="ltr"><h2 id="english">English</h2><p id="english-summary">This English guide explains assessment and clinical boundaries.</p></section>';
const videoBody = '<section id="watch-source-wrapper"><h2 id="patient-review">Patient review</h2><video id="patient-video" controls></video><p id="video-transcript">A patient describes their experience.</p></section>';
// The nested botox ranges deliberately leave a separately indexed child behind.
// Inline JSON-LD is a childNode before every range, as in the compiled home.
const fullContent = '<script type="application/ld+json">{"@graph":[{"@id":"home"}]}</script><h1 id="home-title">Home</h1><p id="home-introduction">The complete clinical guide.</p><section id="clinical-chapter"><h2 id="chapter-title">Clinical treatments</h2><p id="chapter-introduction">Choose a topic after understanding its clinical purpose.</p>' + botoxBody.replace('</section>', '<section id="retained-child-topic"><h3 id="separate-child">A separately indexed procedure</h3><p>Its substantive guidance belongs in the surrounding reader.</p></section></section>') + fillerBody + '<details id="translations"><summary>Translations</summary>' + englishBody + '</details></section><section id="clinic-information"><h2>Clinic information</h2><p>Appointment and follow-up information.</p></section>' + videoBody;
const signature = createHash("sha256").update(fullContent).digest("hex");
const boundary = (path, offset) => ({ path, offset });
const scopes = {
  botox: { ranges: [
    { start: boundary([3, 2], 0), end: boundary([3, 2], 2) },
    { start: boundary([3, 2, 2], 0), end: boundary([3, 2, 2], 3) },
  ], insertion: boundary([3, 2], 0) },
  filler: { ranges: [{ start: boundary([3], 3), end: boundary([3], 4) }], insertion: boundary([3], 3) },
  english: { ranges: [{ start: boundary([3, 4], 1), end: boundary([3, 4], 2) }], insertion: boundary([3, 4], 1) },
  "patient-review": { ranges: [{ start: boundary([], 5), end: boundary([], 6) }], insertion: boundary([], 5) },
};
const home = '<html lang="fa-IR" dir="rtl"><head><title>Home</title><meta name="guide-source-signature" content="' + signature + '"><link rel="canonical" href="' + origin + '/"></head><body lang="fa-IR" dir="rtl"><div class="guide-reader" data-guide-reader><main id="main-content"><article class="medical-guide" data-guide-primary lang="fa-IR" dir="rtl" aria-labelledby="home-title">' + fullContent + '</article></main></div><input id="guide-search-input"></body></html>';
const bodies = { botox: botoxBody, filler: fillerBody, english: englishBody, "patient-review": videoBody };
function focused(title, slug, lang = "fa-IR", dir = "rtl", alternates = [], scope = scopes[slug]) {
  return '<html lang="' + lang + '" dir="' + dir + '" data-route-view="focused"><head><title>' + title + '</title><meta name="guide-source-signature" content="' + signature + '"><meta name="description" content="' + title + '"><link rel="canonical" href="' + origin + '/' + slug + '">' + alternates.map(({ href, hrefLang }) => '<link rel="alternate" hreflang="' + hrefLang + '" href="' + href + '">').join("") + '<script type="application/ld+json">{"@graph":[{"@id":"' + slug + '"}]}</script><script id="guide-reader-scope" type="application/json">' + JSON.stringify({ schemaVersion: 1, sourceSignature: signature, ...scope }) + '</script></head><body lang="' + lang + '" dir="' + dir + '"><div class="guide-reader" data-guide-reader><main id="main-content"><article class="medical-guide" data-guide-primary lang="' + lang + '" dir="' + dir + '" aria-labelledby="route-page-title"><header data-route-context lang="' + lang + '" dir="' + dir + '"><h1 id="route-page-title">' + title + '</h1><a href="/" data-guide-expand data-loading="Loading…" data-error="Retry">Show the complete guide</a><p data-guide-expand-status></p></header>' + bodies[slug] + '</article></main></div><input id="guide-search-input"></body></html>';
}
const englishAlternates = [{ href: origin + "/english", hrefLang: "en" }, { href: origin + "/arabic", hrefLang: "ar-IQ" }];
let browser;
before(async () => {
  const executablePath = [process.env.CHROMIUM_EXECUTABLE_PATH, "/usr/bin/chromium", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome", process.env.BROWSER_EXECUTABLE, chromium.executablePath()].find((path) => path && existsSync(path));
  assert(executablePath, "page-state tests require Chromium (or CHROMIUM_EXECUTABLE_PATH / BROWSER_EXECUTABLE)");
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
});
after(async () => { await browser?.close(); });

// Execute production code in a browser: native Range, live boundary adjustment,
// DocumentFragment insertion, event propagation and player identity are required.
// Only network and the production request timeout clock are controlled here.
async function reader(t, { initial = focused("Botox", "botox"), path = "/botox", fullHome = home, failPaths = [], blockedHeaders = [], blockedBodies = [], historyState = null, pages = {}, runtimeOrigin = origin } = {}) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route(runtimeOrigin + "/**", (route) => route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: initial }));
  await page.goto(runtimeOrigin + path, { waitUntil: "domcontentloaded" });
  await page.evaluate(({ fullHome, failPaths, blockedHeaders, blockedBodies, historyState, pages }) => {
    const state = window.__readerTest = { requests: [], signals: [], timers: new Map(), nextTimer: 0, clock: 0, scrollAdjustments: [], historyReplacements: [], gates: new Map(), failures: new Map(), pages };
    for (const path of failPaths) state.failures.set(path, (state.failures.get(path) || 0) + 1);
    for (const stage of ["headers", "body"]) for (const path of stage === "headers" ? blockedHeaders : blockedBodies) {
      let resolve;
      const promise = new Promise((done) => { resolve = done; });
      state.gates.set(stage + path, { promise, resolve });
    }
    const wait = (path, stage, signal) => new Promise((resolve, reject) => {
      const aborted = () => reject(new Error("Aborted HTML request"));
      if (signal?.aborted) { aborted(); return; }
      signal?.addEventListener("abort", aborted, { once: true });
      Promise.resolve(state.gates.get(stage + path)?.promise).then(() => {
        signal?.removeEventListener("abort", aborted);
        if (signal?.aborted) aborted(); else resolve();
      });
    });
    window.fetch = async (path, { signal } = {}) => {
      state.requests.push(path);
      state.signals.push({ path, signal });
      await wait(path, "headers", signal);
      const failures = state.failures.get(path) || 0;
      if (failures) { state.failures.set(path, failures - 1); return { ok: false }; }
      return { ok: true, text: async () => { await wait(path, "body", signal); return path === "/" ? fullHome : state.pages[path]; } };
    };
    window.setTimeout = (callback, delay) => { const id = ++state.nextTimer; state.timers.set(id, { callback, at: state.clock + delay }); return id; };
    window.clearTimeout = (id) => state.timers.delete(id);
    state.advance = (duration) => {
      state.clock += duration;
      for (const [id, timer] of state.timers) if (timer.at <= state.clock) { state.timers.delete(id); timer.callback(); }
    };
    state.release = (path, stage = "headers") => state.gates.get(stage + path)?.resolve();
    state.nativeScrollBy = window.scrollBy.bind(window);
    window.scrollBy = (options) => { state.scrollAdjustments.push(options.top); state.nativeScrollBy(options); };
    const replace = history.replaceState.bind(history);
    history.replaceState(historyState, "");
    history.replaceState = (stateValue, title, path) => { state.historyReplacements.push({ state: stateValue, title, path }); return replace(stateValue, title, path); };
    const article = document.querySelector("main article.medical-guide");
    state.initialArticle = article;
    state.initialNodes = [...article.querySelectorAll("[id]")];
    state.initialBody = [...article.children].filter((node) => !node.hasAttribute("data-route-context") && !node.matches('script[type="application/ld+json"]')).map((node) => node.outerHTML).join("");
  }, { fullHome, failPaths, blockedHeaders, blockedBodies, historyState, pages: { "/botox": focused("Botox", "botox"), "/filler": focused("Filler", "filler"), "/english": focused("English", "english", "en", "ltr", englishAlternates), "/patient-review": focused("Patient review", "patient-review"), ...pages } });
  await page.addScriptTag({ content: source });
  return { page, errors,
    ready: () => page.evaluate(() => window.completeGuideReady),
    expand: () => page.evaluate(() => window.expandCompleteGuide()),
    requests: () => page.evaluate(() => window.__readerTest.requests),
    release: (path = "/", stage = "headers") => page.evaluate(({ path, stage }) => window.__readerTest.release(path, stage), { path, stage }),
    advance: (duration) => page.evaluate((duration) => window.__readerTest.advance(duration), duration),
    navigate: (path) => page.evaluate(async (path) => { history.pushState(null, "", path); return window.syncGuidePageState(path); }, path),
  };
}
async function stateFor(page) {
  return page.evaluate(() => {
    const article = document.querySelector("main article.medical-guide"), contexts = [...document.querySelectorAll("[data-guide-context]")];
    const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
    return {
      title: document.title, path: location.pathname, canonical: document.querySelector('link[rel="canonical"]').href,
      documentLang: document.documentElement.lang, documentDir: document.documentElement.dir, bodyLang: document.body.lang, bodyDir: document.body.dir,
      articleLang: article.lang, articleDir: article.dir, articleLabel: article.getAttribute("aria-labelledby"),
      primaryText: [...article.childNodes].filter((node) => node.nodeType !== 1 || node.localName !== "script").map((node) => node.textContent).join(""), primaryH1s: article.querySelectorAll("h1").length,
      primaryBody: [...article.children].filter((node) => !node.hasAttribute("data-route-context") && !node.matches('script[type="application/ld+json"]')).map((node) => node.outerHTML).join(""),
      contexts: contexts.map((node) => ({ side: node.getAttribute("data-guide-context"), lang: node.lang, dir: node.dir, text: node.textContent, insideMain: !!node.closest("main"), h1s: node.querySelectorAll("h1").length })),
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      articles: document.querySelectorAll("article.medical-guide").length, mains: document.querySelectorAll("main").length,
      graphs: [...document.querySelectorAll('script[type="application/ld+json"]')].map((node) => JSON.parse(node.textContent)),
      metas: [...document.head.querySelectorAll('meta[name="description"],meta[property^="og:"],meta[property^="profile:"],meta[name^="twitter:"]')].map((node) => ({ name: node.getAttribute("name") || node.getAttribute("property"), content: node.content })),
      alternates: [...document.head.querySelectorAll('link[rel="alternate"][hreflang]')].map((node) => ({ language: node.hreflang, href: node.href })),
      expanded: document.querySelectorAll("[data-guide-expand]").length,
      routeView: document.documentElement.dataset.routeView ?? null,
      timers: window.__readerTest.timers.size,
    };
  });
}
function assertLandmarks(state, { title = "Botox", path = "/botox", lang = "fa-IR", dir = "rtl" } = {}) {
  assert.equal(state.title, title);
  assert.equal(state.path, path);
  assert.equal(state.canonical, origin + path);
  assert.equal(state.documentLang, lang);
  assert.equal(state.documentDir, dir);
  assert.equal(state.bodyLang, lang);
  assert.equal(state.bodyDir, dir);
  assert.equal(state.articleLang, lang);
  assert.equal(state.articleDir, dir);
  assert.equal(state.articles, 1);
  assert.equal(state.mains, 1);
  assert.equal(state.primaryH1s, 1);
  assert.equal(state.articleLabel, "route-page-title");
  assert.deepEqual(state.contexts.map(({ side }) => side), ["before", "after"]);
  assert(state.contexts.every((context) => !context.insideMain && context.lang === "fa-IR" && context.dir === "rtl" && context.h1s === 0));
  assert.deepEqual(state.duplicateIds, []);
  assert.equal(state.graphs.length, 1);
  assert.equal(state.graphs[0]["@graph"][0]["@id"], path.slice(1));
  assert.equal(state.expanded, 0);
  assert.equal(state.timers, 0);
}

test("fresh direct entry keeps the bounded native topic as primary and adds surrounding sibling landmarks", async (t) => {
  const readerPage = await reader(t);
  assert.equal(await readerPage.ready(), true);
  const state = await stateFor(readerPage.page);
  assertLandmarks(state);
  assert.equal(state.primaryBody, botoxBody);
  assert(!state.primaryText.includes("Volume, structural support"));
  assert(state.contexts[0].text.includes("The complete clinical guide"));
  assert(state.contexts[1].text.includes("Volume, structural support"));
  assert(state.contexts[1].text.includes("A separately indexed procedure"));
  assert(state.contexts.every((context) => !context.text.includes("Botox requires") && !context.text.includes("Can everyone have treatment?")));
  assert.equal(await readerPage.page.evaluate(() => document.querySelector("main article") === window.__readerTest.initialArticle && window.__readerTest.initialNodes.every((node) => node.isConnected)), true);
  assert.deepEqual(await readerPage.requests(), ["/"]);
  assert.deepEqual(readerPage.errors, []);
});
test("automatic loading and concurrent expansion share one request and dispatch one expansion", async (t) => {
  const readerPage = await reader(t, { blockedHeaders: ["/"] });
  await readerPage.page.evaluate(() => { window.__readerTest.expansions = 0; document.addEventListener("guide:expanded", () => window.__readerTest.expansions++); document.querySelector("[data-guide-expand]").click(); });
  await readerPage.release();
  assert.deepEqual(await readerPage.page.evaluate(() => Promise.all([window.expandCompleteGuide(), window.expandCompleteGuide()])), [true, true]);
  assert.equal(await readerPage.page.evaluate(() => window.__readerTest.expansions), 1);
  assertLandmarks(await stateFor(readerPage.page));
  await readerPage.expand();
  assert.deepEqual(await readerPage.requests(), ["/"]);
});
test("all nested boundaries resolve before removals and repeated wrappers never duplicate IDs", async (t) => {
  const readerPage = await reader(t);
  await readerPage.ready();
  const result = await readerPage.page.evaluate(() => ({
    nodes: ["botox", "botox-summary", "botox-assessment", "botox-assessment-body", "botox-faq", "botox-faq-answer"].map((id) => ({ id, count: document.querySelectorAll('[id="' + id + '"]').length, primary: !!document.getElementById(id)?.closest("main") })),
    childOutside: !!document.getElementById("separate-child")?.closest("[data-guide-context=after]"),
    body: document.querySelector("main article").querySelector("#diagnostic-group").textContent,
  }));
  assert(result.nodes.every(({ count, primary }) => count === 1 && primary));
  assert.equal(result.childOutside, true);
  assert(result.body.includes("Review muscle function"));
  assert.deepEqual((await stateFor(readerPage.page)).duplicateIds, []);
});
test("FAQ disclosure state and its native subtree survive surrounding-guide loading", async (t) => {
  const readerPage = await reader(t, { blockedHeaders: ["/"] });
  await readerPage.page.evaluate(() => { window.__readerTest.faq = document.getElementById("botox-faq"); window.__readerTest.answer = document.getElementById("botox-faq-answer"); window.__readerTest.faq.open = true; });
  await readerPage.release();
  await readerPage.ready();
  assert.equal(await readerPage.page.evaluate(() => document.getElementById("botox-faq") === window.__readerTest.faq && document.getElementById("botox-faq-answer") === window.__readerTest.answer && window.__readerTest.faq.open), true);
});
test("watch-page expansion preserves its existing player object and playback state", async (t) => {
  const readerPage = await reader(t, { initial: focused("Patient review", "patient-review"), path: "/patient-review", blockedHeaders: ["/"] });
  await readerPage.page.evaluate(() => {
    const player = window.__readerTest.player = document.getElementById("patient-video");
    player.currentTime = 37;
    Object.defineProperty(player, "paused", { configurable: true, value: false });
  });
  await readerPage.release();
  await readerPage.ready();
  assert.deepEqual(await readerPage.page.evaluate(() => ({ same: document.getElementById("patient-video") === window.__readerTest.player, time: window.__readerTest.player.currentTime, paused: window.__readerTest.player.paused, count: document.querySelectorAll("#patient-video").length, primary: !!window.__readerTest.player.closest("main") })), { same: true, time: 37, paused: false, count: 1, primary: true });
  assertLandmarks(await stateFor(readerPage.page), { title: "Patient review", path: "/patient-review" });
});
test("English direct entry retains English primary language and Persian supplemental language", async (t) => {
  const readerPage = await reader(t, { initial: focused("English", "english", "en", "ltr"), path: "/english" });
  await readerPage.ready();
  const state = await stateFor(readerPage.page);
  assertLandmarks(state, { title: "English", path: "/english", lang: "en", dir: "ltr" });
  assert.equal(state.primaryBody, englishBody);
  assert(!state.primaryText.includes("Volume, structural support"));
});
test("home is already complete, has no supplemental landmarks and never fetches itself", async (t) => {
  const readerPage = await reader(t, { initial: home, path: "/" });
  assert.equal(await readerPage.ready(), true);
  assert.equal(await readerPage.expand(), true);
  const state = await stateFor(readerPage.page);
  assert.equal(state.contexts.length, 0);
  assert.equal(state.primaryH1s, 1);
  assert.equal(state.primaryText.includes("Volume, structural support"), true);
  assert.equal(state.canonical, origin + "/");
  assert.deepEqual(await readerPage.requests(), []);
});
test("topic-to-topic and Back repartition pristine home while restoring each bounded body", async (t) => {
  const readerPage = await reader(t);
  await readerPage.ready();
  assert.equal(await readerPage.navigate("/english"), true);
  let state = await stateFor(readerPage.page);
  assertLandmarks(state, { title: "English", path: "/english", lang: "en", dir: "ltr" });
  assert.equal(state.primaryBody, englishBody);
  assert(state.contexts.some((context) => context.text.includes("Botox requires")));
  assert(state.contexts.every((context) => !context.text.includes("This English guide")));
  assert.equal(await readerPage.navigate("/filler"), true);
  state = await stateFor(readerPage.page);
  assertLandmarks(state, { title: "Filler", path: "/filler" });
  assert.equal(state.primaryBody, fillerBody);
  await readerPage.page.evaluate(async () => { history.replaceState(null, "", "/botox"); await window.syncGuidePageState("/botox"); });
  state = await stateFor(readerPage.page);
  assertLandmarks(state);
  assert.equal(state.primaryBody, botoxBody);
  assert.deepEqual(await readerPage.requests(), ["/", "/english", "/filler"]);
});
test("home-to-topic-to-home restores sole full primary without stale route header or asides", async (t) => {
  const readerPage = await reader(t, { initial: home, path: "/" });
  await readerPage.ready();
  assert.equal(await readerPage.navigate("/english"), true);
  assertLandmarks(await stateFor(readerPage.page), { title: "English", path: "/english", lang: "en", dir: "ltr" });
  assert.equal(await readerPage.navigate("/"), true);
  const state = await stateFor(readerPage.page);
  assert.equal(state.contexts.length, 0);
  assert.equal(state.articles, 1);
  assert.equal(state.primaryH1s, 1);
  assert.equal(state.articleLang, "fa-IR");
  assert.equal(state.articleDir, "rtl");
  assert.equal(state.articleLabel, "home-title");
  assert.equal(state.title, "Home");
  assert.equal(state.canonical, origin + "/");
  assert.equal(state.primaryText.includes("Botox requires"), true);
  assert.equal(await readerPage.page.locator("[data-route-context]").count(), 0);
  assert.deepEqual(state.duplicateIds, []);
  assert.deepEqual(await readerPage.requests(), ["/english"]);
});
test("a playing player remains native when its watch page moves into supplemental context and back", async (t) => {
  const readerPage = await reader(t, { initial: focused("Patient review", "patient-review"), path: "/patient-review" });
  await readerPage.ready();
  await readerPage.page.evaluate(() => { window.__readerTest.player = document.getElementById("patient-video"); window.__readerTest.player.currentTime = 37; Object.defineProperty(window.__readerTest.player, "paused", { configurable: true, value: false }); });
  await readerPage.navigate("/filler");
  assert.equal(await readerPage.page.evaluate(() => document.getElementById("patient-video") === window.__readerTest.player && !!window.__readerTest.player.closest("[data-guide-context]")), true);
  await readerPage.navigate("/patient-review");
  assert.equal(await readerPage.page.evaluate(() => document.getElementById("patient-video") === window.__readerTest.player && !!window.__readerTest.player.closest("main") && window.__readerTest.player.currentTime === 37 && !window.__readerTest.player.paused), true);
  assert.deepEqual((await stateFor(readerPage.page)).duplicateIds, []);
});
test("failed expansion retains readable native primary and supports explicit retry", async (t) => {
  const readerPage = await reader(t, { failPaths: ["/"] });
  assert.equal(await readerPage.ready(), false);
  let state = await stateFor(readerPage.page);
  assert.equal(state.primaryBody, botoxBody);
  assert.equal(state.contexts.length, 0);
  assert.equal(state.routeView, "focused");
  assert.equal(await readerPage.page.locator("[data-guide-expand-status]").textContent(), "Retry");
  assert.equal(await readerPage.expand(), true);
  state = await stateFor(readerPage.page);
  assertLandmarks(state);
  assert.equal(state.primaryBody, botoxBody);
  assert.deepEqual(await readerPage.requests(), ["/", "/"]);
});
for (const stage of ["headers", "body"]) test("a stalled home " + stage + " times out without damaging primary and retries successfully", async (t) => {
  const readerPage = await reader(t, stage === "headers" ? { blockedHeaders: ["/"] } : { blockedBodies: ["/"] });
  assert.equal(await readerPage.page.locator("main article").getAttribute("aria-busy"), "true");
  await readerPage.advance(14999);
  assert.equal(await readerPage.page.evaluate(() => window.__readerTest.signals[0].signal.aborted), false);
  await readerPage.advance(1);
  assert.equal(await readerPage.ready(), false);
  assert.equal(await readerPage.page.evaluate(() => window.__readerTest.signals[0].signal.aborted), true);
  const state = await stateFor(readerPage.page);
  assert.equal(state.primaryBody, botoxBody);
  assert.equal(state.contexts.length, 0);
  assert.equal(state.timers, 0);
  assert.equal(await readerPage.page.locator("main article").getAttribute("aria-busy"), null);
  assert.equal(await readerPage.page.locator("[data-guide-expand-status]").textContent(), "Retry");
  await readerPage.release("/", stage);
  assert.equal(await readerPage.expand(), true);
  assertLandmarks(await stateFor(readerPage.page));
  assert.deepEqual(await readerPage.requests(), ["/", "/"]);
});
test("mismatched source signatures reject supplemental expansion before any primary mutation", async (t) => {
  const readerPage = await reader(t, { fullHome: home.replace('content="' + signature + '"', 'content="' + "f".repeat(64) + '"') });
  assert.equal(await readerPage.ready(), false);
  const state = await stateFor(readerPage.page);
  assert.equal(state.primaryBody, botoxBody);
  assert.equal(state.contexts.length, 0);
  assert.equal(state.routeView, "focused");
  assert.deepEqual(state.duplicateIds, []);
  assert.equal(await readerPage.page.evaluate(() => document.querySelector("main article") === window.__readerTest.initialArticle && window.__readerTest.initialNodes.every((node) => node.isConnected)), true);
});
test("an invalid later boundary cannot partly remove or duplicate source or focused content", async (t) => {
  const invalid = { ...scopes.botox, ranges: [...scopes.botox.ranges, { start: boundary([999], 0), end: boundary([999], 1) }] };
  const readerPage = await reader(t, { initial: focused("Botox", "botox", "fa-IR", "rtl", [], invalid) });
  assert.equal(await readerPage.ready(), false);
  const state = await stateFor(readerPage.page);
  assert.equal(state.primaryBody, botoxBody);
  assert.equal(state.contexts.length, 0);
  assert.deepEqual(state.duplicateIds, []);
});
test("a stale metadata response cannot replace the latest primary or its supplemental partition", async (t) => {
  const readerPage = await reader(t, { initial: home, path: "/", blockedBodies: ["/english"] });
  await readerPage.ready();
  await readerPage.page.evaluate(() => { history.pushState(null, "", "/english"); window.__readerTest.pending = window.syncGuidePageState("/english"); });
  assert.equal(await readerPage.navigate("/filler"), true);
  await readerPage.release("/english", "body");
  assert.equal(await readerPage.page.evaluate(() => window.__readerTest.pending), false);
  const state = await stateFor(readerPage.page);
  assertLandmarks(state, { title: "Filler", path: "/filler" });
  assert.equal(state.primaryBody, fillerBody);
});
test("timed-out route HTML leaves the latest complete route usable and evicts its failed fetch", async (t) => {
  const readerPage = await reader(t, { initial: home, path: "/", blockedBodies: ["/english"] });
  await readerPage.ready();
  await readerPage.page.evaluate(() => { history.pushState(null, "", "/english"); window.__readerTest.pending = window.syncGuidePageState("/english"); });
  await readerPage.navigate("/filler");
  await readerPage.advance(15000);
  assert.equal(await readerPage.page.evaluate(() => window.__readerTest.pending), false);
  assertLandmarks(await stateFor(readerPage.page), { title: "Filler", path: "/filler" });
  await readerPage.release("/english", "body");
  assert.equal(await readerPage.navigate("/english"), true);
  assertLandmarks(await stateFor(readerPage.page), { title: "English", path: "/english", lang: "en", dir: "ltr" });
  assert.deepEqual(await readerPage.requests(), ["/english", "/filler", "/english"]);
});
test("search focus during automatic loading shares the home request without altering primary or route", async (t) => {
  const readerPage = await reader(t, { blockedHeaders: ["/"] });
  await readerPage.page.locator("#guide-search-input").focus();
  await readerPage.release();
  await readerPage.ready();
  assertLandmarks(await stateFor(readerPage.page));
  assert.deepEqual(await readerPage.requests(), ["/"]);
});
test("pending interaction is tracked until readiness and then listeners are removed", async (t) => {
  const readerPage = await reader(t, { blockedHeaders: ["/"] });
  await readerPage.page.evaluate(() => window.dispatchEvent(new WheelEvent("wheel")));
  assert.equal(await readerPage.page.evaluate(() => window.completeGuideInteraction), true);
  await readerPage.release();
  await readerPage.ready();
  await readerPage.page.evaluate(() => { window.completeGuideInteraction = false; window.dispatchEvent(new KeyboardEvent("keydown")); });
  assert.equal(await readerPage.page.evaluate(() => window.completeGuideInteraction), false);
});
test("a topic click while loading is replayed after complete-reader navigation initialization", async (t) => {
  const readerPage = await reader(t, { blockedHeaders: ["/"] });
  await readerPage.page.evaluate(() => {
    window.__readerTest.navigationReady = false;
    window.__readerTest.replayed = [];
    window.completeGuideReady.then(() => { window.__readerTest.navigationReady = true; });
    document.addEventListener("click", (event) => { if (!event.defaultPrevented) { window.__readerTest.replayed.push(window.__readerTest.navigationReady); event.preventDefault(); } });
    const link = document.createElement("a"); link.href = "/filler"; link.id = "pending-topic-link"; link.textContent = "Filler"; document.body.append(link); link.click();
  });
  assert.deepEqual(await readerPage.page.evaluate(() => window.__readerTest.replayed), []);
  await readerPage.release();
  await readerPage.ready();
  await readerPage.page.waitForFunction(() => window.__readerTest.replayed.length > 0);
  assert.deepEqual(await readerPage.page.evaluate(() => window.__readerTest.replayed), [true]);
});
test("surrounding content compensates the retained native anchor offset after pending interaction", async (t) => {
  const readerPage = await reader(t, { blockedHeaders: ["/"] });
  await readerPage.page.evaluate(() => {
    document.body.style.margin = "0";
    document.body.style.minHeight = "5000px";
    document.getElementById("botox").style.margin = "0";
    window.__readerTest.anchor = document.getElementById("botox");
    window.scrollTo(0, Math.max(0, window.__readerTest.anchor.getBoundingClientRect().top - 20));
    window.__readerTest.anchorTop = window.__readerTest.anchor.getBoundingClientRect().top;
    window.dispatchEvent(new WheelEvent("wheel"));
  });
  await readerPage.release();
  await readerPage.ready();
  const result = await readerPage.page.evaluate(() => ({ same: document.getElementById("botox") === window.__readerTest.anchor, before: window.__readerTest.anchorTop, after: window.__readerTest.anchor.getBoundingClientRect().top, shifts: window.__readerTest.scrollAdjustments }));
  assert.equal(result.same, true);
  assert.equal(result.shifts.length, 1);
  assert(Math.abs(result.after - result.before) < 1, JSON.stringify(result));
});
test("SPA navigation removes stale language alternates and restores them from cache", async (t) => {
  const readerPage = await reader(t, { initial: home, path: "/" });
  await readerPage.ready();
  await readerPage.navigate("/english");
  assert.deepEqual(await readerPage.page.locator('link[rel="alternate"][hreflang]').evaluateAll((nodes) => nodes.map((node) => node.hreflang)), ["en", "ar-IQ"]);
  await readerPage.navigate("/filler");
  assert.equal(await readerPage.page.locator('link[rel="alternate"][hreflang]').count(), 0);
  await readerPage.navigate("/english");
  assert.equal(await readerPage.page.locator('link[rel="alternate"][hreflang]').count(), 2);
  assert.deepEqual(await readerPage.requests(), ["/english", "/filler"]);
});
test("pagehide saves current scroll coordinates while preserving existing history fields and URL", async (t) => {
  const historyState = { routeKey: "botox", reader: { appointment: "draft" }, __completeGuideScroll: { x: 0, y: 20 } };
  const readerPage = await reader(t, { historyState });
  await readerPage.ready();
  const result = await readerPage.page.evaluate(() => {
    window.resumeGuideScrollState(window.pauseGuideScrollState());
    window.__readerTest.historyReplacements.length = 0;
    document.body.style.minHeight = "5000px"; window.scrollTo(0, 1800);
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    return { state: history.state, path: location.pathname, x: window.scrollX, y: window.scrollY, replacements: window.__readerTest.historyReplacements };
  });
  assert.deepEqual(result.state, { routeKey: "botox", reader: { appointment: "draft" }, __completeGuideScroll: { x: result.x, y: result.y, entry: result.state.__completeGuideScroll.entry } });
  assert.equal(typeof result.state.__completeGuideScroll.entry, "string");
  assert.equal(result.y, 1800);
  assert.equal(result.path, "/botox");
  assert.equal(result.replacements.length, 1);
  assert.equal(result.replacements[0].path, undefined);
});
test("explicit scroll snapshots merge the latest state supplied by other integrations", async (t) => {
  const readerPage = await reader(t, { initial: home, path: "/", historyState: { initial: true } });
  await readerPage.ready();
  const result = await readerPage.page.evaluate(() => {
    history.replaceState({ initial: true, externalWidget: { selected: "clinic" } }, "");
    document.body.style.minHeight = "5000px"; window.scrollTo(0, 1800); window.saveGuideScrollState();
    return { state: history.state, x: window.scrollX, y: window.scrollY, path: location.pathname };
  });
  assert.deepEqual(result.state, { initial: true, externalWidget: { selected: "clinic" }, __completeGuideScroll: { x: result.x, y: result.y, entry: result.state.__completeGuideScroll.entry } });
  assert.equal(result.path, "/");
  assert.deepEqual(await readerPage.requests(), []);
});
for (const entry of [{ name: "home", path: "/", initial: home.replace("</head>", '<meta name="description" content="Original home description"><meta property="og:title" content="Original home social title"></head>') }, { name: "English focused", path: "/english", initial: focused("Initial English", "english", "en", "ltr", englishAlternates).replace("</head>", '<meta property="og:title" content="Original English social title"></head>') }]) {
  test(entry.name + " initial metadata and bounded body survive repeated navigation when pushState precedes sync", async (t) => {
    const readerPage = await reader(t, entry);
    await readerPage.ready();
    const original = await stateFor(readerPage.page);
    for (const target of ["/filler", "/english", "/filler"]) {
      assert.equal(await readerPage.navigate(target), true);
      assert.equal((await stateFor(readerPage.page)).canonical, origin + target);
      assert.equal(await readerPage.navigate(entry.path), true);
      assert.deepEqual(await stateFor(readerPage.page), original);
    }
    assert.deepEqual(await readerPage.requests(), entry.path === "/" ? ["/filler", "/english"] : ["/", "/filler"]);
  });
  test(entry.name + " initial graph and body survive a first route fetch failure and retry", async (t) => {
    const readerPage = await reader(t, { ...entry, failPaths: ["/filler"] });
    await readerPage.ready();
    const original = await stateFor(readerPage.page);
    assert.equal(await readerPage.navigate("/filler"), false);
    const failed = await stateFor(readerPage.page);
    assert.deepEqual({ ...failed, path: original.path }, original);
    assert.equal(await readerPage.page.evaluate(() => window.syncGuidePageState("/filler")), true);
    assertLandmarks(await stateFor(readerPage.page), { title: "Filler", path: "/filler" });
    await readerPage.navigate(entry.path);
    assert.deepEqual(await stateFor(readerPage.page), original);
    assert.deepEqual(await readerPage.requests(), entry.path === "/" ? ["/filler", "/filler"] : ["/", "/filler", "/filler"]);
  });
}
test("route signature mismatch rejects both metadata and body commit against the cached home", async (t) => {
  const mismatch = focused("Filler", "filler").replace('"sourceSignature":"' + signature + '"', '"sourceSignature":"' + "0".repeat(64) + '"');
  const readerPage = await reader(t, { pages: { "/filler": mismatch } });
  await readerPage.ready();
  const before = await stateFor(readerPage.page);
  assert.equal(await readerPage.navigate("/filler"), false);
  const after = await stateFor(readerPage.page);
  assert.deepEqual({ ...after, path: before.path }, before);
  assert.equal(await readerPage.page.evaluate(() => document.querySelector("main article") === window.__readerTest.initialArticle), true);
});
test("primary-changed events observe committed body, metadata and landmark boundaries", async (t) => {
  const readerPage = await reader(t);
  await readerPage.ready();
  await readerPage.page.evaluate(() => {
    window.__readerTest.changes = [];
    document.addEventListener("guide:primary-changed", () => window.__readerTest.changes.push({
      canonical: document.querySelector('link[rel="canonical"]').href,
      primary: document.querySelector("main article").textContent,
      contexts: document.querySelectorAll("[data-guide-context]").length,
    }));
  });
  await readerPage.navigate("/filler");
  await readerPage.navigate("/");
  const changes = await readerPage.page.evaluate(() => window.__readerTest.changes);
  assert.equal(changes.length, 2);
  assert.equal(changes[0].canonical, origin + "/filler");
  assert.equal(changes[0].contexts, 2);
  assert(changes[0].primary.includes("Volume, structural support"));
  assert(!changes[0].primary.includes("Botox requires"));
  assert.equal(changes[1].canonical, origin + "/");
  assert.equal(changes[1].contexts, 0);
  assert(changes[1].primary.includes("Botox requires"));
});
test("a route change during the initial home request cannot restore the previous primary", async (t) => {
  const readerPage = await reader(t, { blockedHeaders: ["/"] });
  await readerPage.page.evaluate(() => { history.pushState(null, "", "/filler"); window.__readerTest.pending = window.syncGuidePageState("/filler"); });
  await readerPage.release();
  await readerPage.ready();
  assert.equal(await readerPage.page.evaluate(() => window.__readerTest.pending), true);
  const state = await stateFor(readerPage.page);
  assertLandmarks(state, { title: "Filler", path: "/filler" });
  assert.equal(state.primaryBody, fillerBody);
  assert(!state.primaryText.includes("Botox requires"));
  assert.deepEqual(await readerPage.requests(), ["/", "/filler"]);
});
test("mounted search keeps its subtree, query and listeners across home/topic/home swaps", async (t) => {
  const searchableHome = home.replace('The complete clinical guide.</p>', 'The complete clinical guide.<button data-guide-search-open type="button">Search</button></p>');
  const readerPage = await reader(t, { initial: searchableHome, path: "/" });
  await readerPage.ready();
  await readerPage.page.evaluate(() => {
    const search = document.createElement("section"); search.id = "guide-search"; search.dataset.mounted = "true";
    const input = document.getElementById("guide-search-input"); input.value = "Botox assessment";
    const action = document.createElement("button"); action.id = "guide-search-action"; action.type = "button"; action.textContent = "Open result";
    window.__readerTest.searchClicks = 0; action.addEventListener("click", () => window.__readerTest.searchClicks++);
    search.append(input, action); document.querySelector("[data-guide-search-open]").replaceWith(search);
    window.__readerTest.search = search; window.__readerTest.searchInput = input; window.__readerTest.searchAction = action;
  });
  for (const path of ["/filler", "/english", "/", "/filler", "/"]) {
    assert.equal(await readerPage.navigate(path), true);
    const identity = await readerPage.page.evaluate(() => {
      const state = window.__readerTest;
      state.searchAction.click();
      return { search: document.getElementById("guide-search") === state.search, input: document.getElementById("guide-search-input") === state.searchInput, action: document.getElementById("guide-search-action") === state.searchAction, query: state.searchInput.value, mounted: state.search.dataset.mounted, connected: state.search.isConnected, count: document.querySelectorAll("#guide-search").length, clicks: state.searchClicks };
    });
    assert.deepEqual({ ...identity, clicks: 0 }, { search: true, input: true, action: true, query: "Botox assessment", mounted: "true", connected: true, count: 1, clicks: 0 });
  }
  assert.equal(await readerPage.page.evaluate(() => window.__readerTest.searchClicks), 5);
  assert.deepEqual((await stateFor(readerPage.page)).duplicateIds, []);
});
test("supplemental portraits load lazily while native focused images keep their priority and home restores its portrait", async (t) => {
  const pixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const portrait = '<img id="doctor-portrait" src="' + pixel + '" alt="Doctor portrait" loading="eager" fetchpriority="high">';
  const nativeImage = '<img id="native-treatment-photo" src="' + pixel + '" alt="Treatment assessment" loading="eager" fetchpriority="high">';
  const imageContent = fullContent.replace("The complete clinical guide.</p>", "The complete clinical guide." + portrait + "</p>").replace("Botox requires a clinical assessment before treatment.</p>", "Botox requires a clinical assessment before treatment." + nativeImage + "</p>");
  const imageSignature = createHash("sha256").update(imageContent).digest("hex");
  const imageHome = home.replace(fullContent, imageContent).replaceAll(signature, imageSignature);
  const initial = focused("Botox", "botox").replace("Botox requires a clinical assessment before treatment.</p>", "Botox requires a clinical assessment before treatment." + nativeImage + "</p>").replaceAll(signature, imageSignature);
  const readerPage = await reader(t, { initial, fullHome: imageHome, blockedHeaders: ["/"] });
  await readerPage.page.evaluate(() => { window.__readerTest.nativeImage = document.getElementById("native-treatment-photo"); });
  await readerPage.release();
  await readerPage.ready();
  const images = await readerPage.page.evaluate(() => {
    const portrait = document.getElementById("doctor-portrait"), native = document.getElementById("native-treatment-photo");
    return { portrait: { loading: portrait.loading, priority: portrait.fetchPriority, context: !!portrait.closest("[data-guide-context]") }, native: { loading: native.loading, priority: native.fetchPriority, same: native === window.__readerTest.nativeImage, primary: !!native.closest("main") } };
  });
  assert.deepEqual(images, { portrait: { loading: "lazy", priority: "auto", context: true }, native: { loading: "eager", priority: "high", same: true, primary: true } });
  assert.equal(await readerPage.navigate("/"), true);
  assert.deepEqual(await readerPage.page.evaluate(() => {
    const portrait = document.getElementById("doctor-portrait");
    return { loading: portrait.loading, priority: portrait.fetchPriority, primary: !!portrait.closest("main"), contexts: document.querySelectorAll("[data-guide-context]").length };
  }), { loading: "eager", priority: "high", primary: true, contexts: 0 });
});
test("same-path fragment synchronization retains native disclosure, draft input and focus without primary-change events", async (t) => {
  const readerPage = await reader(t);
  await readerPage.ready();
  await readerPage.page.evaluate(() => {
    const state = window.__readerTest;
    state.faq = document.getElementById("botox-faq"); state.faq.open = true;
    state.draft = document.createElement("input"); state.draft.id = "reader-draft"; state.draft.value = "My question"; state.faq.append(state.draft); state.draft.focus();
    state.samePathChanges = 0; document.addEventListener("guide:primary-changed", () => state.samePathChanges++);
    history.pushState({ reader: "faq" }, "", "/botox#botox-faq");
  });
  assert.equal(await readerPage.page.evaluate(() => window.syncGuidePageState(location.pathname)), true);
  const state = await readerPage.page.evaluate(() => ({
    faq: document.getElementById("botox-faq") === window.__readerTest.faq,
    open: window.__readerTest.faq.open,
    draft: document.getElementById("reader-draft") === window.__readerTest.draft,
    value: window.__readerTest.draft.value,
    focused: document.activeElement === window.__readerTest.draft,
    changed: window.__readerTest.samePathChanges,
    url: location.pathname + location.hash,
    canonical: document.querySelector('link[rel="canonical"]').href,
  }));
  assert.deepEqual(state, { faq: true, open: true, draft: true, value: "My question", focused: true, changed: 0, url: "/botox#botox-faq", canonical: origin + "/botox" });
  assert.deepEqual(await readerPage.requests(), ["/"]);
});
test("a valid response for another canonical page is rejected without mutation or poisoned retry cache", async (t) => {
  const readerPage = await reader(t, { pages: { "/filler": focused("English", "english", "en", "ltr", englishAlternates) } });
  await readerPage.ready();
  const original = await stateFor(readerPage.page);
  assert.equal(await readerPage.navigate("/filler"), false);
  assert.deepEqual({ ...await stateFor(readerPage.page), path: original.path }, original);
  assert.equal(await readerPage.page.evaluate(() => document.querySelector("main article") === window.__readerTest.initialArticle), true);
  await readerPage.page.evaluate((payload) => { window.__readerTest.pages["/filler"] = payload; }, focused("Filler", "filler"));
  assert.equal(await readerPage.page.evaluate(() => window.syncGuidePageState("/filler")), true);
  const recovered = await stateFor(readerPage.page);
  assertLandmarks(recovered, { title: "Filler", path: "/filler" });
  assert.equal(recovered.primaryBody, fillerBody);
  assert.deepEqual(await readerPage.requests(), ["/", "/filler", "/filler"]);
});
test("loopback reader requests accept the declared production canonical origin", async (t) => {
  const readerPage = await reader(t, { runtimeOrigin: "http://localhost:4321" });
  assert.equal(await readerPage.ready(), true);
  assertLandmarks(await stateFor(readerPage.page));
  assert.equal(await readerPage.navigate("/filler"), true);
  assertLandmarks(await stateFor(readerPage.page), { title: "Filler", path: "/filler" });
  assert.deepEqual(await readerPage.requests(), ["/", "/filler"]);
});

async function scrollFixture(page) {
  await page.evaluate(() => {
    const article=document.querySelector("main article.medical-guide");
    article.innerHTML='<h1 id="reading-title">Clinical guidance</h1><p style="height:600px">Opening context</p><h2 id="reading-section">Assessment</h2><p id="reading-answer" style="height:1200px">An authored answer remains the reader’s stable position.</p><p style="height:1600px">Further guidance</p>';
    document.body.style.margin="0";
    window.scrollTo(0,700);
    Object.defineProperty(performance,"now",{value:()=>window.__readerTest.clock});
    window.resumeGuideScrollState(window.pauseGuideScrollState());
    window.__readerTest.historyReplacements.length=0;
  });
}
async function layoutFrames(page) {
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
test("scroll snapshots measure only the visible authored anchor and preserve external history state",async(t)=>{
  const readerPage=await reader(t,{initial:home,path:"/",historyState:{externalWidget:{selected:"clinic"}}});await readerPage.ready();await scrollFixture(readerPage.page);
  const result=await readerPage.page.evaluate(()=>{
    const measured=[],getRect=Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect=function(){measured.push(this.id);return getRect.call(this)};
    window.saveGuideScrollState();Element.prototype.getBoundingClientRect=getRect;
    return{snapshot:history.state.__completeGuideScroll,measured,top:document.getElementById("reading-answer").getBoundingClientRect().top,externalWidget:history.state.externalWidget};
  });
  assert.equal(result.snapshot.anchor.id,"reading-answer");assert.equal(result.snapshot.anchor.top,result.top);
  assert.deepEqual(result.measured,["reading-answer"]);assert.deepEqual(result.externalWidget,{selected:"clinic"});
});
test("anonymous visible paragraphs bind to their preceding authored heading inside the reader",async(t)=>{
  const readerPage=await reader(t,{initial:home,path:"/"});await readerPage.ready();await scrollFixture(readerPage.page);
  const result=await readerPage.page.evaluate(()=>{document.getElementById("reading-answer").removeAttribute("id");window.saveGuideScrollState();return history.state.__completeGuideScroll;});
  assert.equal(result.anchor.id,"reading-section");assert.notEqual(result.anchor.id,"main-content");
});
test("background snapshots retain the latest quick-Forward position while history writes remain throttled",async(t)=>{
  const readerPage=await reader(t,{initial:home,path:"/"});await readerPage.ready();await scrollFixture(readerPage.page);
  await readerPage.page.evaluate(()=>{history.pushState(null,"","/#second-entry");window.resumeGuideScrollState(window.pauseGuideScrollState());window.__readerTest.historyReplacements.length=0;window.scrollTo(0,800);window.dispatchEvent(new Event("scroll"));});
  await readerPage.advance(120);await layoutFrames(readerPage.page);
  const pending=await readerPage.page.evaluate(()=>({stored:history.state.__completeGuideScroll,latest:window.readGuideScrollState(),writes:window.__readerTest.historyReplacements.length}));
  assert.equal(pending.stored.y,700);assert.equal(pending.latest.y,800);assert.equal(pending.writes,0);assert.equal(pending.latest.entry,pending.stored.entry);
  await readerPage.page.goBack();await readerPage.page.waitForURL((url)=>!url.hash);
  const first=await readerPage.page.evaluate(()=>window.readGuideScrollState());assert.equal(first.y,700);assert.notEqual(first.entry,pending.latest.entry);
  await readerPage.page.goForward();await readerPage.page.waitForURL((url)=>url.hash==="#second-entry");
  const forward=await readerPage.page.evaluate(()=>window.readGuideScrollState());assert.equal(forward.y,800);assert.deepEqual(forward.anchor,pending.latest.anchor);
});
test("background writes are debounced, deduplicated, and separated by at least500ms",async(t)=>{
  const readerPage=await reader(t,{initial:home,path:"/"});await readerPage.ready();await scrollFixture(readerPage.page);
  await readerPage.page.evaluate(()=>{window.scrollTo(0,800);for(let i=0;i<30;i++)window.dispatchEvent(new Event("scroll"));});
  await readerPage.advance(120);await layoutFrames(readerPage.page);
  assert.equal(await readerPage.page.evaluate(()=>window.__readerTest.historyReplacements.length),0);
  await readerPage.advance(379);assert.equal(await readerPage.page.evaluate(()=>window.__readerTest.historyReplacements.length),0);
  await readerPage.advance(1);assert.equal(await readerPage.page.evaluate(()=>window.__readerTest.historyReplacements.length),1);
  await readerPage.page.evaluate(()=>{window.dispatchEvent(new Event("scroll"));});await readerPage.advance(500);await layoutFrames(readerPage.page);
  assert.equal(await readerPage.page.evaluate(()=>window.__readerTest.historyReplacements.length),1);
});
test("paused or superseded scroll tracking cannot overwrite a destination entry during reconstruction",async(t)=>{
  const readerPage=await reader(t,{initial:home,path:"/"});await readerPage.ready();await scrollFixture(readerPage.page);
  await readerPage.page.evaluate(()=>{const stale=window.pauseGuideScrollState();window.pauseGuideScrollState();history.pushState({destination:true},"","/english");window.resumeGuideScrollState(stale);window.dispatchEvent(new Event("scroll"));});
  await readerPage.advance(1000);await layoutFrames(readerPage.page);
  assert.deepEqual(await readerPage.page.evaluate(()=>history.state),{destination:true});
});
test("browser history write refusal does not break scrolling or explicit route departure",async(t)=>{
  const readerPage=await reader(t,{initial:home,path:"/"});await readerPage.ready();await scrollFixture(readerPage.page);
  const result=await readerPage.page.evaluate(()=>{history.replaceState=()=>{throw new DOMException("History quota","SecurityError")};window.scrollTo(0,800);window.saveGuideScrollState();return window.readGuideScrollState();});
  assert.equal(result.y,800);assert.equal(result.anchor.id,"reading-answer");assert.deepEqual(readerPage.errors,[]);
});
