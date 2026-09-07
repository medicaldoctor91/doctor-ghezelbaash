import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeRenderCalibrationFingerprint } from "./lib/render-calibration-fingerprint.mjs";
import {
  assembleCssSource,
  deriveCssDelivery,
  RENDER_CALIBRATION_WIDTHS,
  renderCalibrationCss,
} from "../src/lib/css-delivery.mjs";

const root = process.cwd();
const canonicalPath = path.join(root, "src/data/render-calibration.json");
const args = process.argv.slice(2);
const writeCanonical = args.includes("--write");
const outputArg = args.find((arg) => arg.startsWith("--output="));
const distArg = args.find((arg) => arg.startsWith("--dist="));
const outputPath = path.resolve(
  root,
  writeCanonical
    ? canonicalPath
    : outputArg?.slice("--output=".length) || ".generated/validation/render-calibration-candidate.json",
);
const distDir = path.resolve(root, distArg?.slice("--dist=".length) || "dist");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message) => {
  throw new Error(message);
};

const baselineRaw = await readFile(canonicalPath, "utf8");
const authoredCss = await readFile(path.join(root, "src/styles/global.css"), "utf8");
const { cssSource } = assembleCssSource(authoredCss, baselineRaw);
const delivery = deriveCssDelivery(cssSource);
const generatedCss = path.join(root, ".generated/public/assets", delivery.assetName);
const distCss = path.join(distDir, "assets", delivery.assetName);
await mkdir(path.dirname(distCss), { recursive: true });
await copyFile(generatedCss, distCss);
const baselineValidation = renderCalibrationCss(baselineRaw);
const baseline = baselineValidation.data;
const expectedIdentity = baseline["360"].chunks.map(({ i, id, key }) => ({ i, id, key }));
const fingerprint = await computeRenderCalibrationFingerprint({ root });

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".woff2", "font/woff2"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".vtt", "text/vtt; charset=utf-8"],
]);

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = path.resolve(distDir, relative);
    const relativeToDist = path.relative(distDir, target);
    if (relativeToDist.startsWith("..") || path.isAbsolute(relativeToDist)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const body = await readFile(target);
    response.setHeader("Content-Type", mime.get(path.extname(target).toLowerCase()) || "application/octet-stream");
    response.setHeader("Cache-Control", "no-store");
    response.writeHead(200).end(body);
  } catch (error) {
    response.writeHead(error?.code === "ENOENT" ? 404 : 500).end(error?.code === "ENOENT" ? "Not found" : "Server error");
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") fail("Unable to resolve calibration server address");
const origin = `http://127.0.0.1:${address.port}`;

const findBrowser = () => {
  const requested = process.env.RENDER_CALIBRATION_BROWSER?.trim();
  const candidates = [requested, "google-chrome-stable", "google-chrome", "chromium", "chromium-browser"].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes(path.sep)) return candidate;
    const resolved = spawnSync("which", [candidate], { encoding: "utf8" });
    if (resolved.status === 0 && resolved.stdout.trim()) return resolved.stdout.trim();
  }
  fail(`No Chromium-family browser found. Tried: ${candidates.join(", ")}`);
};

const profileDir = await mkdtemp(path.join(tmpdir(), "ghezelbaash-render-calibration-"));
const browserExecutable = findBrowser();
const browserArgs = [
  "--headless=new",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-extensions",
  "--disable-sync",
  "--metrics-recording-only",
  "--no-default-browser-check",
  "--no-first-run",
  "--remote-debugging-port=0",
  `--user-data-dir=${profileDir}`,
  "about:blank",
];
if (process.env.CI) browserArgs.unshift("--no-sandbox");
const chrome = spawn(browserExecutable, browserArgs, { stdio: ["ignore", "ignore", "pipe"] });

