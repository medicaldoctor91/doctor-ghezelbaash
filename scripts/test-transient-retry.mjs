import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchRepresentationWithRetry, transientReason } from "./lib/transient-retry.mjs";

const pythonReset = "CLOUDFLARE_EDGE_ERROR: <urlopen error [Errno 104] Connection reset by peer>";
assert.ok(transientReason(pythonReset));
assert.ok(transientReason(new Error("fetch failed", { cause: new Error(pythonReset) })));
const permanentErrors = [
  "CLOUDFLARE_EDGE_ERROR: HTTP Error 401: Unauthorized",
  "CLOUDFLARE_EDGE_ERROR: HTTP Error 403: Forbidden",
  "CLOUDFLARE_EDGE_ERROR: Cloudflare configuration drift",
  "Repr-Digest sha-256 does not match",
  "CLOUDFLARE_EDGE_ERROR: <urlopen error [Errno 13] Permission denied>",
  "CLOUDFLARE_EDGE_ERROR: <urlopen error [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed>",
  "Connection reset by peer",
  "<urlopen error [Errno 104] unknown failure>",
];
for (const message of permanentErrors) assert.equal(transientReason(message), null);

// Exercise the actual command boundary, including retry count and exit status.
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "transient-retry-test-"));
try {
  const state = path.join(temporaryDirectory, "attempts");
  const child = `
    import { readFileSync, writeFileSync } from "node:fs";
    const [state, diagnostic, mode] = process.argv.slice(1);
    const attempt = Number(readFileSync(state, "utf8")) + 1;
    writeFileSync(state, String(attempt));
    if (mode === "always" || attempt === 1) {
      console.error(diagnostic);
      process.exit(1);
    }
    console.log("RECOVERED");
  `;
  const run = (diagnostic, mode) => spawnSync(process.execPath, [
    fileURLToPath(new URL("./run-transient-command.mjs", import.meta.url)),
    "--", process.execPath, "--input-type=module", "-e", child, state, diagnostic, mode,
  ], { encoding: "utf8", timeout: 15000 });
  await writeFile(state, "0");
  const recovered = run(pythonReset, "once");
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(await readFile(state, "utf8"), "2");
  assert.match(recovered.stdout, /RECOVERED/);
  assert.equal((recovered.stderr.match(/TRANSIENT_COMMAND_RETRY/g) || []).length, 1);
  for (const diagnostic of permanentErrors.slice(0, 4)) {
    await writeFile(state, "0");
    const failed = run(diagnostic, "always");
    assert.equal(failed.status, 1, failed.stderr);
    assert.equal(await readFile(state, "utf8"), "1");
    assert.doesNotMatch(failed.stderr, /TRANSIENT_COMMAND_RETRY/);
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

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
