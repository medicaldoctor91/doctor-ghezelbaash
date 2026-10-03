import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { URL_ARCHITECTURE } from "../src/lib/url-architecture.mjs";
import { inspectHtml } from "./lib/html-contract.mjs";
import { startReaderStaticServer } from "./lib/reader-static-server.mjs";

const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const hash = (text) => createHash("sha256").update(text).digest("hex");
const normalize = (text) => text.replace(/\s+/gu, " ").trim();
const omitted = (node) => ["script", "style"].includes(node.tagName) ||
  node.attrs?.some((item) => ["data-guide-expand", "data-guide-expand-status"].includes(item.name));
const textOf = (node) => omitted(node) ? "" : node.nodeName === "#text" ? node.value :
  (node.childNodes || []).map(textOf).join("");
const descendants = (node) => [node, ...(node.childNodes || []).flatMap(descendants)];

/** The expectation is the physical focused HTML, independent of Range metadata. */
export function readerBaseline(source) {
  const inspected = inspectHtml(source);
  assert.equal(inspected.mains.length, 1, "Built reader must have one main");
  assert.equal(inspected.guideArticles.length, 1, "Built reader must have one primary article");
  const article = inspected.guideArticles[0];
  assert.equal(article.parentNode, inspected.mains[0], "Built primary article must be a direct main child");
  const html = inspected.elements.find((node) => node.tagName === "html");
  const heading = inspected.headings.filter((node) => node.tagName === "h1");
  assert.equal(heading.length, 1, "Built reader must have one H1");
  const text = normalize(textOf(article));
  return {
    text, textHash: hash(text), primaryIds: descendants(article).filter((node) => !omitted(node))
      .map((node) => attr(node, "id")).filter(Boolean).sort(),
    lang: attr(html, "lang"), dir: attr(html, "dir"),
    articleLang: attr(article, "lang") || attr(html, "lang"),
    articleDir: attr(article, "dir") || attr(html, "dir"),
    h1: normalize(textOf(heading[0])),
    canonical: inspected.elements.find((node) => node.tagName === "link" && attr(node, "rel") === "canonical")?.attrs.find((item) => item.name === "href")?.value,
  };
}

// This function runs in Chromium; keep it independent of Node helpers.
function readerSnapshot() {
  const article = document.querySelector("main > article.medical-guide");
  const primary = article?.cloneNode(true);
  for (const node of primary?.querySelectorAll("script,style,[data-guide-expand],[data-guide-expand-status]") || []) node.remove();
  const allIds = [...document.querySelectorAll("[id]")].map((node) => node.id);
  const contexts = [...document.querySelectorAll("[data-guide-context]")];
  const main = document.querySelector("main"), wrapper = document.querySelector("[data-guide-reader]");
  return {
    text: (primary?.textContent || "").replace(/\s+/gu, " ").trim(),
    primaryIds: [...(primary?.querySelectorAll("[id]") || [])].map((node) => node.id).concat(primary?.id ? [primary.id] : []).sort(),
    ids: allIds, duplicateIds: [...new Set(allIds.filter((id, index) => allIds.indexOf(id) !== index))],
    mainCount: document.querySelectorAll("main").length,
    articleCount: document.querySelectorAll("article").length,
    primaryCount: document.querySelectorAll("[data-guide-primary]").length,
    directPrimary: article?.parentElement === main && article?.hasAttribute("data-guide-primary"),
    documentLang: document.documentElement.lang, documentDir: document.documentElement.dir,
    articleLang: article?.getAttribute("lang"), articleDir: article?.getAttribute("dir"),
    h1s: [...document.querySelectorAll("h1")].map((node) => node.textContent.replace(/\s+/gu, " ").trim()),
    canonical: document.querySelector('link[rel="canonical"]')?.href,
    searchMounted: document.getElementById("guide-search")?.dataset.mounted === "true",
    viewportWidth: window.innerWidth,
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    contexts: contexts.map((node) => ({ side: node.dataset.guideContext, tag: node.localName,
      outsideMain: !main?.contains(node), sibling: node.parentElement === main?.parentElement && node.parentElement === wrapper,
      beforeMain: !!(node.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING),
      lang: node.getAttribute("lang"), dir: node.getAttribute("dir") })),
    csp: window.__readerCspViolations || [],
  };
}

function sameText(actual, expected, label) {
  if (actual === expected) return;
  let at = 0;
  while (at < Math.min(actual.length, expected.length) && actual[at] === expected[at]) at++;
  throw new Error(label + " changed at character " + at + "; expected " + JSON.stringify(expected.slice(Math.max(0, at - 50), at + 100)) +
    ", received " + JSON.stringify(actual.slice(Math.max(0, at - 50), at + 100)));
}