const devtoolsUrl = await new Promise((resolve, reject) => {
  let stderr = "";
  const timer = setTimeout(() => reject(new Error(`Timed out waiting for Chrome DevTools endpoint. stderr=${stderr.slice(-4000)}`)), 20_000);
  const finish = (value) => {
    clearTimeout(timer);
    resolve(value);
  };
  chrome.stderr.setEncoding("utf8");
  chrome.stderr.on("data", (chunk) => {
    stderr += chunk;
    const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) finish(match[1]);
  });
  chrome.once("error", (error) => {
    clearTimeout(timer);
    reject(error);
  });
  chrome.once("exit", (code, signal) => {
    clearTimeout(timer);
    reject(new Error(`Chrome exited before DevTools was ready: code=${code} signal=${signal} stderr=${stderr.slice(-4000)}`));
  });
});

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message || "CDP error"}: ${JSON.stringify(message.error)}`));
      else resolve(message.result);
    });
  }
  async send(method, params = {}, sessionId = null) {
    await this.ready;
    const id = this.nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    const promise = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify(message));
    return promise;
  }
  close() {
    this.socket.close();
  }
}

const cdp = new CdpClient(devtoolsUrl);
const evaluate = async (sessionId, expression) => {
  const response = await cdp.send(
    "Runtime.evaluate",
    { expression, awaitPromise: true, returnByValue: true, userGesture: false },
    sessionId,
  );
  if (response.exceptionDetails)
    fail(`Browser evaluation failed: ${response.exceptionDetails.text || JSON.stringify(response.exceptionDetails)}`);
  return response.result?.value;
};

const browserVersion = await cdp.send("Browser.getVersion");
const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
await cdp.send("Page.enable", {}, sessionId);
await cdp.send("Runtime.enable", {}, sessionId);

const measured = {};
try {
  for (const width of RENDER_CALIBRATION_WIDTHS) {
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width,
        height: 1200,
        deviceScaleFactor: 1,
        mobile: false,
        screenWidth: width,
        screenHeight: 1200,
      },
      sessionId,
    );
    await cdp.send("Page.navigate", { url: `${origin}/?render-calibration=${width}` }, sessionId);

    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        ready = (await evaluate(sessionId, "document.readyState === 'complete' && document.querySelectorAll('.render-chunk').length > 0")) === true;
      } catch {
        ready = false;
      }
      if (ready) break;
      await sleep(100);
    }
    if (!ready) fail(`Page did not become measurement-ready at ${width}px`);

    const result = await evaluate(
      sessionId,
      `(async () => {
        const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const deadline = Date.now() + 10000;
        let first = document.querySelector('.render-chunk');
        while (first && !getComputedStyle(first).getPropertyValue('--cis').trim() && Date.now() < deadline)
          await pause(50);
        if (!first) throw new Error('No render chunks found');
        if (!getComputedStyle(first).getPropertyValue('--cis').trim())
          throw new Error('Deferred calibration stylesheet did not load');
        await document.fonts.ready;
        try { await document.fonts.load('16px "Vazirmatn"'); } catch {}
        await Promise.all([...document.images].map(async (image) => {
          try {
            image.loading = 'eager';
            if (typeof image.decode === 'function')
              await Promise.race([image.decode(), pause(5000)]);
          } catch {}
        }));
        let override = document.getElementById('render-calibration-measurement-override');
        if (!override) {
          override = document.createElement('style');
          override.id = 'render-calibration-measurement-override';
          override.textContent = '.render-chunk{content-visibility:visible!important;contain-intrinsic-size:none!important}';
          document.head.append(override);
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const chunks = [...document.querySelectorAll('.render-chunk')].map((element, i) => ({
          i,
          id: element.id,
          h: element.getBoundingClientRect().height,
        }));
        return {
          total: document.documentElement.scrollHeight,
          chunks,
          fontReady: document.fonts.check('16px "Vazirmatn"'),
          bodyFont: getComputedStyle(document.body).fontFamily,
          devicePixelRatio,
        };
      })()`,
    );

    if (!result?.fontReady) fail(`Vazirmatn did not become available at ${width}px`);
    if (!Number.isInteger(result.total) || result.total < 100000)
      fail(`Measured document height invalid at ${width}px: ${result?.total}`);
    if (!Array.isArray(result.chunks) || result.chunks.length !== expectedIdentity.length)
      fail(`Measured chunk count drift at ${width}px: ${result?.chunks?.length}`);

    measured[String(width)] = {
      total: result.total,
      chunks: result.chunks.map((chunk, index) => {
        const expected = expectedIdentity[index];
        if (chunk.i !== expected.i || chunk.id !== expected.id)
          fail(`DOM render-chunk identity drift at ${width}:${index}; expected ${expected.id}, got ${chunk.id}`);
        if (!Number.isFinite(chunk.h) || chunk.h < 100)
          fail(`Measured render-chunk height invalid at ${width}:${index}: ${chunk.h}`);
        return { i: expected.i, id: expected.id, key: expected.key, h: chunk.h };
      }),
    };
  }
} finally {
  try {
    await cdp.send("Target.closeTarget", { targetId });
  } catch {}
  cdp.close();
  const browserExited = new Promise((resolve) => {
    if (chrome.exitCode !== null || chrome.signalCode !== null) resolve();
    else chrome.once("exit", resolve);
  });
  chrome.kill("SIGTERM");
  await Promise.race([browserExited, sleep(3000)]);
  if (chrome.exitCode === null && chrome.signalCode === null) {
    chrome.kill("SIGKILL");
    await Promise.race([browserExited, sleep(2000)]);
  }
  await new Promise((resolve) => server.close(resolve));
  await rm(profileDir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}

const percentile = (values, p) => {
  const ordered = [...values].sort((a, b) => a - b);
  if (!ordered.length) return 0;
  return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(p * ordered.length) - 1))];
};
const summarizeErrors = (errors) => ({
  meanAbs: errors.reduce((sum, value) => sum + Math.abs(value), 0) / errors.length,
  p95Abs: percentile(errors.map(Math.abs), 0.95),
  maxAbs: Math.max(...errors.map(Math.abs)),
  rmse: Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / errors.length),
});
const comparison = {};
for (const width of RENDER_CALIBRATION_WIDTHS) {
  const oldEntry = baseline[String(width)];
  const newEntry = measured[String(width)];
  const deltas = newEntry.chunks.map((chunk, index) => chunk.h - oldEntry.chunks[index].h);
  comparison[String(width)] = {
    totalBefore: oldEntry.total,
    totalMeasured: newEntry.total,
    totalDelta: newEntry.total - oldEntry.total,
    chunkDelta: summarizeErrors(deltas),
  };
}

const allHeights = RENDER_CALIBRATION_WIDTHS.flatMap((width) => measured[String(width)].chunks.map((chunk) => chunk.h));
const orderedHeights = [...allHeights].sort((a, b) => a - b);
const medianHeight = orderedHeights[Math.floor(orderedHeights.length / 2)];
const currentFallback = 2800;
const fallbackMetrics = (fallback) => {
  const byWidth = {};
  for (const width of RENDER_CALIBRATION_WIDTHS) {
    const errors = measured[String(width)].chunks.map((chunk) => fallback - chunk.h);
    byWidth[String(width)] = summarizeErrors(errors);
  }
  return { fallback, byWidth };
};
const fallbackComparison = {
  current: fallbackMetrics(currentFallback),
  measuredMedianCandidate: fallbackMetrics(medianHeight),
};

const candidate = {
  _meta: {
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    measuredWith: {
      executable: path.basename(browserExecutable),
      product: browserVersion.product,
      userAgent: browserVersion.userAgent,
      jsVersion: browserVersion.jsVersion,
      protocolVersion: browserVersion.protocolVersion,
      deviceScaleFactor: 1,
    },
    fingerprint,
  },
  ...measured,
};
const candidateRaw = `${JSON.stringify(candidate, null, 2)}\n`;
renderCalibrationCss(candidateRaw);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, candidateRaw);

console.log(
  JSON.stringify(
    {
      measured: true,
      output: path.relative(root, outputPath),
      widths: RENDER_CALIBRATION_WIDTHS,
      chunks: expectedIdentity.length,
      browser: candidate._meta.measuredWith,
      fingerprint,
      comparison,
      fallbackComparison,
      canonicalUpdated: writeCanonical,
    },
    null,
    2,
  ),
);
