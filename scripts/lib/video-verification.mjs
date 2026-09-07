import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { inspectHtml } from "./html-contract.mjs";

const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const requiredClips = [["subcision-technique", 7], ["subcision-technique", 25], ["jalupro-vs-profhilo", 46]];

export async function readVideoContract(directory) {
  const dom = inspectHtml(await readFile(path.join(directory, "index.html"), "utf8"));
  const nodes = dom.elements.filter((node) => node.tagName === "script" && attr(node, "type") === "application/ld+json")
    .flatMap((node) => JSON.parse(node.childNodes.map((child) => child.value || "").join(""))["@graph"] || []);
  const clips = requiredClips.map(([slug, seconds]) => {
    const node = nodes.find((node) => [].concat(node["@type"]).includes("Clip") && node.startOffset === seconds && new URL(node.url).searchParams.get("video") === slug);
    assert.ok(node, `Published Clip missing: ${slug} at ${seconds}`);
    const url = new URL(node.url);
    assert.equal(Number(url.searchParams.get("t")), seconds, "Clip timestamp and URL must agree");
    const id = `video-saeed-ghezelbash-${slug}`;
    assert.equal(url.hash, `#${id}`);
    assert.ok(dom.videos.some((video) => attr(video, "id") === id), `Clip has no player: ${id}`);
    return { slug, seconds, id, url: url.href };
  });
  const sources = dom.videos.flatMap((video) => video.childNodes.filter((node) => node.tagName === "source").map((node) => attr(node, "src")));
  assert.ok(sources.length > 0 && sources.every((src) => /^\/media\/videos\/[^?#]+\.(mp4|webm)$/.test(src)), "Expected local published video sources");
  return { clips, sources: [...new Set(sources)], origin: new URL(clips[0].url).origin };
}

// Observe native events and decoded-frame delivery without replacing media APIs
// or setting currentTime from the test. Only the shipped site may perform seek.
export async function observeVideo(page, clip) {
  await page.addInitScript(({ id, seconds }) => {
    const trace = { events: [], frames: [], afterMetadata: null };
    window.videoVerification = trace;
    const ranges = (value) => Array.from({ length: value.length }, (_, i) => [value.start(i), value.end(i)]);
    const sample = (video) => ({ time: video.currentTime, seeking: video.seeking, readyState: video.readyState, paused: video.paused, preload: video.preload, buffered: ranges(video.buffered), seekable: ranges(video.seekable), source: video.currentSrc, error: video.error?.code || null });
    for (const type of ["loadedmetadata", "loadeddata", "seeking", "seeked", "canplay", "progress", "suspend", "error", "play", "pointerdown", "keydown"]) {
      document.addEventListener(type, (event) => {
        const video = event.target;
        if (video.id !== id) return;
        trace.events.push({ type, ...sample(video) });
        if (type === "loadedmetadata") {
          setTimeout(() => { trace.afterMetadata = sample(video); }, 0);
          const frame = (_, metadata) => {
            trace.frames.push(metadata.mediaTime);
            if (Math.abs(metadata.mediaTime - seconds) >= 0.5) video.requestVideoFrameCallback(frame);
          };
          video.requestVideoFrameCallback?.(frame);
        }
      }, true);
    }
  }, clip);
}

export async function verifyVideoOutcome(page, clip, { timeoutMs = 20000 } = {}) {
  try {
    await page.waitForFunction(({ id, seconds }) => {
      const video = document.getElementById(id);
      return video && !video.error && !video.seeking && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && Math.abs(video.currentTime - seconds) < 0.5;
    }, clip, { timeout: timeoutMs });
    // A matching currentTime alone can precede decoding. Check a submitted frame
    // too; Chromium is pinned in CI, so this is not a production API dependency.
    await page.waitForFunction((seconds) => window.videoVerification.frames.some((time) => Math.abs(time - seconds) < 0.5), clip.seconds, { timeout: timeoutMs });
    await page.evaluate(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    const result = await page.evaluate(({ id }) => {
      const video = document.getElementById(id);
      return {
        time: video.currentTime, seeking: video.seeking, readyState: video.readyState, paused: video.paused,
        source: video.currentSrc, error: video.error?.code || null,
        others: [...document.querySelectorAll("video")].filter((item) => item !== video).map((item) => ({ preload: item.preload, paused: item.paused, time: item.currentTime })),
        ...window.videoVerification,
      };
    }, clip);
    assert.equal(result.seeking, false);
    assert.ok(result.readyState >= 2 && Math.abs(result.time - clip.seconds) < 0.5, "Destination must stay ready and stable");
    assert.equal(result.error, null);
    assert.equal(result.paused, true, "Deep link must not autoplay");
    assert.ok(result.others.every((video) => video.preload === "none" && video.paused && video.time === 0), "Other videos must remain idle");
    return result;
  } catch (error) {
    const trace = await page.evaluate((id) => {
      const video = document.getElementById(id);
      return { ...window.videoVerification, final: { time: video.currentTime, preload: video.preload, seeking: video.seeking, readyState: video.readyState, networkState: video.networkState, error: video.error?.code || null, buffered: Array.from({ length: video.buffered.length }, (_, i) => [video.buffered.start(i), video.buffered.end(i)]), seekable: Array.from({ length: video.seekable.length }, (_, i) => [video.seekable.start(i), video.seekable.end(i)]) } };
    }, clip.id).catch(() => null);
    throw new Error(`Video deep link failed: ${clip.slug} t=${clip.seconds}; ${JSON.stringify(trace)}`, { cause: error });
  }
}
