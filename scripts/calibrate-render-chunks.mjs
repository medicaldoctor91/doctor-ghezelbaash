import { chromium } from "playwright-core";
import http from "node:http";
import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";

// Run after building a changed layout, then rebuild to publish these estimates.
// Explicit dimensions avoid large reserved gaps while distant content is skipped.
const root = path.resolve("dist"), widths = [360, 390, 430, 768, 1024, 1440];
const cssPath = "src/styles/global.css";
const source = await readFile(cssPath, "utf8");
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2",
  ".png": "image/png", ".jpg": "image/jpeg", ".avif": "image/avif", ".webp": "image/webp", ".svg": "image/svg+xml" };
const server = http.createServer(async (request, response) => {
  try {
    const route = new URL(request.url, "http://localhost").pathname;
    const file = path.resolve(root, "." + (route === "/" ? "/index.html" : decodeURIComponent(route)));
    if (!file.startsWith(root + path.sep)) throw new Error("Invalid asset path");
    const body = await readFile(file);
    response.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream");
    response.end(body);
  } catch { response.statusCode = 404; response.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || "chromium", headless: true });
  const measurements = new Map();
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto("http://127.0.0.1:" + server.address().port + "/", { waitUntil: "load" });
    await page.waitForFunction(() => [...document.styleSheets].some((sheet) => sheet.href?.includes("/assets/site.")));
    await page.evaluate(async () => {
      await document.fonts.ready;
      for (const chunk of document.querySelectorAll(".render-chunk")) chunk.style.contentVisibility = "visible";
    });
    const chunks = await page.evaluate(() => [...document.querySelectorAll(".render-chunk[id]")].map((chunk) => {
      const changed = [];
      for (let parent = chunk.parentElement; parent; parent = parent.parentElement)
        if (parent.localName === "details" && !parent.open) { parent.open = true; changed.push(parent); }
      const height = Math.ceil(chunk.getBoundingClientRect().height);
      for (const parent of changed) parent.open = false;
      return { id: chunk.id, height };
    }));
    if (!chunks.length || chunks.some(({ id, height }) => !/^rc\d+$/.test(id) || height <= 0))
      throw new Error("Incomplete render-chunk measurements at " + width);
    if (measurements.size && (measurements.size !== chunks.length || chunks.some(({ id }) => !measurements.has(id))))
      throw new Error("Render-chunk inventory changed between viewport sizes");
    for (const { id, height } of chunks) {
      const heights = measurements.get(id) || [];
      heights.push(height); measurements.set(id, heights);
    }
    await page.close();
  }
  const start = "/*DIST_CHUNK_INTRINSIC_START*/", end = "/*DIST_CHUNK_INTRINSIC_END*/";
  const from = source.indexOf(start) + start.length, to = source.indexOf(end);
  if (from < start.length || to < from) throw new Error("Missing intrinsic-size CSS boundaries");
  const existing = source.slice(from, to);
  const mediaStart = existing.indexOf("@media");
  if (mediaStart < 0) throw new Error("Missing intrinsic-size viewport rules");
  const data = [...measurements].map(([id, heights]) => "#" + id + "{" +
    heights.map((height, index) => "--cis-" + index + ":" + height).join(";") + "}").join("");
  await writeFile(cssPath, source.slice(0, from) + data + existing.slice(mediaStart) + source.slice(to));
  const report = { widths, chunks: measurements.size, measurements: Object.fromEntries(measurements) };
  await writeFile(".generated/layout-calibration.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ layoutCalibration: "PASS", widths, chunks: measurements.size, rebuildRequired: true }));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
