import test from "node:test";
import assert from "node:assert/strict";
import { canonicalHostAliasRows, canonicalMetadataAliasRows, contentAliasTargets, renderStaticRewrites, machineNamespaceAliasRows } from "../lib/redirect-registry.mjs";
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
test("registry requires 301 for content and 200 only for graph-machine aliases", () => {
  for (const statusCode of [200, 302, 303, 307, 308])
    assert.throws(() => canonicalHostAliasRows(registry([{ ...redirectRow("/old", "/new"), statusCode }])), /permanently redirect/);
  assert.deepEqual(canonicalHostAliasRows(registry([rewriteRow("/kg/", "/graph.jsonld")])),
    [rewriteRow("/kg/", "/graph.jsonld"), rewriteRow("/kg", "/graph.jsonld")]);
  assert.throws(() => canonicalHostAliasRows(registry([redirectRow("/kg/", "/graph.jsonld")])), /graph alias/);
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
    rewriteRow("/provenance.jsonld/source", "/provenance.jsonld"),
    rewriteRow("/website", "/graph.jsonld"),
  ]);
});
test("only bounded machine namespace wildcards are allowed and do not consume static-rule capacity", () => {
  const namespaces = machineNamespaceAliasRows();
  assert.deepEqual(namespaces, [
    rewriteRow("/graph.jsonld/*", "/graph.jsonld"), rewriteRow("/provenance.jsonld/*", "/provenance.jsonld"),
    rewriteRow("/ontology/*", "/graph.jsonld"), rewriteRow("/shapes/*", "/graph.jsonld"), rewriteRow("/annotation/*", "/graph.jsonld"),
  ]);
  assert.doesNotThrow(() => renderStaticRewrites([
    ...Array.from({length: 2000}, (_, index) => redirectRow("/old" + index, "/canonical")), ...namespaces,
  ]));
  for (const row of [rewriteRow("/*", "/graph.jsonld"), rewriteRow("/topic/*", "/graph.jsonld"),
    rewriteRow("/ontology/*", "/index.html"), redirectRow("/ontology/*", "/graph.jsonld")])
    assert.throws(() => renderStaticRewrites([row]), /alias source|final representation/);
  const exact = rewriteRow("/provenance.jsonld/assessment", "/provenance.jsonld");
  assert.doesNotThrow(() => renderStaticRewrites([exact, ...namespaces]));
  assert.throws(() => renderStaticRewrites([...namespaces, exact]), /precede namespace/);
});
test("content redirects retain target fragments while cycles and fragmented machine targets are rejected", () => {
  const row = redirectRow("/old-topic", "/#current-topic");
  assert.deepEqual(canonicalHostAliasRows(registry([row])), [row]);
  assert.equal(renderStaticRewrites([row]), "/old-topic /#current-topic 301\n");
  assert.throws(() => canonicalHostAliasRows(registry([rewriteRow("/kg", "/graph.jsonld#entity")])), /escaped its scope/);
  assert.throws(() => renderStaticRewrites([rewriteRow("/kg", "/graph.jsonld#entity")]), /destination/);
  for (const rows of [[redirectRow("/a", "/a#section")], [redirectRow("/a", "/b#section"), redirectRow("/b", "/a")],
    [redirectRow("/%61", "/b"), redirectRow("/b", "/a")], [rewriteRow("/a", "/b"), rewriteRow("/b", "/a")]])
    assert.throws(() => renderStaticRewrites(rows), /cycle/);
});
test("generated provenance subjects receive their own profile and canonical representation headers", () => {
  const headers = "/graph.jsonld\n  Content-Type: application/ld+json\n  Link: <https://www.ghezelbaash.ir/graph.jsonld>; rel=\"canonical\"\n  Access-Control-Allow-Origin: *\n\n/provenance.jsonld\n  Content-Type: application/ld+json; profile=\"https://www.w3.org/TR/prov-o/ https://www.w3.org/TR/json-ld11/\"\n  Link: <https://www.ghezelbaash.ir/provenance.jsonld>; rel=\"canonical\"\n  Access-Control-Allow-Origin: *\n";
  const graphHeaders = expandMachineAliasHeaders(headers, ["/ontology/*"]);
  const expanded = expandMachineAliasHeaders(graphHeaders, ["/provenance.jsonld/*"], { representationPath: "/provenance.jsonld" });
  const provenance = expanded.slice(expanded.indexOf("/provenance.jsonld/*\n")).split("\n\n")[0];
  assert(provenance.includes('profile="https://www.w3.org/TR/prov-o/ https://www.w3.org/TR/json-ld11/"'));
  assert(provenance.includes('<https://www.ghezelbaash.ir/provenance.jsonld>; rel="canonical"'));
  assert(provenance.includes("Access-Control-Allow-Origin: *"));
  assert(!provenance.includes('<https://www.ghezelbaash.ir/graph.jsonld>; rel="canonical"'));
  assert.throws(() => expandMachineAliasHeaders(headers, ["/x/*"], { representationPath: "/index.html" }), /Unsupported/);
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