function assertFocused(snapshot, baseline, authoredIds, home) {
  assert.equal(snapshot.mainCount, 1, "Reader must retain one main");
  assert.equal(snapshot.articleCount, 1, "Supplemental context must not become another article");
  assert.equal(snapshot.primaryCount, 1, "Reader must retain one primary article");
  assert(snapshot.directPrimary, "Primary article must be a direct main child");
  sameText(snapshot.text, baseline.text, "Primary article text");
  assert.deepEqual(snapshot.primaryIds, baseline.primaryIds, "Initial primary IDs must remain inside the primary article");
  assert.deepEqual(snapshot.duplicateIds, [], "Reader must not duplicate IDs");
  const ids = new Set(snapshot.ids), missing = authoredIds.filter((id) => !ids.has(id));
  assert.equal(missing.length, 0, "Lost authored source IDs: " + missing.slice(0, 12).join(", "));
  assert.equal(snapshot.documentLang, baseline.lang, "Document language changed");
  assert.equal(snapshot.documentDir, baseline.dir, "Document direction changed");
  assert.equal(snapshot.articleLang, baseline.articleLang, "Primary language changed");
  assert.equal(snapshot.articleDir, baseline.articleDir, "Primary direction changed");
  assert.deepEqual(snapshot.h1s, [baseline.h1], "The focused article must own the only H1");
  assert.equal(snapshot.canonical, baseline.canonical, "Reader canonical changed");
  assert(snapshot.searchMounted, "Reader search failed to mount");
  assert(snapshot.documentWidth <= snapshot.viewportWidth + 1,
    "Reader overflows horizontally: " + snapshot.documentWidth + " > " + snapshot.viewportWidth);
  assert.equal(snapshot.contexts.length, 2, "Complete source context must have before/after asides");
  assert.deepEqual(snapshot.contexts.map((node) => node.side), ["before", "after"]);
  for (const node of snapshot.contexts) {
    assert.equal(node.tag, "aside", "Supplemental source must be an aside");
    assert(node.outsideMain && node.sibling, "Supplemental asides must be siblings outside main");
    assert.equal(node.beforeMain, node.side === "before", "Supplemental source order changed");
    assert.equal(node.lang, home.articleLang, "Supplemental source language changed");
    assert.equal(node.dir, home.articleDir, "Supplemental source direction changed");
  }
  assert.deepEqual(snapshot.csp, [], "Built CSP blocked reader behavior");
}

const summary = (snapshot) => ({ primaryTextHash: hash(snapshot.text), primaryTextLength: snapshot.text.length,
  primaryIds: snapshot.primaryIds.length, sourceIds: snapshot.ids.length, canonical: snapshot.canonical,
  lang: snapshot.documentLang, articleLang: snapshot.articleLang, h1: snapshot.h1s[0], contexts: snapshot.contexts,
  searchMounted: snapshot.searchMounted, viewportWidth: snapshot.viewportWidth, documentWidth: snapshot.documentWidth });

