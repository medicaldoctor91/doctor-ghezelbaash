import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { verifyByteRange } from "./lib/http-byte-range.mjs";
import { fetchRepresentation } from "./lib/http-representation.mjs";

test("video range verification rejects false success and preserves the full-response contract", async (t) => {
  const representation = Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 251));
  const options = { start: 100, length: 1024, timeoutMs: 2000 };
  const server = createServer((request, response) => {
    assert.equal(request.headers.range, "bytes=100-1123");
    const mode = request.url.slice(1);
    const headers = { "Content-Type": "video/mp4", "Content-Range": "bytes 100-1123/4096", ETag: '"strong-video"' };
    let bytes = representation.subarray(100, 1124);
    if (mode === "wrong-range") headers["Content-Range"] = "bytes 0-1023/4096";
    if (mode === "wrong-total") headers["Content-Range"] = "bytes 100-1123/4097";
    if (mode === "weak") headers.ETag = 'W/"weak-video"';
    if (mode === "missing-etag") delete headers.ETag;
    if (mode === "encoded") headers["Content-Encoding"] = "gzip";
    if (mode === "wrong-bytes") bytes = Buffer.alloc(1024);
    if (mode === "short") bytes = bytes.subarray(0, 1000);
    if (mode === "oversized") bytes = representation;
    if (mode === "wrong-length") headers["Content-Length"] = "1000";
    const status = ["200", "302", "304"].includes(mode) ? Number(mode) : 206;
    response.writeHead(status, headers);
    response.end(bytes);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const valid = await verifyByteRange(`${origin}/valid`, representation, options);
  assert.equal(valid.bytes, 1024);
  for (const mode of ["200", "302", "304", "wrong-range", "wrong-total", "weak", "missing-etag", "encoded", "wrong-bytes", "short", "oversized", "wrong-length"]) {
    await assert.rejects(verifyByteRange(`${origin}/${mode}`, representation, options), undefined, `${mode} must fail`);
  }
  for (const mode of ["valid", "304"]) {
    await assert.rejects(fetchRepresentation(`${origin}/${mode}`, { headers: { Range: "bytes=100-1123" } }), /Expected a complete representation/);
  }
});
