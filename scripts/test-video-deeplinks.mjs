import assert from "node:assert/strict";
import path from "node:path";
import { chromium } from "playwright";
import { withVideoSite } from "./lib/video-test-server.mjs";
import { readVideoContract, observeVideo, verifyVideoOutcome } from "./lib/video-verification.mjs";

const directory = path.resolve(process.argv[2] || "dist");
const { clips } = await readVideoContract(directory);
const browser = await chromium.launch({ headless: true });
try {
  for (const transport of ["range", "slow-full"]) {
    for (const clip of clips) {
      await withVideoSite(directory, { transport }, async ({ url, requests, release }) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 936 }, reducedMotion: "reduce" });
        try {
          const page = await context.newPage();
          const errors = [];
          page.on("pageerror", (error) => errors.push(error.message));
          await observeVideo(page, clip);
          const published = new URL(clip.url);
          await page.goto(new URL(`${published.pathname}${published.search}${published.hash}`, url).href, { waitUntil: "domcontentloaded" });
          if (transport === "slow-full") {
            await page.waitForFunction(() => window.videoVerification.afterMetadata, null, { timeout: 15000 });
            const initial = await page.evaluate(() => window.videoVerification.afterMetadata);
            assert.ok(!initial.buffered.some(([start, end]) => start <= clip.seconds && clip.seconds < end), "Slow fixture already buffered the destination before the initial seek");
            assert.ok(requests.length > 0 && requests.every((request) => request.status === 200 && request.sent < request.length && !request.complete), "Slow fixture must still be withholding the full response body");
            release();
          }
          let result;
          if (transport === "range") {
            result = await verifyVideoOutcome(page, clip);
          } else {
            // Missing Range support is a transport failure. The pinned browser
            // exposes only time zero as seekable for this finite HTTP stream;
            // preload/retry cannot repair that. Prove the outcome verifier
            // rejects the healthy-looking player instead of reporting success.
            await page.waitForFunction((id) => {
              const video = document.getElementById(id);
              return !video.seeking && video.readyState >= 2;
            }, clip.id);
            const bodyDeadline = Date.now() + 10000;
            while (!requests.some((request) => request.complete)) {
              assert.ok(Date.now() < bodyDeadline, "Slow fixture did not finish sending its body");
              await new Promise((resolve) => setTimeout(resolve, 25));
            }
            await assert.rejects(verifyVideoOutcome(page, clip, { timeoutMs: 1000 }), /Video deep link failed/);
            result = await page.evaluate((id) => {
              const video = document.getElementById(id);
              return { time: video.currentTime, readyState: video.readyState, source: video.currentSrc, seekable: Array.from({ length: video.seekable.length }, (_, i) => [video.seekable.start(i), video.seekable.end(i)]), ...window.videoVerification };
            }, clip.id);
            assert.ok(Math.abs(result.time - clip.seconds) >= 0.5, "Negative fixture must miss the requested destination");
            assert.ok(!result.seekable.some(([start, end]) => start <= clip.seconds && clip.seconds <= end), "Negative fixture must represent an unavailable seek range");
          }
          assert.deepEqual(errors, []);
          assert.ok(requests.some((request) => request.range), "Browser must exercise a Range request");
          if (transport === "range") assert.ok(requests.some((request) => request.status === 206 && request.contentRange), "Range fixture must serve partial content");
          else assert.ok(requests.every((request) => request.status === 200 && !request.contentRange), "Full-body fixture must ignore Range");
          console.log(JSON.stringify({ transport, expectedOutcome: transport === "range" ? "seek-verified" : "unseekable-transport-rejected", clip: `${clip.slug}:${clip.seconds}`, time: result.time, readyState: result.readyState, frames: result.frames, source: new URL(result.source).pathname, afterMetadata: result.afterMetadata, requests }));
        } finally {
          release();
          await context.close();
        }
      });
    }
  }
} finally {
  await browser.close();
}
