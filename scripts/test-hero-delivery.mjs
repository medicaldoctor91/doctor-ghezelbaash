import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright";

// Test final-response Link processing with the real distribution and CSP.
// Routing/interception and no-store fixtures can change preload/cache behavior.
// This is a request regression test, not a Lighthouse or HTTP 103 measurement.
const directory = path.resolve(process.argv[2] || "dist");
const documentBytes = await readFile(path.join(directory, "index.html"));
const headerRules = [];
let currentRule;
for (const line of (await readFile(path.join(directory, "_headers"), "utf8")).split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith("#")) continue;
  if (!/^\s/.test(line)) {
    currentRule = { pattern: line.trim(), values: [] };
    headerRules.push(currentRule);
  } else {
    const match = line.trim().match(/^([^:]+):\s*(.*)$/);
    assert.ok(match && currentRule, `Unsupported distribution header: ${line}`);
    currentRule.values.push([match[1].toLowerCase(), match[2]]);
  }
}
const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const rule of headerRules) {
  // Host-qualified Pages preview rules do not apply to the canonical fixture.
  if (!rule.pattern.startsWith("/")) continue;
  rule.match = new RegExp(`^${rule.pattern.split(/(\*|:[a-zA-Z]\w*)/)
    .map((part) => part === "*" ? ".*" : part.startsWith(":") ? "[^/]+" : escapePattern(part))
    .join("")}$`);
}
const headersFor = (pathname) => {
  const headers = {};
  for (const rule of headerRules) {
    if (!rule.match?.test(pathname)) continue;
    for (const [name, value] of rule.values) {
      headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
    }
  }
  return headers;
};
const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".avif": "image/avif", ".webp": "image/webp", ".png": "image/png",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json", ".vtt": "text/vtt", ".mp4": "video/mp4",
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = path.resolve(directory, `.${pathname.endsWith("/") ? `${pathname}index.html` : pathname}`);
    if (!file.startsWith(`${directory}${path.sep}`) || !["GET", "HEAD"].includes(request.method)) {
      response.writeHead(403).end();
      return;
    }
    const bytes = pathname === "/" ? documentBytes : await readFile(file);
    response.writeHead(200, {
      "content-type": mime[path.extname(file)] || "application/octet-stream",
      ...headersFor(pathname),
      "content-length": bytes.length,
    }).end(request.method === "HEAD" ? undefined : bytes);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" || error.code === "EISDIR" ? 404 : 500).end();
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const url = `http://127.0.0.1:${server.address().port}/`;
const profiles = [
  { name: "mobile360", viewport: { width: 360, height: 800 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, candidate: "delivery-640" },
  { name: "mobile412", viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, candidate: "960" },
  { name: "desktop1350", viewport: { width: 1350, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, candidate: "delivery-640" },
];
let browser;
const runs = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const { name, candidate, ...options } of profiles) {
    const context = await browser.newContext({ ...options, serviceWorkers: "block" });
    try {
      const page = await context.newPage();
      const portraitRequests = [];
      const errors = [];
      const externalRequests = [];
      page.on("request", (request) => {
        if (new URL(request.url()).origin !== new URL(url).origin) externalRequests.push(request.url());
        if (new URL(request.url()).pathname.includes("saeed-ghezelbash-portrait")) portraitRequests.push(request.url());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("response", (response) => {
        if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
      });
      const response = await page.goto(url, { waitUntil: "load", timeout: 60000 });
      assert.equal(response.status(), 200);
      assert.deepEqual(await response.body(), documentBytes, "The fixture must serve unchanged HTML");
      assert.equal(response.headers()["content-security-policy"], headersFor("/")["content-security-policy"]);
      assert.match(response.headers()["content-security-policy"], /script-src .*sha256-/);
      const portrait = await page.locator(".hero-figure img").evaluate(async (image) => {
        await image.decode();
        return { currentSrc: image.currentSrc, complete: image.complete, naturalWidth: image.naturalWidth };
      });
      assert.ok(portrait.complete && portrait.naturalWidth > 0, `${name}: portrait did not decode`);
      assert.match(new URL(portrait.currentSrc).pathname,
        new RegExp(`saeed-ghezelbash-portrait-${candidate}\\.[a-f0-9]+\\.avif$`),
        `${name}: responsive portrait candidate changed`);
      assert.match(headersFor(new URL(portrait.currentSrc).pathname)["cache-control"], /immutable/,
        "The fixture must preserve the portrait's production cache policy");
      assert.deepEqual(portraitRequests, [portrait.currentSrc],
        `${name}: preload and picture must share one portrait request`);
      assert.deepEqual(externalRequests, [], `${name}: unexpected external requests`);
      assert.deepEqual(errors, [], `${name}: page/CSP errors`);
      runs.push({ profile: name, candidate, portraitRequests: portraitRequests.length });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
}
console.log(JSON.stringify({ valid: true, test: "hero-final-response-delivery", runs }, null, 2));
