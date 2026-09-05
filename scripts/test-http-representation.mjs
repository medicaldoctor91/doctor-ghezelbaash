import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { gzipSync, brotliCompressSync } from "node:zlib";
import test from "node:test";
import { fetchRepresentation, verifyReprDigest } from "./lib/http-representation.mjs";
import { compileHeadersTemplate } from "./lib/headers-template.mjs";

const body = Buffer.from("متن فارسی برای آزمون بایت‌های دریافت‌شده\n".repeat(20));
const digest = (bytes) => `sha-256=:${createHash("sha256").update(bytes).digest("base64")}:`;

test("wire digests verify encoded bytes while artifact identity uses decoded bytes", async (t) => {
  const server = createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "/gzip" });
      response.end();
      return;
    }
    const encoding = request.url === "/br" ? "br" : request.url === "/identity" ? "identity" : "gzip";
    const bytes = encoding === "br" ? brotliCompressSync(body) : encoding === "gzip" ? gzipSync(body) : body;
    response.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "content-encoding": encoding,
      "repr-digest": digest(request.url === "/wrong-digest" ? body : bytes),
    });
    response.end(bytes);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of ["identity", "gzip", "br", "redirect"]) {
    const result = await fetchRepresentation(`${origin}/${path}`);
    assert.equal(result.r.status, 200);
    assert.equal(result.reprDigestVerified, true);
    assert.deepEqual(result.b, body);
    if (path !== "identity") assert.notDeepEqual(result.encodedBytes, body);
  }
  await assert.rejects(fetchRepresentation(`${origin}/wrong-digest`), /does not match the encoded representation/);
  assert.equal(verifyReprDigest(null, body), null);
  assert.throws(() => verifyReprDigest("sha-256=invalid", body), /Malformed/);
});

test("headers bind curated discovery and reject unknown digest placeholders", () => {
  const template = "/\n  CSP: {{MAIN_CSP}}\n/404\n  CSP: {{404_CSP}}\n  Hero: {{HERO_EARLY_HINT_HREF}}\n  Link: {{HTTP_RESOURCE_LINKS}}\n";
  const bindings = {
    mainCsp: "default-src 'self'",
    csp404: "default-src 'none'",
    heroEarlyHintHref: "/hero.avif",
    httpResourceLinks: '<https://example.test/graph.jsonld>; rel="alternate"; type="application/ld+json"',
  };
  const headers = compileHeadersTemplate(template, bindings);
  assert.ok(headers.includes(bindings.httpResourceLinks));
  assert.doesNotMatch(headers, /\{\{|repr-digest/i);
  assert.throws(() => compileHeadersTemplate(`${template}{{DIGEST:index.html}}`, bindings), /unknown token/);
  assert.throws(() => compileHeadersTemplate(template, { ...bindings, httpResourceLinks: "" }), /HTTP resource links missing/);
});
