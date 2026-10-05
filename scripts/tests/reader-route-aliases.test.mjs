import test from "node:test";
import assert from "node:assert/strict";
import { readerRouteAliases } from "../lib/reader-route-aliases.mjs";
import { canonicalHostAliasRows, contentAliasTargets, loadAliasRegistry } from "../lib/redirect-registry.mjs";
import { URL_ARCHITECTURE, resolveContentUrl } from "../../src/lib/url-architecture.mjs";
import { STATIC_ARTIFACTS } from "../../src/lib/resources.mjs";

const machinePaths = new Set(STATIC_ARTIFACTS.map((resource) => "/" + resource.path));
const languageResources = URL_ARCHITECTURE.resources.filter((resource) =>
  resource.path !== "/" && resource.path !== "/" + resource.htmlId);

test("reader aliases retain the bounded host map and add only canonical DOM path differences", async () => {
  const legacyRows = canonicalHostAliasRows(await loadAliasRegistry());
  const legacy = contentAliasTargets(legacyRows, machinePaths);
  const aliases = readerRouteAliases(legacyRows, machinePaths);
  const expectedKeys = new Set([...Object.keys(legacy), ...languageResources.map((resource) => resource.path)]);
  assert.deepEqual(new Set(Object.keys(aliases)), expectedKeys);
  assert.equal(languageResources.length, 3);
  assert(Object.keys(aliases).length < Object.keys(URL_ARCHITECTURE.htmlIdTargets).length,
    "the reader must not embed the complete authored fragment inventory as HTTP aliases");
  for (const [source, target] of Object.entries(legacy))
    assert.equal(aliases[source], resolveContentUrl(target));
  for (const resource of languageResources)
    assert.equal(aliases[resource.path], "/#" + encodeURIComponent(resource.htmlId));
  for (const resource of URL_ARCHITECTURE.resources.filter((resource) => resource.path === "/" + resource.htmlId))
    if (!Object.hasOwn(legacy, resource.path)) assert(!Object.hasOwn(aliases, resource.path));
});

test("legacy content destinations use their final document and original fragment", () => {
  const aliases = readerRouteAliases([
    { source: "/legacy-botox", target: "/botox-heading" },
    { source: "/legacy-english", target: "/#english-facial-aesthetic-doctor-section" },
    { source: "/%D9%BE%D8%B1%D8%B3%D8%B4", target: "/jalupro-vs-profhilo-selection" },
  ], machinePaths);
  assert.equal(aliases["/legacy-botox"], "/botox#botox-heading");
  assert.equal(aliases["/legacy-english"], "/aesthetic-guide-en");
  assert.equal(aliases["/aesthetic-guide-en"], "/#english-facial-aesthetic-doctor-section");
  assert.equal(aliases["/پرسش"], "/jalupro-and-profhilo#jalupro-vs-profhilo-selection");
});

test("machine aliases are handled by HTTP without entering the reader DOM map", () => {
  const aliases = readerRouteAliases([
    { source: "/semantic-data", target: "/graph.jsonld" },
    { source: "/legacy-botox", target: "/botox" },
  ], machinePaths);
  assert(!Object.hasOwn(aliases, "/semantic-data"));
  assert.equal(aliases["/legacy-botox"], "/botox");
});

test("reader aliases reject canonical lookup collisions and decoded source disagreement", () => {
  assert.throws(() => readerRouteAliases([
    { source: "/aesthetic-guide-en", target: "/botox" },
  ], machinePaths), /Canonical reader target disagrees/);
  assert.throws(() => readerRouteAliases([
    { source: "/%D9%BE%D8%B1%D8%B3%D8%B4", target: "/botox" },
    { source: "/پرسش", target: "/filler" },
  ], machinePaths), /Decoded content aliases disagree/);
});
