import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { verifyByteRange } from "./lib/http-byte-range.mjs";
import { readVideoContract, observeVideo, verifyVideoOutcome } from "./lib/video-verification.mjs";

const directory = path.resolve(process.argv[2] || "dist");
const { clips, sources, origin } = await readVideoContract(directory);
const release = JSON.parse(await readFile("src/data/release.json", "utf8"));
assert.equal(origin, new URL(release.canonicalUrl).origin, "Video probe must target the canonical production host");
for (const source of sources) {
  const representation = await readFile(path.join(directory, source));
  console.log(JSON.stringify({ transport: await verifyByteRange(new URL(source, origin), representation) }));
}
const browser = await chromium.launch({ headless: true });
try {
  for (const clip of clips) {
    assert.equal(new URL(clip.url).origin, origin);
    const context = await browser.newContext({ viewport: { width: 390, height: 936 }, reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await observeVideo(page, clip);
      const response = await page.goto(clip.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      assert.equal(response.status(), 200);
      assert.equal(page.url(), clip.url, "Canonical deep link must not redirect");
      // Each browser navigation must observe the exact deployment under test,
      // even if a different Cloudflare PoP was used by an earlier verification.
      assert.deepEqual(await response.body(), await readFile(path.join(directory, "index.html")), "Browser received stale or different production HTML");
      const result = await verifyVideoOutcome(page, clip);
      assert.deepEqual(errors, []);
      assert.ok(sources.includes(new URL(result.source).pathname));
      console.log(JSON.stringify({ browser: browser.version(), clip: `${clip.slug}:${clip.seconds}`, time: result.time, readyState: result.readyState, paused: result.paused, frames: result.frames, source: result.source }));
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
