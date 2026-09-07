import path from "node:path";
import os from "node:os";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { RENDER_CALIBRATION_WIDTHS } from "../../src/lib/css-delivery.mjs";
import { CALIBRATION_VIEWPORT_HEIGHT } from "./render-calibration.mjs";

const require = createRequire(import.meta.url);
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".avif": "image/avif", ".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json" };

export async function withStaticSite(directory, run) {
  const root = path.resolve(directory);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const file = path.resolve(root, `.${pathname.endsWith("/") ? `${pathname}index.html` : pathname}`);
      if (!file.startsWith(`${root}${path.sep}`) || !["GET", "HEAD"].includes(request.method)) {
        response.writeHead(403).end();
        return;
      }
      const bytes = await readFile(file);
      response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store", "Content-Length": bytes.length });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" || error.code === "EISDIR" ? 404 : 500).end();
    }
  });
  await stat(path.join(root, "index.html"));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    return await run(`http://127.0.0.1:${server.address().port}/`);
  } finally {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  }
}

export async function waitForPageLayout(page) {
  // A preloaded link can expose .sheet before its rules join the active cascade.
  await page.waitForFunction(() => [...document.styleSheets].some((sheet) => sheet.href?.includes("/assets/site.") && !sheet.disabled && sheet.cssRules.length > 0));
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].filter((image) => image.loading !== "lazy").map((image) => image.decode().catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function platformFonts(page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument");
    const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: ".render-chunk p, .render-chunk h3" });
    const fonts = [];
    for (const nodeId of nodeIds.slice(0, 8)) {
      const result = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      fonts.push(...result.fonts.map(({ familyName, postScriptName, isCustomFont }) => ({ familyName, postScriptName, isCustomFont })));
    }
    return [...new Map(fonts.map((font) => [JSON.stringify(font), font])).values()];
  } finally {
    await cdp.detach();
  }
}

export async function measureRenderChunks(url, expected) {
  const browser = await chromium.launch({ headless: true });
  const measurements = {};
  const fonts = [];
  try {
    for (const width of RENDER_CALIBRATION_WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height: CALIBRATION_VIEWPORT_HEIGHT }, deviceScaleFactor: 1, locale: "fa-IR", timezoneId: "UTC", reducedMotion: "reduce" });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("response", (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
        await page.goto(url, { waitUntil: "load" });
        await waitForPageLayout(page);
        // An authoring measurement must lay out every chunk, including distant
        // ones. Keep its normal containment and box model; disable only skipping.
        await page.addStyleTag({ content: ".render-chunk { content-visibility: visible !important; }" });
        await page.evaluate(async () => {
          document.querySelectorAll(".render-chunk img").forEach((image) => { image.loading = "eager"; });
          // Warm the optional web font before the reference measurement. On
          // mobile, the authored system-font rule still determines the font.
          await Promise.all([...document.fonts].map((font) => font.load()));
          await document.fonts.ready;
          await Promise.all([...document.querySelectorAll(".render-chunk img")].map((image) => image.decode()));
        });
        const result = await page.evaluate(async () => {
          const sample = () => ({
            total: document.documentElement.scrollHeight,
            chunks: [...document.querySelectorAll(".render-chunk")].map((element, i) => {
              const css = getComputedStyle(element);
              const h = element.getBoundingClientRect().height - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom) - parseFloat(css.borderTopWidth) - parseFloat(css.borderBottomWidth);
              return { i, id: element.id, key: `${element.closest(".content-section").id}/${element.id}`, h };
            }),
          });
          let previous = "";
          let stable = 0;
          for (let frame = 0; frame < 120; frame++) {
            await new Promise(requestAnimationFrame);
            const current = sample();
            const signature = JSON.stringify(current);
            stable = signature === previous ? stable + 1 : 0;
            if (stable >= 3) return current;
            previous = signature;
          }
          throw new Error("Render chunk measurements did not stabilize");
        });
        const identities = result.chunks.map(({ i, id, key }) => ({ i, id, key }));
        if (JSON.stringify(identities) !== JSON.stringify(expected)) throw new Error(`Browser/compiled DOM identity mismatch at ${width}`);
        if (errors.length) throw new Error(`Candidate browser errors at ${width}: ${errors.join("; ")}`);
        measurements[String(width)] = result;
        fonts.push({ width, used: await platformFonts(page) });
        console.log(`Measured ${width}px: ${result.chunks.length} chunks, document ${result.total}px`);
      } finally {
        await context.close();
      }
    }
    return { measurements, provenance: {
      engine: "chromium", browserVersion: browser.version(), playwrightVersion: require("playwright/package.json").version,
      platform: `${os.platform()} ${os.release()} ${os.arch()}`, viewportHeight: CALIBRATION_VIEWPORT_HEIGHT,
      deviceScaleFactor: 1, locale: "fa-IR", timezoneId: "UTC", skipping: "disabled-for-measurement",
      fontState: "loaded; authored system fonts on mobile; reference environment only", fonts,
    } };
  } finally {
    await browser.close();
  }
}
