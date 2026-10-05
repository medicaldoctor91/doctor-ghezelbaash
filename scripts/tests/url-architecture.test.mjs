import test from "node:test";
import assert from "node:assert/strict";
import { URL_ARCHITECTURE, assertUrlArchitecture, assertCoverage, assertHtmlTargets,
  canonicalPaths, urlForHtmlId, resolveContentUrl, sourceNavigationUrl } from "../../src/lib/url-architecture.mjs";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { renderCanonicalPageHtml } from "../../src/lib/canonical-page-html.mjs";
import { discoveryPolicy } from "../../src/config/site-policy.mjs";
import { deriveIndependentPages } from "../lib/independent-pages.mjs";
import { deriveRouteDiscovery } from "../lib/route-discovery.mjs";
import { navigationRoots } from "../lib/topic-navigation.mjs";
import { inspectHtml } from "../lib/html-contract.mjs";

const inputs = readCanonicalInputs();
const home = '<!doctype html><html lang="fa-IR"><head><title>Home</title></head><body><main id="main-content"><article class="medical-guide">' +
  renderCanonicalPageHtml(inputs.pageBody, inputs.graph) + "</article></main></body></html>";
const inspected = inspectHtml(home);

test("URL architecture contains only canonical resources and authored fragment ownership", () => {
  assert.equal(assertCoverage(inspected.ids), true);
  assert.equal(assertHtmlTargets(inspected.ids), true);
  assert.equal(URL_ARCHITECTURE.resources.length, 72);
  assert.equal(Object.keys(URL_ARCHITECTURE.htmlIdTargets).length, inspected.ids.length);
  assert.deepEqual(canonicalPaths(), URL_ARCHITECTURE.resources.map((resource) => resource.path));
  assert(!Object.hasOwn(URL_ARCHITECTURE, "decisions"));
  assert(!Object.hasOwn(URL_ARCHITECTURE, "retiredPaths"));
  assert(!Object.hasOwn(URL_ARCHITECTURE.htmlIdTargets, "medical-content-governance"));
  assert(!Object.hasOwn(URL_ARCHITECTURE.htmlIdTargets, "medical-content-governance-title"));
  assert.throws(() => assertHtmlTargets(inspected.ids.slice(1)), /inventory drift/);
  assert.throws(() => assertHtmlTargets([...inspected.ids, "unreviewed-new-heading"]), /inventory drift/);
});

test("authored HTML IDs resolve to canonical owners without creating HTTP aliases", () => {
  const canonical = new Set(canonicalPaths());
  for (const [id, value] of Object.entries(URL_ARCHITECTURE.htmlIdTargets)) {
    const target = new URL(value, URL_ARCHITECTURE.canonicalOrigin);
    assert(canonical.has(target.pathname), `Missing canonical owner for ${id}`);
    if (target.hash) assert.equal(decodeURIComponent(target.hash.slice(1)), id);
    assert.equal(urlForHtmlId(id), value);
  }
  assert.equal(resolveContentUrl("/botox-heading"), "/botox#botox-heading");
  assert.equal(sourceNavigationUrl("/botox-heading"), "/#botox-heading");
  assert.equal(resolveContentUrl("/jalupro-vs-profhilo-selection"),
    "/jalupro-and-profhilo#jalupro-vs-profhilo-selection");
  assert.equal(sourceNavigationUrl("/jalupro-vs-profhilo-selection"),
    "/#jalupro-vs-profhilo-selection");
  assert.equal(resolveContentUrl("/botox"), "/botox");
  assert.equal(sourceNavigationUrl("/botox"), "/botox");
  assert.equal(resolveContentUrl("/medical-content-governance"), "/medical-content-governance");
  assert.equal(sourceNavigationUrl("/medical-content-governance"), "/medical-content-governance");
});

test("rendered authored links keep canonical routes and final reader navigation URLs", () => {
  const drift = [];
  for (const node of inspected.elements.filter((element) => element.tagName === "a")) {
    const href = node.attrs.find((item) => item.name === "href")?.value;
    if (!href) continue;
    const url = new URL(href, URL_ARCHITECTURE.canonicalOrigin);
    if (url.origin !== URL_ARCHITECTURE.canonicalOrigin) continue;
    const normalized = sourceNavigationUrl(href);
    if (normalized !== href) drift.push(href + " -> " + normalized);
  }
  assert.deepEqual(drift, []);
});

test("language canonicals own full original sections while their nested IDs remain fragments", () => {
  for (const [language, htmlId] of [["en", "english-facial-aesthetic-doctor-section"],
    ["ar-iq", "iraqi-arabic-facial-aesthetic-doctor-section"],
    ["ckb-iq", "sorani-kurdish-facial-aesthetic-doctor-section"]]) {
    const route = "/aesthetic-guide-" + language;
    const resource = URL_ARCHITECTURE.resources.find((row) => row.path === route);
    assert.equal(resource.scope, "language");
    assert.equal(resource.htmlId, htmlId);
    assert.equal(urlForHtmlId(htmlId), route);
    const nested = "best-facial-aesthetic-doctor-cosmetic-surgery-kermanshah-iran-" + language;
    assert.equal(urlForHtmlId(nested), route + "#" + nested);
    assert.equal(resolveContentUrl("/" + nested), route + "#" + nested);
    assert.equal(sourceNavigationUrl("/" + nested), "/#" + nested);
  }
});

