import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";
import { withStaticSite, waitForPageLayout } from "./lib/render-measurement.mjs";

const directory = path.resolve(process.argv[2] || "dist");
const anchor = "hair-loss-diagnostic-assessment-before-prp-and-mesotherapy";
const frame = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
await withStaticSite(directory, async (url) => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const width of [390, 1363]) {
      const context = await browser.newContext({ viewport: { width, height: 936 }, reducedMotion: "reduce" });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
        // Cover a delayed stylesheet on mobile as well as the normal desktop path.
        if (width === 390) await page.route("**/assets/site.*.css", async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 750));
          await route.continue();
        });
        await page.goto(`${url}#${anchor}`, { waitUntil: "load" });
        await waitForPageLayout(page);
        await page.waitForFunction((id) => document.getElementById(id).closest(".render-chunk").classList.contains("is-target-chunk"), anchor);
        const selected = await page.evaluate((id) => {
          const target = document.getElementById(id);
          const chunk = target.closest(".render-chunk");
          // Deliberately inaccurate fallback makes this test detect lost memory
          // even when today's calibration happens to match this browser exactly.
          chunk.style.setProperty("--cis", "100px", "important");
          const css = getComputedStyle(chunk);
          return { id: chunk.id, h: chunk.getBoundingClientRect().height, cv: css.contentVisibility, cis: css.containIntrinsicSize };
        }, anchor);
        assert.equal(selected.cv, "visible", JSON.stringify({ selected, errors }));
        assert.match(selected.cis, /^auto /, "Target selection must preserve auto's remembered size");
        await frame(page);
        await page.evaluate(() => { location.hash = "botox"; });
        await page.waitForFunction((id) => !document.getElementById(id).classList.contains("is-target-chunk"), selected.id);
        await frame(page);
        const after = await page.evaluate((id) => {
          const chunk = document.getElementById(id);
          const rect = chunk.getBoundingClientRect();
          const destination = document.getElementById("botox").getBoundingClientRect();
          return { h: rect.height, offscreen: rect.top > innerHeight * 3, cv: getComputedStyle(chunk).contentVisibility, destinationTop: destination.top, overflow: document.documentElement.scrollWidth - innerWidth };
        }, selected.id);
        assert.equal(after.cv, "auto");
        assert.equal(after.offscreen, true);
        assert.ok(Math.abs(after.h - selected.h) <= 0.1, `Remembered height lost: ${selected.h} -> ${after.h}`);
        assert.ok(after.destinationTop >= -1 && after.destinationTop < 936, `Anchor missed viewport: ${after.destinationTop}`);
        assert.ok(after.overflow <= 1, `Horizontal overflow ${after.overflow}`);
        assert.deepEqual(errors, []);
        results.push({ width, selectedHeight: selected.h, offscreenHeight: after.h, delayedCss: width === 390, browserErrors: errors.length });
      } finally {
        await context.close();
      }
    }
    const noJs = await browser.newContext({ viewport: { width: 390, height: 936 }, javaScriptEnabled: false });
    try {
      const page = await noJs.newPage();
      await page.goto(`${url}#hair-loss`, { waitUntil: "load" });
      const state = await page.evaluate(() => ({
        stylesLoaded: [...document.styleSheets].some((sheet) => sheet.href?.includes("/assets/site.")),
        chunks: document.querySelectorAll(".render-chunk").length,
        targetHeight: document.getElementById("hair-loss").getBoundingClientRect().height,
      }));
      assert.equal(state.stylesLoaded, true, "Noscript stylesheet must load");
      assert.ok(state.chunks > 0 && state.targetHeight > 0);
      results.push({ javaScript: false, ...state });
    } finally {
      await noJs.close();
    }
    console.log(JSON.stringify({ valid: true, results }, null, 2));
  } finally {
    await browser.close();
  }
});
