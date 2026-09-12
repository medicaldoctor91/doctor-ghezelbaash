import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";
import { withStaticSite, waitForPageLayout } from "./lib/render-measurement.mjs";

// Exercise the real critical/deferred cascade, not an injected CSS override.
// Ordinary fast local navigation can apply both sheets before the first paint.
const directory = path.resolve(process.argv[2] || "dist");
const frames = (page) => page.evaluate(() => new Promise((resolve) =>
  requestAnimationFrame(() => requestAnimationFrame(resolve))));
const snapshot = (page) => page.evaluate(() => {
  const caption = document.querySelector(".entity-hero .caption-disclosure");
  const style = getComputedStyle(caption);
  const actions = document.querySelector(".entity-hero .hero-actions");
  return {
    captionHeight: caption.getBoundingClientRect().height,
    actionsTop: actions.getBoundingClientRect().top,
    margin: style.margin,
    padding: style.padding,
    borderWidth: style.borderWidth,
    titleWeight: getComputedStyle(caption.querySelector("summary")).fontWeight,
  };
});

await withStaticSite(directory, async (url) => {
  const browser = await chromium.launch({ headless: true });
  const runs = [];
  try {
    for (const width of [360, 412, 430, 1440]) {
      const mobile = width < 768;
      const context = await browser.newContext({
        viewport: { width, height: mobile ? 823 : 936 },
        deviceScaleFactor: mobile ? 1.75 : 1,
        isMobile: mobile,
        hasTouch: mobile,
        locale: "fa-IR",
        reducedMotion: "reduce",
      });
      let releaseCss;
      const cssGate = new Promise((resolve) => { releaseCss = resolve; });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("response", (response) => {
          if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
        });
        await page.route("**/assets/site.*.css", async (route) => {
          await cssGate;
          await route.continue();
        });
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.evaluate(async () => {
          await document.fonts.ready;
          await document.querySelector(".hero-figure img").decode();
        });
        await frames(page);
        assert.equal(await page.evaluate(() => [...document.styleSheets]
          .some((sheet) => sheet.href?.includes("/assets/site."))), false,
        "Deferred stylesheet must not be active during the critical-only sample");
        const before = await snapshot(page);
        releaseCss();
        await waitForPageLayout(page);
        const after = await snapshot(page);
        assert.deepEqual(after, before, `Caption geometry/cascade changed when deferred CSS arrived at ${width}px`);
        assert.equal(after.margin, "0px");
        assert.equal(after.padding, "0px");
        assert.equal(after.borderWidth, "0px");
        assert.equal(after.titleWeight, "780");
        // The unrelated article disclosure component must retain its own box.
        const article = await page.locator("details:not([class])").first()
          .evaluate((element) => {
            const css = getComputedStyle(element);
            return { border: css.borderTopWidth, padding: css.paddingTop };
          });
        assert.equal(article.border, "1px");
        assert.equal(article.padding, "13.6px");
        // Excluding captions must not raise generic selector specificity and
        // displace the existing video-chapter component in the deferred layer.
        const video = await page.locator(".video-chapters").first().evaluate((element) => {
          const css = getComputedStyle(element);
          return {
            padding: parseFloat(css.paddingTop),
            margin: parseFloat(css.marginTop),
            titleWeight: getComputedStyle(element.querySelector("summary")).fontWeight,
          };
        });
        assert.ok(Math.abs(video.padding - 11.52) < 0.01, "Video chapter padding changed");
        assert.ok(Math.abs(video.margin - 11.2) < 0.01, "Video chapter margin changed");
        assert.equal(video.titleWeight, "800");
        assert.deepEqual(errors, []);
        runs.push({ width, deviceScaleFactor: mobile ? 1.75 : 1, before, after });
      } finally {
        releaseCss();
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify({ valid: true, test: "critical-caption-cascade", runs }, null, 2));
});
