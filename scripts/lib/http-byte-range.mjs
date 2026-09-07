import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";

// A partial response has its own contract. Never relax fetchRepresentation's
// rejection of 206, or compare a full Repr-Digest to this partial body.
export async function verifyByteRange(input, representation, { start = 100000, length = 1024, timeoutMs = 45000 } = {}) {
  const url = new URL(input);
  const transport = { "http:": http, "https:": https }[url.protocol];
  assert.ok(transport, "Expected an HTTP(S) video URL");
  assert.ok(Number.isSafeInteger(start) && start >= 0 && Number.isSafeInteger(length) && length > 0 && start + length <= representation.length, "Range must fit the expected artifact");
  const end = start + length - 1;
  return new Promise((resolve, reject) => {
    const request = transport.get(url, {
      headers: { Range: `bytes=${start}-${end}`, "Accept-Encoding": "identity" },
      signal: AbortSignal.timeout(timeoutMs),
    }, (response) => {
      const fail = (error) => { response.destroy(); reject(error); };
      const { headers, statusCode } = response;
      try {
        assert.equal(statusCode, 206, `Expected real partial content: ${url}`);
        assert.equal(headers["content-range"], `bytes ${start}-${end}/${representation.length}`, "Content-Range does not identify the expected artifact slice");
        assert.ok(!headers["content-encoding"] || headers["content-encoding"] === "identity", "Video byte range must use identity encoding");
        assert.match(headers.etag || "", /^"[^"\r\n]+"$/, "Published video must retain a strong ETag");
        if (headers["content-length"] !== undefined) assert.equal(Number(headers["content-length"]), length);
      } catch (error) { fail(error); return; }
      const chunks = [];
      let received = 0;
      response.on("data", (chunk) => {
        received += chunk.length;
        if (received > length) { fail(new Error("Range response exceeded its byte budget")); return; }
        chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => {
        try {
          assert.ok(response.complete, "Truncated range response");
          assert.equal(received, length, "Wrong partial body length");
          assert.deepEqual(Buffer.concat(chunks), representation.subarray(start, end + 1), "Range body differs from the exact distribution bytes");
          resolve({ url: url.href, status: statusCode, contentRange: headers["content-range"], bytes: received, etag: headers.etag, cacheStatus: headers["cf-cache-status"] || null });
        } catch (error) { reject(error); }
      });
    });
    request.on("error", reject);
  });
}
