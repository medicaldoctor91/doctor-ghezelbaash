import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { RENDER_CALIBRATION_WIDTHS as widths } from "../src/lib/css-delivery.mjs";
import { withStaticSite, waitForPageLayout } from "./lib/render-measurement.mjs";

const directory = path.resolve(process.argv[2] || "dist");
const data = JSON.parse(await readFile("src/data/render-calibration.json", "utf8"));
const expectedHeight = (index, width) => {
  if (width <= widths[0]) return data[widths[0]].chunks[index].h;
  if (width >= widths.at(-1)) return data[widths.at(-1)].chunks[index].h;
  const upper = widths.findIndex((reference) => reference >= width);
  const from = widths[upper - 1], to = widths[upper];
  const a = data[from].chunks[index].h, b = data[to].chunks[index].h;
  return a + (b - a) * (width - from) / (to - from);
};

// Check the browser's computed lengths from the actual minified DIST stylesheet.
// The arithmetic unit tests alone cannot establish CSS parsing/type correctness.
await withStaticSite(directory, async (url) => {
  const browser = await chromium.launch({ headless: true });
  const runs = [];
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 936 }, reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(url, { waitUntil: "load" });
    await waitForPageLayout(page);
    for (const width of [320, 360, 375, 390, 412, 430, 600, 768, 854, 1024, 1200, 1440, 1600]) {
      await page.setViewportSize({ width, height: 936 });
      const chunks = await page.evaluate(() => [...document.querySelectorAll(".render-chunk")].map((chunk) => {
        const css = getComputedStyle(chunk);
        return { id: chunk.id, value: css.containIntrinsicBlockSize, calibrated: Boolean(css.getPropertyValue("--cis")) };
      }));
      assert.equal(chunks.length, data[360].chunks.length);
      let maxError = 0;
      for (const [index, chunk] of chunks.entries()) {
        assert.equal(chunk.id, data[360].chunks[index].id);
        assert.equal(chunk.calibrated, true, `${chunk.id} has no calibration at ${width}px`);
        const match = /^auto ([\d.]+)px$/.exec(chunk.value);
        assert.ok(match, `${chunk.id}: invalid computed intrinsic length ${chunk.value}`);
        const error = Math.abs(Number(match[1]) - expectedHeight(index, width));
        // CSSOM serializes large pixel values with limited significant digits.
        assert.ok(error <= 0.1, `${chunk.id} at ${width}px differs from measured interpolation by ${error}px`);
        maxError = Math.max(maxError, error);
      }
      runs.push({ width, chunks: chunks.length, maxError });
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ valid: true, test: "computed-render-calibration", browser: browser.version(), runs }, null, 2));
  } finally {
    await browser.close();
  }
});
