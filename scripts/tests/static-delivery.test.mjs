import test from "node:test";
import assert from "node:assert/strict";
import { canonicalHostAliasRows, canonicalMetadataAliasRows, contentAliasTargets, renderStaticRewrites } from "../lib/redirect-registry.mjs";
import { expandMachineAliasHeaders, assertCloudflareHeadersContract } from "../lib/headers-template.mjs";

const registry = (rules) => ({ schemaVersion: 4, canonicalOrigin: "https://www.ghezelbaash.ir",
  canonicalHostAliases: { host: "www.ghezelbaash.ir", rules } });
const row = (source, target) => ({ source, target, statusCode: 200 });
test("legacy slash aliases retain targets without duplicating an authored path", () => {
  assert.deepEqual(canonicalHostAliasRows(registry([row("/contact/", "/clinic"), row("/botox/", "/botox")])),
    [row("/contact/", "/clinic"), row("/contact", "/clinic"), row("/botox/", "/botox")]);
  assert.throws(() => canonicalHostAliasRows(registry([row("/contact/", "/clinic"), row("/contact", "/other")])), /disagree/);
});
test("registry and final delivery reject URL-changing redirects", () => {
  for (const statusCode of [301, 302, 303, 307, 308]) {
    assert.throws(() => canonicalHostAliasRows(registry([{ ...row("/old", "/new"), statusCode }])), /preserve/);
    assert.throws(() => renderStaticRewrites([{ ...row("/old", "/index.html"), statusCode }]), /status/);
  }
  assert.throws(() => renderStaticRewrites([row("/a", "/index.html"), row("/a", "/index.html")]), /Duplicate/);
  assert.throws(() => renderStaticRewrites([row("/*", "/index.html")]), /source/);
  assert.throws(() => renderStaticRewrites([row("/a", "//elsewhere.test")]), /destination/);
  assert.throws(() => renderStaticRewrites(Array.from({length: 2001}, (_, i) => row("/a" + i, "/index.html"))), /2000/);
});
test("named metadata definitions are served directly without inventing reference routes", () => {
  const origin = "https://www.ghezelbaash.ir";
  const graph = { "@graph": [
    { "@id": origin + "/website", "@type": "WebSite" },
    { "@id": origin + "/graph.jsonld/dataset", "@type": "Dataset",
      nested: { "@id": origin + "/provenance.jsonld/source", name: "Source" } },
    { "@id": origin + "/graph.jsonld/reference" },
    { "@id": origin + "/graph.jsonld/dataset#fragment", name: "Fragment" },
    { "@id": "https://elsewhere.test/graph.jsonld/dataset", name: "Remote" },
  ]};
  assert.deepEqual(canonicalMetadataAliasRows(graph, origin + "/"), [
    row("/graph.jsonld/dataset", "/graph.jsonld"),
    row("/provenance.jsonld/source", "/graph.jsonld"),
    row("/website", "/graph.jsonld"),
  ]);
});
test("content aliases decode Persian paths and spaces, exclude machine aliases, and reject conflicts", () => {
  const aliases = contentAliasTargets([
    row("/دکتر%20قزلباش", "/physician"), row("/دکتر قزلباش", "/physician"),
    row("/kg/", "/graph.jsonld"), row("/services/", "/services"),
  ], new Set(["/graph.jsonld"]));
  assert.equal(aliases["/دکتر قزلباش"], "/physician");
  assert(!Object.hasOwn(aliases, "/kg/"));
  assert.equal(aliases["/services/"], "/services");
  assert.throws(() => contentAliasTargets([
    row("/name%20surname", "/a"), row("/name surname", "/b")
  ], new Set()), /disagree/);
});
test("machine aliases receive graph MIME, canonical, CORS, and cache headers within Pages limits", () => {
  const headers = "/*\n  X-Content-Type-Options: nosniff\n\n/graph.jsonld\n  Content-Type: application/ld+json; charset=utf-8\n  Link: <https://www.ghezelbaash.ir/graph.jsonld>; rel=\"canonical\"\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=3600\n";
  const expanded = expandMachineAliasHeaders(headers, ["/graph.jsonld/*", "/website", "/website"]);
  assert.equal(assertCloudflareHeadersContract(expanded).rules, 4);
  for (const source of ["/graph.jsonld/*", "/website"]) {
    const body = expanded.slice(expanded.indexOf(source + "\n")).split("\n\n")[0];
    assert(body.includes("Content-Type: application/ld+json"));
    assert(body.includes("Access-Control-Allow-Origin: *"));
    assert(body.includes('rel="canonical"'));
  }
  assert.throws(() => expandMachineAliasHeaders(headers, Array.from({length: 99}, (_, i) => "/id" + i)), /100 rules/);
});
