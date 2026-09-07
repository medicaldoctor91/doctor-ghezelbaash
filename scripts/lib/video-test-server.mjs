import path from "node:path";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createHash } from "node:crypto";

const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".woff2": "font/woff2", ".avif": "image/avif", ".webp": "image/webp",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".json": "application/json", ".mp4": "video/mp4", ".webm": "video/webm",
  ".vtt": "text/vtt; charset=utf-8",
};
const metadataPrefixBytes = 128 * 1024;

// This server is deliberately separate from the geometry measurement server.
// slow-full holds the body after its metadata prefix until the browser test has
// observed the initial seek, then sends the remainder in small timed chunks.
export async function withVideoSite(directory, { transport }, run) {
  if (!["range", "slow-full"].includes(transport)) throw new Error("Unknown video transport");
  const root = path.resolve(directory);
  await readFile(path.join(root, "index.html"));
  const requests = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const file = path.resolve(root, `.${pathname.endsWith("/") ? `${pathname}index.html` : pathname}`);
      if (!file.startsWith(`${root}${path.sep}`) || !["GET", "HEAD"].includes(request.method)) {
        response.writeHead(403).end();
        return;
      }
      const extension = path.extname(file);
      const bytes = await readFile(file);
      const media = [".mp4", ".webm"].includes(extension);
      const headers = { "Content-Type": mime[extension] || "application/octet-stream", "Cache-Control": "no-store" };
      if (media) {
        headers["Cache-Control"] = "public, max-age=31536000, immutable";
        headers.ETag = `"${createHash("sha256").update(bytes).digest("hex")}"`;
      }
      let start = 0, end = bytes.length - 1, status = 200;
      if (media && transport === "range") {
        headers["Accept-Ranges"] = "bytes";
        if (request.headers.range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
          if (match && (match[1] || match[2])) {
            start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2]));
            end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
          }
          if (!match || (!match[1] && !match[2]) || start > end || start >= bytes.length) {
            response.writeHead(416, { "Content-Range": `bytes */${bytes.length}` }).end();
            return;
          }
          status = 206;
          headers["Content-Range"] = `bytes ${start}-${end}/${bytes.length}`;
        }
      }
      headers["Content-Length"] = end - start + 1;
      response.writeHead(status, headers);
      if (request.method === "HEAD") { response.end(); return; }
      const record = { pathname, range: request.headers.range || null, status, contentRange: headers["Content-Range"] || null, length: end - start + 1, sent: 0, complete: false };
      if (media) requests.push(record);
      if (!media || transport === "range") {
        record.sent = end - start + 1;
        record.complete = true;
        response.end(bytes.subarray(start, end + 1));
        return;
      }
      let timer;
      response.once("close", () => clearTimeout(timer));
      const send = () => {
        if (response.destroyed) return;
        const chunk = bytes.subarray(record.sent, record.sent + 64 * 1024);
        record.sent += chunk.length;
        response.write(chunk);
        if (record.sent === bytes.length) {
          record.complete = true;
          response.end();
        } else {
          timer = setTimeout(send, 25);
        }
      };
      // 128 KiB contains these published files' metadata, but not the tested
      // destination frames. The test asserts that fact before releasing the gate.
      response.write(bytes.subarray(0, metadataPrefixBytes));
      record.sent = Math.min(bytes.length, metadataPrefixBytes);
      await gate;
      send();
    } catch (error) {
      if (response.headersSent) response.destroy(error);
      else response.writeHead(error.code === "ENOENT" || error.code === "EISDIR" ? 404 : 500).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    return await run({ url: `http://127.0.0.1:${server.address().port}/`, requests, release });
  } finally {
    release();
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  }
}