export async function validateReader({ root = process.cwd(), distDirectory = path.join(root, "dist"),
  reportFile = path.join(root, ".generated/reader-validation.json"), executablePath = process.env.BROWSER_EXECUTABLE,
  timeoutMs = 175_000, concurrency = 4 } = {}) {
  const started = Date.now(), checks = [], externalRequests = [];
  const report = { schemaVersion: 1, startedAt: new Date(started).toISOString(), browser: "Chromium",
    bfcacheDisabled: true, timeoutMs, checks, externalRequests, ok: false };
  let server, browser, expired = false;
  const deadline = setTimeout(() => { expired = true; browser?.close().catch(() => {}); }, timeoutMs);
  try {
    const resources = URL_ARCHITECTURE.resources.filter(({ path: route }) => route !== "/");
    const authoredIds = Object.keys(URL_ARCHITECTURE.htmlIdTargets);
    const home = readerBaseline(await readFile(path.join(distDirectory, "index.html"), "utf8"));
    const baselines = new Map(await Promise.all(resources.map(async (resource) => [resource.path,
      readerBaseline(await readFile(path.join(distDirectory, resource.path.slice(1) + ".html"), "utf8"))])));
    report.coverage = { focusedPages: resources.length, authoredSourceIds: authoredIds.length,
      directViewport: { width: 390, height: 844 }, navigationViewports: [390, 1280] };
    server = await startReaderStaticServer({ distDirectory });
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}),
      args: ["--no-sandbox", "--disable-features=BackForwardCache"], timeout: 10_000 });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route("**/*", async (route) => {
      const requested = new URL(route.request().url());
      if (["http:", "https:"].includes(requested.protocol) && requested.origin !== server.origin) {
        externalRequests.push({ url: requested.href, resourceType: route.request().resourceType() });
        await route.abort("blockedbyclient");
      } else await route.continue();
    });
    await context.addInitScript(() => {
      window.__readerCspViolations = [];
      document.addEventListener("securitypolicyviolation", (event) => window.__readerCspViolations.push({
        directive: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition,
      }));
    });
    const run = async (name, execute) => {
      const check = { name, ok: false }, begin = Date.now();
      try { if (expired) throw new Error("Reader validation exceeded its total time limit"); check.result = await execute(); check.ok = true; }
      catch (error) { check.error = error.message; }
      check.elapsedMs = Date.now() - begin; checks.push(check);
      if (!check.ok) console.error(name + ": " + check.error);
    };
    const fresh = async (width = 390) => {
      const page = await context.newPage(), errors = [];
      await page.setViewportSize({ width, height: 844 });
      page.setDefaultTimeout(8_000); page.setDefaultNavigationTimeout(10_000);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      return { page, errors };
    };
    const ready = async (page) => {
      await page.waitForFunction(() => window.completeGuideReady && window.syncGuidePageState);
      assert.equal(await page.evaluate(() => window.completeGuideReady), true, "Complete guide failed to load or partition");
    };
    const inspect = async (page, route) => {
      await page.waitForFunction((canonical) => document.querySelector('link[rel="canonical"]')?.href === canonical,
        baselines.get(route).canonical);
      const snapshot = await page.evaluate(readerSnapshot);
      assertFocused(snapshot, baselines.get(route), authoredIds, home);
      return summary(snapshot);
    };
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, resources.length) }, async () => {
      while (cursor < resources.length && !expired) {
        const { path: route } = resources[cursor++];
        await run("direct " + route, async () => {
          const { page, errors } = await fresh();
          try {
            const response = await page.goto(server.origin + route, { waitUntil: "domcontentloaded" });
            assert.equal(response.status(), 200, "Focused document must return 200");
            await ready(page); const result = await inspect(page, route);
            assert.deepEqual(errors, [], "Reader produced JavaScript or resource errors"); return result;
          } finally { await page.close(); }
        });
      }
    }));
    const clickLink = async (page, route) => {
      const link = page.locator('a[href="' + route + '"]').first();
      assert(await link.count(), "Authored navigation link missing: " + route);
      await link.evaluate((node) => node.click());
      await page.waitForURL((url) => url.pathname === route);
    };
    for (const width of [390, 1280]) await run("home/topic navigation and history " + width, async () => {
      const { page, errors } = await fresh(width);
      try {
        await page.goto(server.origin + "/", { waitUntil: "domcontentloaded" }); await ready(page);
        await page.evaluate(() => { window.__readerDocumentToken = "same-document"; });
        await clickLink(page, "/botox"); const topic = await inspect(page, "/botox");
        await clickLink(page, "/botox-complications-longevity-and-aftercare");
        const child = await inspect(page, "/botox-complications-longevity-and-aftercare");
        await page.goBack(); await page.waitForURL((url) => url.pathname === "/botox");
        const back = await inspect(page, "/botox");
        await clickLink(page, "/");
        await page.waitForFunction((canonical) => document.querySelector('link[rel="canonical"]')?.href === canonical, home.canonical);
        const restored = await page.evaluate(readerSnapshot);
        assert.equal(restored.mainCount, 1); assert.equal(restored.articleCount, 1); assert(restored.directPrimary);
        assert.deepEqual(restored.contexts, [], "Homepage must restore its original single complete article");
        assert.deepEqual(restored.h1s, [home.h1]); assert.deepEqual(restored.duplicateIds, []);
        const restoredIds = new Set(restored.ids);
        assert.deepEqual(authoredIds.filter((id) => !restoredIds.has(id)), [], "Homepage navigation lost authored source IDs");
        assert.equal(restored.documentLang, home.lang); assert.equal(restored.articleLang, home.articleLang);
        assert(restored.searchMounted, "Homepage navigation lost the mounted reader search");
        assert(restored.documentWidth <= restored.viewportWidth + 1, "Homepage navigation overflows horizontally");
        assert.equal(await page.evaluate(() => window.__readerDocumentToken), "same-document", "Topic navigation unexpectedly replaced the document");
        assert.deepEqual(errors, []); assert.deepEqual(restored.csp, []);
        return { topic, child, back, home: summary(restored) };
      } finally { await page.close(); }
    });
    const savedReadingPosition = async (page) => {
      await page.waitForFunction(() => {
        const saved = history.state?.__completeGuideScroll, anchor = saved?.anchor;
        const node = anchor && document.getElementById(anchor.id);
        return node && Number.isFinite(saved.y) && Math.abs(scrollY - saved.y) < 8 &&
          Math.abs(node.getBoundingClientRect().top - anchor.top) < 8;
      }, null, { timeout: 5_000 });
      return page.evaluate(() => {
        const saved = history.state.__completeGuideScroll, anchor = saved.anchor;
        const node = document.getElementById(anchor.id);
        return { y: scrollY, anchor: { id: anchor.id, top: node.getBoundingClientRect().top },
          text: node.textContent.replace(/\s+/gu, " ").trim().slice(0, 100) };
      });
    };
    const restoredReadingPosition = async (page, expected, sameDocument = true) => {
      await page.waitForFunction((anchor) => {
        const node = document.getElementById(anchor.id);
        return node && Math.abs(node.getBoundingClientRect().top - anchor.top) < 8;
      }, expected.anchor, { timeout: 5_000 });
      await page.waitForTimeout(150);
      const actual = await page.evaluate((anchor) => {
        const node = document.getElementById(anchor.id);
        return { y: scrollY, anchor: { id: anchor.id, top: node.getBoundingClientRect().top },
          text: node.textContent.replace(/\s+/gu, " ").trim().slice(0, 100), token: window.__readerDocumentToken ?? null,
          saved: history.state?.__completeGuideScroll };
      }, expected.anchor);
      assert.equal(actual.token, sameDocument ? "same-document" : null,
        sameDocument ? "History navigation unexpectedly replaced the document" : "Back reused the document despite disabled BFCache");
      assert.equal(actual.text, expected.text, "History restored a different source anchor");
      assert(Math.abs(actual.anchor.top - expected.anchor.top) < 8,
        "History shifted the visible reading anchor: " + JSON.stringify({ expected, actual }));
      assert(Number.isFinite(actual.saved?.y), "The departure did not preserve a real history position");
      return actual;
    };
    for (const width of [390, 1280]) await run("same-document Back and Forward preserve reading position " + width, async () => {
      const { page, errors } = await fresh(width);
      try {
        await page.goto(server.origin + "/botox", { waitUntil: "domcontentloaded" }); await ready(page);
        await inspect(page, "/botox");
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          window.__readerDocumentToken = "same-document";
          window.scrollBy(0, 700);
        });
        const before = await savedReadingPosition(page);
        await clickLink(page, "/aesthetic-guide-en"); await inspect(page, "/aesthetic-guide-en");
        await page.evaluate(() => window.scrollBy(0, 450));
        const forwardBefore = await savedReadingPosition(page);
        await page.goBack(); await page.waitForURL((url) => url.pathname === "/botox");
        await inspect(page, "/botox");
        const after = await restoredReadingPosition(page, before);
        await page.goForward(); await page.waitForURL((url) => url.pathname === "/aesthetic-guide-en");
        await inspect(page, "/aesthetic-guide-en");
        const forwardAfter = await restoredReadingPosition(page, forwardBefore);
        assert.deepEqual(errors, []); return { before, after, forwardBefore, forwardAfter };
      } finally { await page.close(); }
    });
    for (const route of ["/botox", "/aesthetic-guide-en"]) await run("full-document Back without BFCache " + route, async () => {
      const { page, errors } = await fresh();
      try {
        await page.goto(server.origin + route, { waitUntil: "domcontentloaded" }); await ready(page);
        await page.evaluate(() => { window.__readerDocumentToken = "departed"; window.scrollBy(0, 700); });
        const before = await savedReadingPosition(page);
        await page.goto(server.origin + "/filler", { waitUntil: "domcontentloaded" }); await ready(page);
        await page.goBack({ waitUntil: "domcontentloaded" }); await ready(page);
        const position = await restoredReadingPosition(page, before, false);
        const restored = await inspect(page, route);
        const navigation = await page.evaluate(() => ({ type: performance.getEntriesByType("navigation")[0].type,
          scrollY, token: window.__readerDocumentToken ?? null }));
        assert.equal(navigation.type, "back_forward"); assert.equal(navigation.token, null, "Back used the old document despite disabled BFCache");
        assert.deepEqual(errors, []); return { before, position, navigation, restored };
      } finally { await page.close(); }
    });
    assert.equal(checks.filter((check) => check.name.startsWith("direct ")).length, resources.length, "Reader validation did not cover every focused route");
    assert(!expired, "Reader validation exceeded its total time limit");
    assert.deepEqual(externalRequests, [], "The local reader attempted external requests");
    report.ok = checks.every((check) => check.ok);
  } catch (error) { report.error = error.message; }
  finally {
    clearTimeout(deadline); await browser?.close().catch(() => {}); await server?.close();
    report.finishedAt = new Date().toISOString(); report.elapsedMs = Date.now() - started;
    report.totals = { checked: checks.length, passed: checks.filter((check) => check.ok).length,
      failed: checks.filter((check) => !check.ok).length };
    await mkdir(path.dirname(reportFile), { recursive: true });
    await writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = await validateReader();
  console.log(JSON.stringify({ ok: report.ok, elapsedMs: report.elapsedMs, ...report.totals,
    report: ".generated/reader-validation.json", ...(report.error ? { error: report.error } : {}) }));
  if (!report.ok) process.exitCode = 1;
}
