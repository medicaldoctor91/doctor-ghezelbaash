import test from "node:test";
import assert from "node:assert/strict";
import { URL_ARCHITECTURE, assertUrlArchitecture, assertCoverage, assertHtmlTargets,
  canonicalPaths, urlForHtmlId, resolveContentUrl, fragmentRows, redirectRows } from "../../src/lib/url-architecture.mjs";
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

test("finite decisions cover the full actual anchor inventory and only explicitly retired source paths", () => {
  assert.equal(assertCoverage(inspected.ids), true);
  assert.equal(assertHtmlTargets(inspected.ids), true);
  assert.deepEqual(canonicalPaths(), URL_ARCHITECTURE.resources.map((resource) => resource.path));
  assert.equal(new Set(URL_ARCHITECTURE.decisions.map((row) => row.path)).size, URL_ARCHITECTURE.decisions.length);
  assert.deepEqual(URL_ARCHITECTURE.retiredPaths, ["/medical-content-governance", "/medical-content-governance-title"]);
  assert(!Object.hasOwn(URL_ARCHITECTURE.htmlIdTargets, "medical-content-governance"));
  assert.throws(() => assertHtmlTargets(inspected.ids.slice(1)), /inventory drift/);
  assert.throws(() => assertHtmlTargets([...inspected.ids, "unreviewed-new-heading"]), /inventory drift/);
});

test("authored noncanonical paths are fragments while only explicitly retired paths redirect", () => {
  const kept = new Set(canonicalPaths());
  const fragments = fragmentRows();
  const redirects = redirectRows();
  assert(fragments.length > kept.size);
  assert.deepEqual(redirects.map((row) => row.source).sort(), [...URL_ARCHITECTURE.retiredPaths].sort());

  for (const row of fragments) {
    assert(!kept.has(row.source));
    assert(!URL_ARCHITECTURE.retiredPaths.includes(row.source));
    const target = new URL(row.target, URL_ARCHITECTURE.canonicalOrigin);
    assert(kept.has(target.pathname));
    assert.equal(decodeURIComponent(target.hash.slice(1)), row.source.slice(1));
    assert.equal(resolveContentUrl(row.source), row.target);
    assert.equal(resolveContentUrl(row.target), row.target);
  }

  for (const row of redirects) {
    assert.equal(row.statusCode, 301);
    assert(URL_ARCHITECTURE.retiredPaths.includes(row.source));
    assert(!kept.has(row.source));
    const target = new URL(row.target, URL_ARCHITECTURE.canonicalOrigin);
    assert(kept.has(target.pathname));
    assert.equal(resolveContentUrl(row.source), row.target);
  }

  assert.equal(resolveContentUrl("/botox-heading"), "/botox#botox-heading");
  assert.equal(resolveContentUrl("/medical-content-governance"),
    "/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah#media-license");
  assert.equal(resolveContentUrl("/medical-content-governance#medical-content-governance-title"),
    "/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah#media-license");
  assert.equal(resolveContentUrl("/jalupro-vs-profhilo-selection"),
    "/jalupro-and-profhilo#jalupro-vs-profhilo-selection");
});

test("rendered authored links expose canonical paths or fragments, never noncanonical content pathnames", () => {
  const drift = [];
  for (const node of inspected.elements.filter((element) => element.tagName === "a")) {
    const href = node.attrs.find((item) => item.name === "href")?.value;
    if (!href) continue;
    const normalized = resolveContentUrl(href);
    if (normalized !== href) drift.push(href + " -> " + normalized);
  }
  assert.deepEqual(drift, []);
});

test("language canonicals own full original sections while former headings remain fragments", () => {
  for (const [language, htmlId] of [["en", "english-facial-aesthetic-doctor-section"],
    ["ar-iq", "iraqi-arabic-facial-aesthetic-doctor-section"],
    ["ckb-iq", "sorani-kurdish-facial-aesthetic-doctor-section"]]) {
    const route = "/aesthetic-guide-" + language;
    const resource = URL_ARCHITECTURE.resources.find((row) => row.path === route);
    assert.equal(resource.scope, "language");
    assert.equal(resource.htmlId, htmlId);
    assert.equal(urlForHtmlId(htmlId), route);
    const old = "best-facial-aesthetic-doctor-cosmetic-surgery-kermanshah-iran-" + language;
    assert.equal(urlForHtmlId(old), route + "#" + old);
    assert.equal(resolveContentUrl("/" + old), route + "#" + old);
    assert(!resource.title.includes("Best"));
  }
});

