import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { withStaticSite, waitForPageLayout } from "./lib/render-measurement.mjs";
import {
  PERFORMANCE_PROFILES, PERFORMANCE_SAMPLES, assertPerformanceRun,
  evaluatePerformanceGate, summarizeResourceBytes, uniqueResourceTransferBytes,
} from "./lib/performance-gate.mjs";

const require = createRequire(import.meta.url);
const root = process.cwd();
if (process.argv.slice(2).some((value) => value.startsWith("--")) || process.argv.length > 3)
  throw new Error("Usage: node scripts/test-performance.mjs [dist-directory]; this is an unthrottled local gate, not a PSI simulation");
const directory = path.resolve(process.argv[2] || "dist");
const invariants = JSON.parse(await readFile(path.join(root, "src/data/release-invariants.json"), "utf8"));
const fail = (message) => { throw new Error(`Performance regression gate: ${message}`); };

const measureRun = async (browser, url, profile, run) => {
  const { id, ...emulation } = profile;
  const context = await browser.newContext({
    ...emulation,
    locale: "fa-IR", timezoneId: "UTC", reducedMotion: "reduce", serviceWorkers: "block",
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
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await page.addInitScript(() => {
      performance.setResourceTimingBufferSize(3000);
      window.__distPerf = {
        lcp: [], cls: 0, longTasks: [], events: [], eventTimingSupported: false,
        observationSupport: { lcp: false, cls: false, longTasks: false },
      };
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.__distPerf.lcp.push(entry.startTime);
        }).observe({ type: "largest-contentful-paint", buffered: true });
        window.__distPerf.observationSupport.lcp = PerformanceObserver.supportedEntryTypes.includes("largest-contentful-paint");
      } catch {}
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (!entry.hadRecentInput) window.__distPerf.cls += entry.value;
        }).observe({ type: "layout-shift", buffered: true });
        window.__distPerf.observationSupport.cls = PerformanceObserver.supportedEntryTypes.includes("layout-shift");
      } catch {}
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) window.__distPerf.longTasks.push(entry.duration);
        }).observe({ type: "longtask", buffered: true });
        window.__distPerf.observationSupport.longTasks = PerformanceObserver.supportedEntryTypes.includes("longtask");
      } catch {}
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.interactionId)
              window.__distPerf.events.push({ duration: entry.duration, interactionId: entry.interactionId });
          }
        });
        observer.observe({ type: "event", buffered: true, durationThreshold: 16 });
        window.__distPerf.eventTimingSupported = PerformanceObserver.supportedEntryTypes.includes("event");
      } catch {}
    });
    const response = await page.goto(url, { waitUntil: "load" });
    if (!response || response.status() !== 200) fail(`${id} run ${run}: main document did not return 200`);
    await waitForPageLayout(page);
    await page.waitForTimeout(150);
    // Capture the natural initial page before the explicit font/interaction
    // checks. The site's mobile system-font path must not acquire fake bytes.
    const initial = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      return {
        finalUrl: location.href,
        userAgent: navigator.userAgent,
        fcp: performance.getEntriesByName("first-contentful-paint", "paint")[0]?.startTime ?? null,
        document: navigation ? {
          url: navigation.name, protocol: navigation.nextHopProtocol,
          transferSize: navigation.transferSize, encodedBodySize: navigation.encodedBodySize,
          decodedBodySize: navigation.decodedBodySize,
          responseStart: navigation.responseStart, responseEnd: navigation.responseEnd,
        } : null,
        resources: performance.getEntriesByType("resource").map((entry) => ({
          name: entry.name, initiatorType: entry.initiatorType, transferSize: entry.transferSize,
          encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize,
        })),
        inlineJavaScript: [...document.scripts]
          .filter((script) => script.type !== "application/ld+json")
          .reduce((sum, script) => sum + new Blob([script.textContent || ""]).size, 0),
      };
    });
    const initialAssets = summarizeResourceBytes(initial.resources);
    const byExtension = (resources, pattern) => uniqueResourceTransferBytes(resources
      .filter((entry) => pattern.test(new URL(entry.name).pathname.toLowerCase())));
    const fontLoadMs = await page.evaluate(async () => {
      const start = performance.now();
      await document.fonts.load('1rem "Vazirmatn"');
      return performance.now() - start;
    });
    await page.waitForTimeout(150);
    const fontResources = await page.evaluate(() => performance.getEntriesByType("resource")
      .filter((entry) => /\.(?:woff2?|ttf|otf)$/u.test(new URL(entry.name).pathname.toLowerCase()))
      .map((entry) => ({ name: entry.name, transferSize: entry.transferSize, encodedBodySize: entry.encodedBodySize, decodedBodySize: entry.decodedBodySize })));
    const fontBytes = uniqueResourceTransferBytes(fontResources);
    const interactionStart = Date.now();
    await page.locator("[data-guide-search-open]").click();
    await page.locator("#guide-search-input").fill("بوتاکس");
    await page.locator("[data-guide-search-close]").click();
    await page.waitForTimeout(150);
    const interactionWallMs = Date.now() - interactionStart;
    const metrics = await cdp.send("Performance.getMetrics");
    const scriptMetric = metrics.metrics.find((metric) => metric.name === "ScriptDuration");
    if (!Number.isFinite(scriptMetric?.value)) fail(`${id} run ${run}: ScriptDuration was not measured`);
    const observed = await page.evaluate(() => {
      const perf = window.__distPerf;
      return {
        lcp: perf.lcp.length ? Math.max(...perf.lcp) : null,
        cls: perf.cls,
        // Keep the existing local regression proxies and their budgets. Neither
        // this whole-session sum nor these scripted interactions is Lighthouse
        // TBT / field INP; their definitions are explicit in the final report.
        tbt: perf.longTasks.reduce((sum, duration) => sum + Math.max(0, duration - 50), 0),
        inp: Math.max(...perf.events.map((entry) => entry.duration), 0),
        eventTimingSupported: perf.eventTimingSupported,
        observationSupport: perf.observationSupport,
        fontStatus: document.fonts.status,
        fontCount: [...document.fonts].length,
      };
    });
    if (errors.length) fail(`${id} run ${run}: browser errors: ${errors.join("; ")}`);
    const result = {
      profile: id, run, finalUrl: initial.finalUrl, userAgent: initial.userAgent,
      fcp: initial.fcp, ...observed, fontLoadMs, interactionWallMs,
      scriptDuration: scriptMetric.value * 1000,
      javascriptBytes: byExtension(initial.resources, /\.m?js$/u) + initial.inlineJavaScript,
      cssBytes: byExtension(initial.resources, /\.css$/u), fontBytes,
      initialImageBytes: byExtension(initial.resources, /\.(?:avif|webp|png|jpe?g|gif|svg)$/u),
      document: initial.document ? {
        ...initial.document, status: response.status(),
        contentEncoding: (await response.headerValue("content-encoding")) || "identity",
      } : null,
      initialAssets,
    };
    assertPerformanceRun(result);
    return result;
  } finally {
    await context.close();
  }
};