test("homepage owns physician authority and the artificial physician pathname is absent", () => {
  const physicianId = inputs.lifecycle.canonicalUrl + "#saeed-ghezelbash";
  const oldPhysicianId = inputs.lifecycle.canonicalUrl + "saeed-ghezelbash";
  assert(!canonicalPaths().includes("/saeed-ghezelbash"));
  assert.equal(urlForHtmlId("saeed-ghezelbash"), "/#saeed-ghezelbash");
  assert.equal(resolveContentUrl("/saeed-ghezelbash"), "/#saeed-ghezelbash");
  assert.equal(sourceNavigationUrl("/saeed-ghezelbash"), "/#saeed-ghezelbash");
  const doctor = inputs.graph["@graph"].find((node) => node["@id"] === inputs.lifecycle.primaryEntity.id);
  assert.equal(inputs.lifecycle.primaryEntity.id, physicianId);
  assert.equal(doctor["@id"], physicianId);
  assert.equal(doctor.url, inputs.lifecycle.canonicalUrl);
  assert.equal(doctor.mainEntityOfPage?.["@id"], inputs.lifecycle.canonicalUrl + "webpage");
  assert(!JSON.stringify(inputs.graph).includes(JSON.stringify(oldPhysicianId)));
  assert(inspected.headings.some((node) => node.tagName === "h1" && node.attrs?.some((item) => item.name === "id" && item.value === "saeed-ghezelbash")));
  assert(!inputs.pageBody.includes('href="/saeed-ghezelbash"'));
  assert(!inputs.pageBody.includes('href="https://www.ghezelbaash.ir/saeed-ghezelbash"'));
});

test("canonical resolution and browser hash navigation remain distinct", () => {
  assert.equal(resolveContentUrl("/botox-heading?t=14"), "/botox?t=14#botox-heading");
  assert.equal(sourceNavigationUrl("/botox-heading?t=14"), "/?t=14#botox-heading");
  assert.equal(resolveContentUrl("/botox#upper-face-botox"), "/upper-face-botox");
  assert.equal(sourceNavigationUrl("/botox#upper-face-botox"), "/upper-face-botox");
  assert.equal(resolveContentUrl("#answer-jalupro-vs-profhilo-selection"),
    "/jalupro-and-profhilo#answer-jalupro-vs-profhilo-selection");
  assert.equal(sourceNavigationUrl("#answer-jalupro-vs-profhilo-selection"),
    "/#answer-jalupro-vs-profhilo-selection");
  assert.equal(resolveContentUrl("/botox-heading", { absolute: true }),
    URL_ARCHITECTURE.canonicalOrigin + "/botox#botox-heading");
  assert.equal(sourceNavigationUrl("/botox-heading", { absolute: true }),
    URL_ARCHITECTURE.canonicalOrigin + "/#botox-heading");
  for (const value of ["https://example.org/botox-heading", "mailto:hello@example.org", "/graph.jsonld#main-content", "/unknown-page#main-content"]) {
    assert.equal(resolveContentUrl(value), value);
    assert.equal(sourceNavigationUrl(value), value);
  }
  assert.equal(urlForHtmlId("unclassified-future-heading"), "/#unclassified-future-heading");
  assert.throws(() => urlForHtmlId("bad#fragment"), /Invalid HTML/);
});

test("policy rejects reintroducing HTTP redirect history and invalid fragment ownership", () => {
  for (const mutate of [
    (policy) => { policy.decisions = []; },
    (policy) => { policy.retiredPaths = []; },
    (policy) => { policy.htmlIdTargets["botox-heading"] = "/botox#different-heading"; },
    (policy) => { policy.resources = policy.resources.filter((row) => row.path !== "/botox"); },
  ]) {
    const policy = structuredClone(URL_ARCHITECTURE);
    mutate(policy);
    assert.throws(() => assertUrlArchitecture(policy));
  }
  assert(Object.isFrozen(URL_ARCHITECTURE));
  assert(Object.isFrozen(URL_ARCHITECTURE.resources[0]));
  assert(Object.isFrozen(URL_ARCHITECTURE.htmlIdTargets));
});

test("every canonical owner exposes the exact target in its initial readable document", () => {
  const records = deriveIndependentPages(home, inputs.graph, inputs.lifecycle.canonicalUrl,
    { focusedViews: discoveryPolicy.focusedViews });
  const idsByOwner = new Map(records.map((record) => [record.path, new Set(inspectHtml(record.bodyHtml, { wrapMain: true }).ids)]));
  idsByOwner.set("/", new Set(inspected.ids));
  const missing = [];
  for (const [id, value] of Object.entries(URL_ARCHITECTURE.htmlIdTargets)) {
    const target = new URL(value, URL_ARCHITECTURE.canonicalOrigin);
    if (!idsByOwner.get(target.pathname)?.has(id)) missing.push(id + " -> " + value);
  }
  assert.deepEqual(missing, []);
});

test("authored homepage anchors physically link every navigation root, including all three language guides", () => {
  const records = deriveRouteDiscovery(home, inputs.graph, discoveryPolicy, inputs.lifecycle.canonicalUrl);
  const roots = navigationRoots(records).map((record) => record.path);
  const nativePaths = (source) => new Set(inspectHtml(source).elements.filter((node) => node.tagName === "a")
    .map((node) => node.attrs.find((item) => item.name === "href")?.value).filter(Boolean)
    .map((href) => new URL(href, inputs.lifecycle.canonicalUrl))
    .filter((url) => url.origin === URL_ARCHITECTURE.canonicalOrigin).map((url) => url.pathname));
  const native = nativePaths(home);
  assert.deepEqual(roots.filter((route) => !native.has(route)), [],
    "Virtual navigation roots must have real authored homepage links");
  for (const route of ["/aesthetic-guide-ar-iq", "/aesthetic-guide-en", "/aesthetic-guide-ckb-iq"])
    assert(roots.includes(route) && native.has(route), "Missing native language guide entry: " + route);
});
