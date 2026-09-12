import path from "node:path";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { withStaticSite, waitForPageLayout } from "./lib/render-measurement.mjs";

const root = process.cwd();
const directory = path.resolve(process.argv[2] || "dist");
const invariants = JSON.parse(
  await readFile(path.join(root, "src/data/release-invariants.json"), "utf8"),
);
const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};
const summary = (runs, key) => ({
  median: Number(median(runs.map((run) => run[key])).toFixed(2)),
  min: Number(Math.min(...runs.map((run) => run[key])).toFixed(2)),
  max: Number(Math.max(...runs.map((run) => run[key])).toFixed(2)),
});
const fail = (message) => {
  throw new Error(`Performance regression gate: ${message}`);
};

const measureRun = async (browser, url, width, run) => {
  const context = await browser.newContext({
    viewport: { width, height: 936 },
    deviceScaleFactor: 1,
    locale: "fa-IR",
    timezoneId: "UTC",
    reducedMotion: "reduce",
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    await page.addInitScript(() => {
      window.__distPerf = {
        lcp: [],
        cls: 0,
        longTasks: [],
        events: [],
        eventTimingSupported: false,
      };
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            window.__distPerf.lcp.push(entry.startTime || entry.renderTime || entry.loadTime);
        }).observe({ type: "largest-contentful-paint", buffered: true });
      } catch {}
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (!entry.hadRecentInput) window.__distPerf.cls += entry.value;
        }).observe({ type: "layout-shift", buffered: true });
      } catch {}
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            window.__distPerf.longTasks.push(entry.duration);
        }).observe({ type: "longtask", buffered: true });
      } catch {}
      try {
        new PerformanceObserver((list) => {
          window.__distPerf.eventTimingSupported = true;
          for (const entry of list.getEntries()) {
            if (entry.interactionId) {
              window.__distPerf.events.push({ duration: entry.duration, interactionId: entry.interactionId });
            }
          }
        }).observe({ type: "event", buffered: true, durationThreshold: 16 });
      } catch {}
    });
    await page.goto(url, { waitUntil: "load" });
    await waitForPageLayout(page);
    const fontLoadMs = await page.evaluate(async () => {
      const start = performance.now();
      await document.fonts.load('1rem "Vazirmatn"');
      return performance.now() - start;
    });
    await page.waitForTimeout(150);
    const initialResources = await page.evaluate(() =>
      performance.getEntriesByType("resource").map((entry) => ({
        name: entry.name,
        initiatorType: entry.initiatorType,
        transferSize: entry.transferSize || 0,
        encodedBodySize: entry.encodedBodySize || 0,
        decodedBodySize: entry.decodedBodySize || 0,
      })),
    );
    const interactionStart = Date.now();
    await page.locator("[data-guide-search-open]").click();
    await page.locator("#guide-search-input").fill("بوتاکس");
    await page.locator("[data-guide-search-close]").click();
    await page.waitForTimeout(150);
    const interactionWallMs = Date.now() - interactionStart;
    const metrics = await cdp.send("Performance.getMetrics");
    const scriptDuration = Number(
      metrics.metrics.find((metric) => metric.name === "ScriptDuration")?.value || 0,
    ) * 1000;
    const observed = await page.evaluate((resources) => {
      const perf = window.__distPerf;
      const bytes = (entry) =>
        entry.transferSize || entry.encodedBodySize || entry.decodedBodySize || 0;
      const pathname = (entry) => {
        try {
          return new URL(entry.name).pathname.toLowerCase();
        } catch {
          return entry.name.toLowerCase();
        }
      };
      const byExtension = (pattern) =>
        resources
          .filter((entry) => pattern.test(pathname(entry)))
          .reduce((sum, entry) => sum + bytes(entry), 0);
      const inlineJavaScript = [...document.scripts]
        .filter((script) => script.type !== "application/ld+json")
        .reduce((sum, script) => sum + new Blob([script.textContent || ""]).size, 0);
      return {
        lcp: Math.max(...perf.lcp.filter(Number.isFinite), 0),
        cls: perf.cls,
        tbt: perf.longTasks.reduce((sum, duration) => sum + Math.max(0, duration - 50), 0),
        inp: Math.max(...perf.events.map((entry) => entry.duration).filter(Number.isFinite), 0),
        eventTimingSupported: perf.eventTimingSupported,
        javascriptBytes: byExtension(/\.m?js(?:$|[?#])/u) + inlineJavaScript,
        cssBytes: byExtension(/\.css(?:$|[?#])/u),
        fontBytes: byExtension(/\.(?:woff2?|ttf|otf)(?:$|[?#])/u),
        initialImageBytes: byExtension(/\.(?:avif|webp|png|jpe?g|gif|svg)(?:$|[?#])/u),
        initialAssetBytes: resources.reduce((sum, entry) => sum + bytes(entry), 0),
        fontStatus: document.fonts.status,
        fontCount: [...document.fonts].length,
      };
    }, initialResources);
    if (!observed.eventTimingSupported)
      fail("Event Timing API is unavailable; INP cannot be measured");
    if (!observed.lcp) fail(`LCP was not observed at ${width}px run ${run}`);
    if (observed.fontStatus !== "loaded" || observed.fontCount < 1)
      fail(`font loading did not settle at ${width}px run ${run}`);
    if (errors.length) fail(`browser errors at ${width}px run ${run}: ${errors.join("; ")}`);
    return {
      width,
      run,
      ...observed,
      fontLoadMs,
      interactionWallMs,
      scriptDuration,
    };
  } finally {
    await context.close();
  }
};

await withStaticSite(directory, async (url) => {
  const browser = await chromium.launch({ headless: true });
  try {
    const runs = [];
    for (const width of [390, 1440])
      for (let run = 1; run <= 3; run++)
        runs.push(await measureRun(browser, url, width, run));
    const metrics = {
      lcp: summary(runs, "lcp"),
      cls: summary(runs, "cls"),
      inp: summary(runs, "inp"),
      tbt: summary(runs, "tbt"),
      scriptDuration: summary(runs, "scriptDuration"),
      javascriptBytes: summary(runs, "javascriptBytes"),
      cssBytes: summary(runs, "cssBytes"),
      fontBytes: summary(runs, "fontBytes"),
      fontLoadMs: summary(runs, "fontLoadMs"),
      initialImageBytes: summary(runs, "initialImageBytes"),
      initialAssetBytes: summary(runs, "initialAssetBytes"),
    };
    const checks = [
      [metrics.lcp.median <= invariants.maxLcpMs, `LCP ${metrics.lcp.median}/${invariants.maxLcpMs}ms`],
      [metrics.cls.median <= invariants.maxCls, `CLS ${metrics.cls.median}/${invariants.maxCls}`],
      [metrics.inp.median <= invariants.maxInpMs, `INP ${metrics.inp.median}/${invariants.maxInpMs}ms`],
      [metrics.tbt.median <= invariants.maxTbtMs, `TBT ${metrics.tbt.median}/${invariants.maxTbtMs}ms`],
      [metrics.scriptDuration.median <= invariants.maxScriptDurationMs, `ScriptDuration ${metrics.scriptDuration.median}/${invariants.maxScriptDurationMs}ms`],
      [metrics.javascriptBytes.median <= invariants.maxJavaScriptBytes, `JavaScript ${metrics.javascriptBytes.median}/${invariants.maxJavaScriptBytes} bytes`],
      [metrics.cssBytes.median <= invariants.maxDeferredCssBytes, `CSS ${metrics.cssBytes.median}/${invariants.maxDeferredCssBytes} bytes`],
      [metrics.fontBytes.median <= invariants.maxFontBytes, `fonts ${metrics.fontBytes.median}/${invariants.maxFontBytes} bytes`],
      [metrics.fontLoadMs.median <= invariants.maxFontLoadMs, `font load ${metrics.fontLoadMs.median}/${invariants.maxFontLoadMs}ms`],
      [metrics.initialImageBytes.median <= invariants.maxInitialImageBytes, `images ${metrics.initialImageBytes.median}/${invariants.maxInitialImageBytes} bytes`],
    ];
    for (const [valid, message] of checks) if (!valid) fail(message);
    console.log(JSON.stringify({ stage: "DIST_PERFORMANCE_GATE", samples: runs.length, metrics, budgets: invariants, interaction: "search-open-fill-close", integrity: "PASS" }, null, 2));
  } finally {
    await browser.close();
  }
});