await withStaticSite(directory, async (url) => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  });
  try {
    const runs = [];
    // Interleave profiles to limit systematic drift from testing one last.
    for (let run = 1; run <= PERFORMANCE_SAMPLES; run++)
      for (const profile of PERFORMANCE_PROFILES) runs.push(await measureRun(browser, url, profile, run));
    const result = evaluatePerformanceGate(runs, invariants);
    console.log(JSON.stringify({
      stage: "DIST_PERFORMANCE_GATE", schemaVersion: 2, measuredAt: new Date().toISOString(),
      evidence: "observed-local-lab-regression; not Lighthouse/PSI scoring or field Core Web Vitals",
      conditions: {
        url, directory, engine: "chromium", browserVersion: browser.version(),
        playwrightVersion: require("playwright/package.json").version,
        platform: `${os.platform()} ${os.release()} ${os.arch()}`,
        network: { method: "none", latencyMs: 0, downloadBytesPerSecond: -1, uploadBytesPerSecond: -1 },
        cpuSlowdownMultiplier: 1, cache: "cold isolated context per navigation; fixture responses no-store; service workers blocked",
        delivery: "local HTTP/1.1, identity encoding; production headers, compression and Early Hints are not emulated",
        locale: "fa-IR", timezoneId: "UTC", reducedMotion: "reduce", authentication: "none",
      },
      definitions: {
        fcp: "observed first-contentful-paint, milliseconds from navigation start",
        lcp: "last observed LCP before the scripted first interaction",
        cls: "sum of observed non-input layout shifts through the scripted interaction; not field session-window CLS",
        inp: "maximum observed Event Timing duration in search-open-fill-close; zero can mean below the 16ms observation threshold; not field INP",
        tbt: "sum of long-task duration above 50ms through the scripted interaction; not Lighthouse FCP-to-TTI TBT",
        transferSize: "Resource Timing transferSize, browser-reported response headers plus encoded body; never substituted with decoded bytes",
        initialAssets: "observed resource requests before forced font load and interactions; excludes main document; repeated requests counted",
        initialPage: "main document plus natural initial assets; encoded and decoded totals reported separately",
        assetBudgets: "existing unique-URL asset budgets; largest observed transfer per URL, without byte-field fallbacks; actual repeated transfers remain in initialAssets/page",
        javascriptBytes: "initial unique external script transfer bytes plus raw inline executable script bytes (existing hybrid budget)",
        fontBytes: "font transfer through the explicit font-load check, including a forced mobile download; separate from natural initial assets",
      },
      samples: runs.length, ...result, budgets: invariants, interaction: "search-open-fill-close", runs,
    }, null, 2));
    if (result.failures.length) fail(result.failures.map(({ profile, metric, median, budget }) =>
      `${profile} ${metric} ${median}/${budget}`).join("; "));
  } finally {
    await browser.close();
  }
});
