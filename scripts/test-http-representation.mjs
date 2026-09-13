import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { gzipSync, brotliCompressSync } from "node:zlib";
import test from "node:test";
import { fetchRepresentation, verifyReprDigest } from "./lib/http-representation.mjs";
import { compileHeadersTemplate, assertCloudflareHeadersContract } from "./lib/headers-template.mjs";
import { assertGooglebotBudgetContract, assertGooglebotResponseBudget } from "./lib/googlebot-budget.mjs";

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
    assert.ok(Number.isSafeInteger(result.responseHeaderBytes) && result.responseHeaderBytes > 0);
    if (path !== "identity") assert.notDeepEqual(result.encodedBytes, body);
  }
  await assert.rejects(fetchRepresentation(`${origin}/wrong-digest`), /does not match the encoded representation/);
  assert.equal(verifyReprDigest(null, body), null);
  assert.throws(() => verifyReprDigest("sha-256=invalid", body), /Malformed/);
});

test("response byte accounting retains repeated header fields and status framing", async (t) => {
  const fields = [
    "Content-Type", "text/plain",
    "X-Repeated", "first",
    "X-Repeated", "second",
    "Content-Length", String(body.length),
    "Connection", "close",
  ];
  const server = createServer((_request, response) => {
    response.sendDate = false;
    response.writeHead(200, fields);
    response.end(body);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const result = await fetchRepresentation(`http://127.0.0.1:${server.address().port}/`);
  let raw = "HTTP/1.1 200 OK\r\n";
  for (let index = 0; index < fields.length; index += 2)
    raw += `${fields[index]}: ${fields[index + 1]}\r\n`;
  raw += "\r\n";
  assert.equal(result.responseHeaderBytes, Buffer.byteLength(raw, "latin1"));
  assert.equal(result.r.headers.get("x-repeated"), "first, second");
});

test("Googlebot budget rejects an inflated ceiling and reserves headers before the cutoff", async () => {
  const invariants = JSON.parse(await readFile("src/data/release-invariants.json", "utf8"));
  assert.equal(invariants.googlebotFetchBudgetBytes, 2_000_000);
  assertGooglebotBudgetContract(invariants);
  const measure = (bodyBytes, responseHeaderBytes = 20_000) =>
    assertGooglebotResponseBudget({ bodyBytes, responseHeaderBytes }, invariants);
  assert.equal(measure(1_949_999).remainingBytes, 1);
  assert.throws(() => measure(1_950_000), /HTML safety ceiling/);
  assert.throws(() => measure(1_900_000, 20_001), /headers exceed reserved/);
  assert.throws(() => measure(Number.NaN), /integer bytes/);
  assert.throws(() => assertGooglebotBudgetContract({ ...invariants, googlebotFetchBudgetBytes: 2_100_000 }), /2 MB ceiling/);
  assert.throws(() => assertGooglebotBudgetContract({ ...invariants, googlebotSafetyMarginBytes: 80_000 }), /contract exceeds/);
  for (const invalid of [0, -1, 0.5, Number.NaN])
    assert.throws(() => assertGooglebotBudgetContract({ ...invariants, googlebotSafetyMarginBytes: invalid }), /integer bytes/);
});

test("compression cannot make an oversized Googlebot document pass", async (t) => {
  const invariants = JSON.parse(await readFile("src/data/release-invariants.json", "utf8"));
  const oversized = Buffer.alloc(invariants.maxHtmlBytes, 0x61);
  const compressed = gzipSync(oversized);
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Encoding": "gzip", "Content-Length": compressed.length });
    response.end(compressed);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const result = await fetchRepresentation(`http://127.0.0.1:${server.address().port}/`);
  assert.ok(result.encodedBytes.length < 10_000);
  assert.equal(result.b.length, oversized.length);
  assert.throws(() => assertGooglebotResponseBudget({
    bodyBytes: result.b.length, responseHeaderBytes: result.responseHeaderBytes,
  }, invariants), /HTML safety ceiling/);
});

test("headers bind curated discovery and reject unknown digest placeholders", () => {
  const template = "/\n  CSP: {{MAIN_CSP}}\n/404\n  CSP: {{404_CSP}}\n  Link: {{HTTP_RESOURCE_LINKS}}\n";
  const bindings = {
    mainCsp: "default-src 'self'",
    csp404: "default-src 'none'",
    httpResourceLinks: '<https://example.test/graph.jsonld>; rel="alternate"; type="application/ld+json"',
  };
  const headers = compileHeadersTemplate(template, bindings);
  assert.ok(headers.includes(bindings.httpResourceLinks));
  assert.doesNotMatch(headers, /\{\{|repr-digest/i);
  assert.throws(() => compileHeadersTemplate(`${template}{{DIGEST:index.html}}`, bindings), /unknown token/);
  assert.throws(() => compileHeadersTemplate(`${template}{{HERO_EARLY_HINT_HREF}}`, bindings), /unknown token/);
  assert.throws(() => compileHeadersTemplate(template, { ...bindings, httpResourceLinks: "" }), /HTTP resource links missing/);
  assert.throws(() => compileHeadersTemplate(template, { ...bindings, httpResourceLinks: "x".repeat(2_000) }), /exceeds 2000 characters/);
});

test("Cloudflare header limits include interpolation, spacing and all rules", () => {
  const line = `  X-Test: ${"x".repeat(1_990)}`;
  assert.equal(line.length, 2_000);
  assert.equal(assertCloudflareHeadersContract(`/\n${line}\n`).maximumLineCharacters, 2_000);
  assert.throws(() => assertCloudflareHeadersContract(`/\n${line}x\n`), /exceeds 2000 characters/);
  const rules = Array.from({ length: 100 }, (_, index) => `/test-${index}\n  X-Test: pass`).join("\n\n");
  assert.equal(assertCloudflareHeadersContract(rules).rules, 100);
  assert.throws(() => assertCloudflareHeadersContract(`${rules}\n/extra\n  X-Test: fail`), /exceeds 100 rules/);
});
