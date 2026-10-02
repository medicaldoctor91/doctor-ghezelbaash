import test from "node:test";
import assert from "node:assert/strict";
import { canonicalHostAliasRows, canonicalMetadataAliasRows, contentAliasTargets, renderStaticRewrites } from "../lib/redirect-registry.mjs";
import { expandMachineAliasHeaders, assertCloudflareHeadersContract } from "../lib/headers-template.mjs";

const registry = (rules) => ({ schemaVersion: 4, canonicalOrigin: "https://www.ghezelbaash.ir",
  canonicalHostAliases: { host: "www.ghezelbaash.ir", rules } });
const redirectRow = (source, target) => ({ source, target, statusCode: 301 });
const rewriteRow = (source, target) => ({ source, target, statusCode: 200 });
test("legacy slash aliases retain permanent targets without duplicating an authored path", () => {
  assert.deepEqual(canonicalHostAliasRows(registry([redirectRow("/contact/", "/clinic"), redirectRow("/botox/", "/botox")])),
    [redirectRow("/contact/", "/clinic"), redirectRow("/contact", "/clinic"), redirectRow("/botox/", "/botox")]);
  assert.throws(() => canonicalHostAliasRows(registry([redirectRow("/contact/", "/clinic"), redirectRow("/contact", "/other")])), /disagree/);
});
test("registry requires 301 while final delivery permits exact rewrites and permanent redirects", () => {
  for (const statusCode of [200, 302, 303, 307, 308])
    assert.throws(() => canonicalHostAliasRows(registry([{ ...redirectRow("/old", "/new"), statusCode }])), /permanently redirect/);
  assert.doesNotThrow(() => renderStaticRewrites([redirectRow("/old", "/new"), { ...redirectRow("/older", "/new"), statusCode: 308 }, rewriteRow("/website", "/graph.jsonld")]));
  for (const statusCode of [302, 303, 307])
    assert.throws(() => renderStaticRewrites([{ ...redirectRow("/old", "/new"), statusCode }]), /status/);
  assert.throws(() => renderStaticRewrites([rewriteRow("/a", "/index.html"), rewriteRow("/a", "/index.html")]), /Duplicate/);
  assert.throws(() => renderStaticRewrites([rewriteRow("/*", "/index.html")]), /source/);
  assert.throws(() => renderStaticRewrites([rewriteRow("/a", "//elsewhere.test")]), /destination/);
  assert.throws(() => renderStaticRewrites(Array.from({length: 2001}, (_, i) => rewriteRow("/a" + i, "/index.html"))), /2000/);
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
    rewriteRow("/graph.jsonld/dataset", "/graph.jsonld"),
    rewriteRow("/provenance.jsonld/source", "/graph.jsonld"),
    rewriteRow("/website", "/graph.jsonld"),
  ]);
});
test("content aliases decode Persian paths and spaces, exclude machine aliases, and reject conflicts", () => {
  const aliases = contentAliasTargets([
    redirectRow("/دکتر%20قزلباش", "/physician"), redirectRow("/دکتر قزلباش", "/physician"),
    rewriteRow("/kg/", "/graph.jsonld"), redirectRow("/services/", "/services"),
  ], new Set(["/graph.jsonld"]));
  assert.equal(aliases["/دکتر قزلباش"], "/physician");
  assert(!Object.hasOwn(aliases, "/kg/"));
  assert.equal(aliases["/services/"], "/services");
  assert.throws(() => contentAliasTargets([
    redirectRow("/name%20surname", "/a"), redirectRow("/name surname", "/b")
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