test("the homepage owns physician authority while the stable identity remains an addressable reading fragment", () => {
  assert(!canonicalPaths().includes("/saeed-ghezelbash"));
  assert.equal(urlForHtmlId("saeed-ghezelbash"), "/#saeed-ghezelbash");
  assert.equal(resolveContentUrl("/saeed-ghezelbash"), "/#saeed-ghezelbash");
  assert.equal(resolveContentUrl("/saeed-ghezelbash?from=profile"), "/?from=profile#saeed-ghezelbash");
  const doctor = inputs.graph["@graph"].find((node) => node["@id"] === inputs.lifecycle.primaryEntity.id);
  assert.equal(doctor["@id"], inputs.lifecycle.canonicalUrl + "saeed-ghezelbash");
  assert.equal(doctor.url, inputs.lifecycle.canonicalUrl);
  assert.deepEqual(doctor.mainEntityOfPage, { "@id": inputs.lifecycle.canonicalUrl + "webpage" });
  const page = inputs.graph["@graph"].find((node) => node["@id"] === inputs.lifecycle.canonicalUrl + "webpage");
  assert.deepEqual(new Set([page["@type"]].flat()), new Set(["ProfilePage", "MedicalWebPage"]));
  assert.deepEqual(page.mainEntity, { "@id": doctor["@id"] });
});

test("fragment resolution preserves queries and leaves external, machine and unknown URLs unchanged", () => {
  assert.equal(resolveContentUrl("/botox-heading?t=14"), "/botox?t=14#botox-heading");
  assert.equal(resolveContentUrl("/botox#upper-face-botox"), "/upper-face-botox");
  assert.equal(resolveContentUrl("#answer-jalupro-vs-profhilo-selection"),
    "/jalupro-and-profhilo#answer-jalupro-vs-profhilo-selection");
  assert.equal(resolveContentUrl("/video-saeed-ghezelbash-jalupro-vs-profhilo?video=video-saeed-ghezelbash-jalupro-vs-profhilo&t=42"),
    "/video-saeed-ghezelbash-jalupro-vs-profhilo?video=video-saeed-ghezelbash-jalupro-vs-profhilo&t=42");
  assert.equal(resolveContentUrl("/botox-heading", { absolute: true }),
    URL_ARCHITECTURE.canonicalOrigin + "/botox#botox-heading");
  for (const value of ["https://example.org/botox-heading", "mailto:hello@example.org", "/graph.jsonld#main-content", "/unknown-page#main-content"])
    assert.equal(resolveContentUrl(value), value);
  assert.equal(urlForHtmlId("unclassified-future-heading"), "/#unclassified-future-heading");
  assert.equal(urlForHtmlId("toString"), "/#toString");
  assert.throws(() => urlForHtmlId("bad#fragment"), /Invalid HTML/);
});

test("policy rejects redirect chains, lost fragments, stale resources and undeclared retirement", () => {
  for (const mutate of [
    (policy) => { policy.decisions.find((row) => row.decision === "301_REDIRECT").target = "/unretained"; },
    (policy) => { policy.htmlIdTargets["botox-heading"] = "/botox#different-heading"; },
    (policy) => { policy.decisions = policy.decisions.filter((row) => row.path !== "/botox"); },
    (policy) => { policy.retiredPaths.push("/never-authored"); },
    (policy) => {
      policy.decisions.find((row) => row.path === "/botox-heading").target = "/botox";
    },
  ]) {
    const policy = structuredClone(URL_ARCHITECTURE);
    mutate(policy);
    assert.throws(() => assertUrlArchitecture(policy));
  }
  assert(Object.isFrozen(URL_ARCHITECTURE));
  assert(Object.isFrozen(URL_ARCHITECTURE.resources[0]));
  assert(Object.isFrozen(URL_ARCHITECTURE.htmlIdTargets));
});

test("every fragment owner exposes the exact target in its initial readable document", () => {
  const records = deriveIndependentPages(home, inputs.graph, inputs.lifecycle.canonicalUrl,
    { focusedViews: discoveryPolicy.focusedViews });
  const idsByOwner = new Map(records.map((record) => [record.path, new Set(inspectHtml(record.bodyHtml, { wrapMain: true }).ids)]));
  idsByOwner.set("/", new Set(inspected.ids));
  const missing = [];
  for (const [id, value] of Object.entries(URL_ARCHITECTURE.htmlIdTargets)) {
    const target = new URL(value, URL_ARCHITECTURE.canonicalOrigin);
    if (!idsByOwner.get(target.pathname)?.has(id)) missing.push(id + " -> " + value);
  }
  assert.deepEqual(missing, [], "Fragment mapping must follow actual retained scopes, including answers, chapters and cross-topic content");
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
  const orphaned = nativePaths(home.replace(/<a\b[^>]*href="\/aesthetic-guide-en"[^>]*>[\s\S]*?<\/a>/g, ""));
  assert.deepEqual(roots.filter((route) => !orphaned.has(route)), ["/aesthetic-guide-en"],
    "Removing a human language entry must expose an actual orphan even while its virtual root survives");
});
