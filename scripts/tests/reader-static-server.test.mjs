import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { startReaderStaticServer } from "../lib/reader-static-server.mjs";

const homepage = '<html><head><link rel="canonical" href="https://clinic.example/"></head><body>Home</body></html>';
const page = "<h1>راهنما</h1>";
const notFound = '<h1>Missing</h1><meta name="robots" content="noindex">';

async function fixture(t, { headers = "", redirects = "", files = {} } = {}) {
  const workspace = await mkdtemp(path.join(tmpdir(), "reader-static-server-"));
  const distDirectory = path.join(workspace, "dist");
  await mkdir(distDirectory);
  const entries = { "index.html": homepage, "page.html": page, "404.html": notFound,
    "directory/index.html": "Directory", "graph.jsonld": '{"@graph":[]}',
    "media/clip.mp4": "0123456789", "_headers": headers, "_redirects": redirects, ...files };
  for (const [name, content] of Object.entries(entries)) {
    const file = path.join(distDirectory, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  const server = await startReaderStaticServer({ distDirectory });
  t.after(async () => { await server.close(); await rm(workspace, { recursive: true, force: true }); });
  return { ...server, distDirectory, workspace };
}

function request(origin, pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(origin);
    const outgoing = http.request({ hostname: url.hostname, port: url.port, path: pathname, ...options }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers,
        rawHeaders: response.rawHeaders, body: Buffer.concat(chunks).toString("utf8") }));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

test("startup rules preserve matching CSP policies and isolate absolute preview hosts", async (t) => {
  const { origin, distDirectory } = await fixture(t, { headers: `/*
  Content-Security-Policy: default-src 'self'
  X-Root: present
https://:project.pages.dev/*
  X-Robots-Tag: noindex
https://:version.:project.pages.dev/*
  X-Preview: excluded
https://other.example/*
  X-Other: excluded
https://clinic.example/*
  X-Canonical-Host: present
/
  Content-Security-Policy: script-src 'none'
  Link: </graph.jsonld>; rel="describedby"
  Link: </>; rel="canonical"
` });
  // Serving requests must not reopen either rule file.
  await rm(path.join(distDirectory, "_headers"));
  await rm(path.join(distDirectory, "_redirects"));
  const result = await request(origin, "/?source=local");
  assert.equal(result.status, 200);
  assert.equal(result.body, homepage);
  assert.equal(result.headers["x-root"], "present");
  assert.equal(result.headers["x-canonical-host"], "present");
  assert.equal(result.headers["x-robots-tag"], undefined);
  assert.equal(result.headers["x-preview"], undefined);
  assert.equal(result.headers["x-other"], undefined);
  const policies = result.rawHeaders.flatMap((key, index) =>
    key.toLowerCase() === "content-security-policy" ? [result.rawHeaders[index + 1]] : []);
  assert.deepEqual(policies, ["default-src 'self'", "script-src 'none'"]);
  assert.equal(result.headers.link, '</graph.jsonld>; rel="describedby", </>; rel="canonical"');
});

test("redirects preserve queries and fragments while keeping canonical destinations local", async (t) => {
  const { origin } = await fixture(t, { redirects: `/old /#section 301
/explicit /page?fixed=1#topic 301
/absolute https://clinic.example/page#topic 301
/external https://other.example/page 301
/older/:topic /#:topic 301
/دکتر%20قزلباش /#physician 301
` });
  for (const [pathname, location] of [["/old?campaign=one", "/?campaign=one#section"],
    ["/explicit?campaign=one", "/page?fixed=1#topic"], ["/absolute?campaign=one", "/page?campaign=one#topic"],
    ["/older/botox?campaign=one", "/?campaign=one#botox"],
    ["/" + encodeURIComponent("دکتر قزلباش"), "/#physician"]]) {
    const result = await request(origin, pathname);
    assert.equal(result.status, 301, pathname);
    assert.equal(result.headers.location, location, pathname);
    assert.equal(new URL(result.headers.location, origin).origin, origin);
  }
  const external = await request(origin, "/external");
  assert.equal(external.status, 502);
  assert.equal(external.headers.location, undefined);
});

test("200 rewrites use the original request path for delivery headers", async (t) => {
  const { origin } = await fixture(t, { redirects: "/machine/:entity /graph.jsonld 200\n",
    headers: `/*
  X-Root: present
/graph.jsonld
  X-Target: direct only
/machine/:entity
  Content-Type: application/ld+json; profile="https://www.w3.org/TR/json-ld11/"
  X-Entity: :entity
  Access-Control-Allow-Origin: *
` });
  const rewritten = await request(origin, "/machine/website?read=1");
  assert.equal(rewritten.status, 200);
  assert.equal(rewritten.body, '{"@graph":[]}');
  assert.equal(rewritten.headers["content-type"], 'application/ld+json; profile="https://www.w3.org/TR/json-ld11/"');
  assert.equal(rewritten.headers["x-entity"], "website");
  assert.equal(rewritten.headers["x-root"], "present");
  assert.equal(rewritten.headers["x-target"], undefined);
  assert.equal(rewritten.headers["access-control-allow-origin"], "*");
  const direct = await request(origin, "/graph.jsonld");
  assert.equal(direct.headers["content-type"], "application/ld+json");
  assert.equal(direct.headers["x-target"], "direct only");
});

test("native HTML normalization, request-path 404 headers and HEAD retain file semantics", async (t) => {
  const { origin } = await fixture(t, { headers: `/*
  X-Root: present
/404.html
  X-Fallback-File: not inherited
`, redirects: "/index.html / 301\n" });
  for (const [pathname, status, location] of [["/page.html?read=1", 308, "/page?read=1"],
    ["/page/?read=1", 308, "/page?read=1"], ["/directory?read=1", 308, "/directory/?read=1"],
    ["/directory/index.html?read=1", 308, "/directory/?read=1"], ["/index.html?read=1", 301, "/?read=1"]]) {
    const result = await request(origin, pathname);
    assert.equal(result.status, status, pathname);
    assert.equal(result.headers.location, location, pathname);
  }
  assert.equal((await request(origin, "/directory/")).body, "Directory");
  const get = await request(origin, "/page");
  assert.equal(get.status, 200);
  assert.equal(get.body, page);
  assert.equal(get.headers["content-type"], "text/html; charset=utf-8");
  const head = await request(origin, "/page", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.body, "");
  assert.equal(Number(head.headers["content-length"]), Buffer.byteLength(page));
  const missing = await request(origin, "/unknown.html");
  assert.equal(missing.status, 404);
  assert.equal(missing.body, notFound);
  assert.equal(missing.headers["content-type"], "text/html; charset=utf-8");
  assert.equal(missing.headers["x-root"], "present");
  assert.equal(missing.headers["x-fallback-file"], undefined);
  const missingHead = await request(origin, "/unknown", { method: "HEAD" });
  assert.equal(missingHead.status, 404);
  assert.equal(missingHead.body, "");
  assert.equal(Number(missingHead.headers["content-length"]), Buffer.byteLength(notFound));
  const method = await request(origin, "/page", { method: "POST" });
  assert.equal(method.status, 405);
  assert.equal(method.headers.allow, "GET, HEAD");
});

test("file placeholders do not overlap nested derived or master cache policies", async (t) => {
  const { origin } = await fixture(t, { headers: `/media/images/physician/:file
  Cache-Control: public, max-age=31536000, immutable
  X-File: :file
/media/images/physician/derived/*
  Cache-Control: public, max-age=31536000, immutable
/media/images/physician/master/*
  Cache-Control: public, max-age=3600
`, files: { "media/images/physician/portrait.webp": "portrait",
      "media/images/physician/derived/portrait.webp": "derived", "media/images/physician/master/portrait.webp": "master",
      "media/images/physician/a*b.webp": "literal star" } });
  const portrait = await request(origin, "/media/images/physician/portrait.webp");
  assert.equal(portrait.headers["x-file"], "portrait.webp");
  assert.equal(portrait.headers["content-type"], "image/webp");
  for (const [kind, cache] of [["derived", "public, max-age=31536000, immutable"], ["master", "public, max-age=3600"]]) {
    const result = await request(origin, `/media/images/physician/${kind}/portrait.webp`);
    assert.equal(result.status, 200);
    assert.equal(result.headers["cache-control"], cache);
    assert.equal(result.headers["x-file"], undefined);
  }
  assert.equal((await request(origin, "/media/images/physician/a*b.webp")).headers["x-file"], "a*b.webp");
});

test("raw and encoded traversal, malformed paths and outside symlinks cannot read outside dist", async (t) => {
  const { origin, distDirectory, workspace } = await fixture(t);
  await writeFile(path.join(workspace, "secret.txt"), "PRIVATE FILE");
  await symlink(path.join(workspace, "secret.txt"), path.join(distDirectory, "outside.txt"));
  for (const pathname of ["/../secret.txt", "/%2e%2e/secret.txt", "/%2e%2e%2fsecret.txt",
    "/%5c..%5csecret.txt", "/%00secret.txt", "/bad%ZZ", "/outside.txt"]) {
    const result = await request(origin, pathname);
    assert.equal(result.status, 400, pathname);
    assert(!result.body.includes("PRIVATE FILE"), pathname);
  }
  assert.equal((await request(origin, "/_headers")).status, 404);
  assert.equal((await request(origin, "/_redirects")).status, 404);
});

test("video byte ranges stream bounded, suffix and open ranges with correct HEAD metadata", async (t) => {
  const { origin } = await fixture(t);
  for (const [range, body, contentRange] of [["bytes=0-3", "0123", "bytes 0-3/10"],
    ["bytes=-3", "789", "bytes 7-9/10"], ["bytes=5-", "56789", "bytes 5-9/10"],
    ["bytes=8-100", "89", "bytes 8-9/10"]]) {
    const result = await request(origin, "/media/clip.mp4", { headers: { Range: range } });
    assert.equal(result.status, 206);
    assert.equal(result.body, body);
    assert.equal(result.headers["content-type"], "video/mp4");
    assert.equal(result.headers["content-range"], contentRange);
    assert.equal(Number(result.headers["content-length"]), Buffer.byteLength(body));
  }
  const head = await request(origin, "/media/clip.mp4", { method: "HEAD", headers: { Range: "bytes=0-3" } });
  assert.equal(head.status, 206);
  assert.equal(head.body, "");
  assert.equal(head.headers["content-range"], "bytes 0-3/10");
  assert.equal(head.headers["content-length"], "4");
  const unsatisfiable = await request(origin, "/media/clip.mp4", { headers: { Range: "bytes=20-" } });
  assert.equal(unsatisfiable.status, 416);
  assert.equal(unsatisfiable.headers["content-range"], "bytes */10");
  assert.equal(unsatisfiable.body, "");
  const multipart = await request(origin, "/media/clip.mp4", { headers: { Range: "bytes=0-1,4-5" } });
  assert.equal(multipart.status, 200);
  assert.equal(multipart.body, "0123456789");
});
