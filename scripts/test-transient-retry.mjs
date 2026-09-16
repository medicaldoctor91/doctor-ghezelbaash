import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { fetchRepresentationWithRetry } from "./lib/transient-retry.mjs";

const counts = new Map();
const hit = (path) => {
  const count = (counts.get(path) || 0) + 1;
  counts.set(path, count);
  return count;
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const count = hit(url.pathname);
  if (url.pathname === "/reset") {
    if (count === 1) {
      req.socket.destroy();
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  if (url.pathname === "/status") {
    if (count === 1) {
      res.writeHead(503, { "content-type": "text/plain" });
      res.end("retry");
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  if (url.pathname === "/not-found") {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("no retry");
    return;
  }
  if (url.pathname === "/digest") {
    res.writeHead(200, {
      "content-type": "text/plain",
      "repr-digest": "sha-256=:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=:"
    });
    res.end("integrity failure");
    return;
  }
  res.writeHead(500);
  res.end();
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;
try {
  const reset = await fetchRepresentationWithRetry(`${base}/reset`, {}, { attempts: 3, baseDelayMs: 10 });
  assert.equal(reset.r.status, 200);
  assert.equal(reset.b.toString(), "ok");
  assert.equal(counts.get("/reset"), 2);

  const status = await fetchRepresentationWithRetry(`${base}/status`, {}, { attempts: 3, baseDelayMs: 10 });
  assert.equal(status.r.status, 200);
  assert.equal(status.b.toString(), "ok");
  assert.equal(counts.get("/status"), 2);

  const notFound = await fetchRepresentationWithRetry(`${base}/not-found`, {}, { attempts: 3, baseDelayMs: 10 });
  assert.equal(notFound.r.status, 404);
  assert.equal(counts.get("/not-found"), 1);

  await assert.rejects(
    fetchRepresentationWithRetry(`${base}/digest`, {}, { attempts: 3, baseDelayMs: 10 }),
    /Repr-Digest sha-256 does not match/,
  );
  assert.equal(counts.get("/digest"), 1);
  console.log("TRANSIENT_RETRY_BOUNDARY_PASS");
} finally {
  server.close();
  await once(server, "close");
}
