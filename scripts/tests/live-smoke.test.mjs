import test from "node:test";
import assert from "node:assert/strict";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { renderCanonicalPageHtml } from "../../src/lib/canonical-page-html.mjs";
import { contentRoutePaths } from "../lib/content-routes.mjs";
import { deriveIndependentPages, renderIndependentPage } from "../lib/independent-pages.mjs";
import { renderDiscoverySitemap } from "../lib/discovery-sitemap.mjs";
import { canonicalProductionUrl, assertLiveResponse, assertDeploymentFingerprint, waitForDeployment,
  assertLiveDocument, assertLiveSitemap, assertLiveRobots, assertLiveGraphBytes } from "../lib/live-smoke.mjs";

const canonicalUrl = "https://www.ghezelbaash.ir/", commit = "a".repeat(40);
const fingerprint = { schemaVersion: "1.0", release: "1.3.3", commit, branch: "main", provider: "cloudflare-pages" };
const response = (value = fingerprint, { status = 200, type = "application/json", headers = {} } = {}) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": type, ...headers } });

test("HTTP checks reject redirects, wrong MIME and noindex HTML", () => {
  const options = { url: canonicalUrl, mediaType: "text/html", indexable: true };
  assertLiveResponse(response({}, { type: "text/html; charset=utf-8" }), options);
  for (const configuration of [{ status: 302, headers: { Location: "/elsewhere" } },
      { type: "text/plain" }, { type: "text/html", headers: { "X-Robots-Tag": "googlebot: noindex, follow" } },
      { type: "text/html", headers: { Location: "/elsewhere" } }])
    assert.throws(() => assertLiveResponse(response({}, configuration), options));
});

test("the production fingerprint must identify the exact Cloudflare main commit", () => {
  assert.deepEqual(assertDeploymentFingerprint(fingerprint, { expectedCommit: commit, release: "1.3.3" }), fingerprint);
  for (const patch of [{ commit: "b".repeat(40) }, { branch: "preview" }, { provider: "github-actions" }, { schemaVersion: "2.0" }])
    assert.throws(() => assertDeploymentFingerprint({ ...fingerprint, ...patch }, { expectedCommit: commit }));
  for (const url of ["http://www.ghezelbaash.ir/", canonicalUrl + "topic", canonicalUrl + "?next=1", "https://user@www.ghezelbaash.ir/"])
    assert.throws(() => canonicalProductionUrl(url));
});

test("production polling tolerates an older release and a transient failure before matching", async () => {
  let clock = 0, calls = 0;
  const attempts = [];
  const result = await waitForDeployment({ canonicalUrl, expectedCommit: commit, timeoutMs: 50, intervalMs: 5,
    now: () => clock, delay: async (ms) => { clock += ms; }, onAttempt: (value) => attempts.push(value),
    fetchImpl: async (url, options) => {
      assert.equal(new URL(url).origin, new URL(canonicalUrl).origin);
      assert.equal(new URL(url).searchParams.get("verify"), commit);
      assert.equal(options.method, "GET");
      assert.equal(options.redirect, "manual");
      assert(options.signal instanceof AbortSignal);
      calls++;
      if (calls === 1) return response({ ...fingerprint, commit: "b".repeat(40) });
      if (calls === 2) throw new Error("Temporary connection failure");
      return response();
    },
  });
  assert.equal(result.commit, commit);
  assert.equal(calls, 3);
  assert.equal(attempts.length, 3);
});

test("an unavailable deployment terminates at its finite deadline", async () => {
  let clock = 0, calls = 0;
  await assert.rejects(waitForDeployment({ canonicalUrl, expectedCommit: commit, timeoutMs: 25, intervalMs: 10,
    now: () => clock, delay: async (ms) => { clock += ms; },
    fetchImpl: async () => { calls++; return response({}, { status: 503 }); },
  }), /Timed out waiting for production commit/);
  assert.equal(clock, 25);
  assert.equal(calls, 3);
});

const inputs = readCanonicalInputs();
const actualPage = inputs.graph["@graph"].find((node) => node.url === canonicalUrl && [node["@type"]].flat().includes("ProfilePage"));
const head = (pageUrl) => '<title>Guide</title><link rel="canonical" href="' + pageUrl + '">' +
  '<meta name="robots" content="index, follow"><meta name="x-build-commit" content="' + commit + '">';
const actualHome = '<!doctype html><html lang="fa-IR" dir="rtl"><head>' + head(canonicalUrl) +
  '</head><body><main id="main-content"><article class="medical-guide">' +
  renderCanonicalPageHtml(inputs.pageBody) + '</article></main></body></html>';
const actualOptions = { canonicalUrl, pageUrl: canonicalUrl, expectedCommit: commit,
  personId: inputs.lifecycle.primaryEntity.id, homePageId: actualPage["@id"], graph: inputs.graph };

test("live homepage verification preserves every actual source entity and the central Doctor", () => {
  const result = assertLiveDocument(actualHome, actualOptions);
  assert(result.entities >= inputs.graph["@graph"].length);
  assert.deepEqual(result.subjects, [inputs.lifecycle.primaryEntity.id]);
  assert.equal(result.videos, 4);
  assert.throws(() => assertLiveDocument(actualHome.replace(commit, "b".repeat(40)), actualOptions), /HTML fingerprint/);
  assert.throws(() => assertLiveDocument(actualHome.replace('rel="canonical" href="' + canonicalUrl,
    'rel="canonical" href="' + canonicalUrl + "botox"), actualOptions), /self canonical/);
});

const pageUrl = canonicalUrl + "question", personId = canonicalUrl + "doctor", homePageId = canonicalUrl + "webpage";
const person = { "@id": personId, "@type": "Person", name: "Doctor", url: canonicalUrl, mainEntityOfPage: { "@id": homePageId } };
const questionId = pageUrl + "#question", answerId = pageUrl + "#answer", videoId = pageUrl + "#video";
const focusedGraph = { "@context": "https://schema.org", "@graph": [
  { "@id": pageUrl + "#webpage", "@type": "FAQPage", url: pageUrl, mainEntity: [{ "@id": questionId }],
    author: { "@id": personId }, publisher: { "@id": personId }, isPartOf: [{ "@id": homePageId }] },
  person, { "@id": questionId, "@type": "Question", name: "Question", acceptedAnswer: { "@id": answerId } },
  { "@id": answerId, "@type": "Answer", text: "Answer" },
  { "@id": videoId, "@type": "VideoObject", name: "Supporting video",
    thumbnailUrl: canonicalUrl + "poster.webp", contentUrl: canonicalUrl + "video.mp4", uploadDate: "2025-01-01T12:00:00Z" },
] };
const focusedHtml = (graph = focusedGraph) => '<!doctype html><html data-route-view="focused"><head>' + head(pageUrl) +
  '<script type="application/ld+json">' + JSON.stringify(graph) + '</script></head><body><main id="main-content">' +
  '<article class="medical-guide"><h1>Question</h1><a href="/" data-guide-expand>Full guide</a>' +
  '<video data-poster="/poster.webp" poster="/poster.webp" preload="none"><source src="/video.mp4" type="video/mp4">' +
  'Browser fallback</video></article></main></body></html>';
const focusedOptions = { canonicalUrl, pageUrl, expectedCommit: commit, personId, homePageId,
  graph: { "@graph": [person] }, expectedMainType: "Question", expectedEntityId: questionId };

test("a focused answer with supporting video retains Question identity and playable media", () => {
  const result = assertLiveDocument(focusedHtml(), focusedOptions);
  assert.deepEqual(result.subjects, [questionId]);
  assert.equal(result.videos, 1);
  const changed = JSON.parse(JSON.stringify(focusedGraph));
  changed["@graph"][0].mainEntity = { "@id": videoId };
  assert.throws(() => assertLiveDocument(focusedHtml(changed), focusedOptions), /subject type drift/);
  assert.throws(() => assertLiveDocument(focusedHtml().replace('src="/video.mp4"', 'src="/wrong.mp4"'), focusedOptions),
    /visible playable source/);
  assert.throws(() => assertLiveDocument(focusedHtml().replace('poster="/poster.webp" preload', 'poster="/wrong.webp" preload'),
    focusedOptions), /Video markup contract/);
});

test("live sitemap checks reciprocal authored languages and detects missing or duplicate destinations", () => {
  const group = { members: [{ path: "/q-en", hreflang: "en" }, { path: "/q-ar", hreflang: "ar-IQ" },
    { path: "/q-ckb", hreflang: "ku-IQ" }] };
  const alternates = group.members.map((member) => ({ href: new URL(member.path, canonicalUrl).href, hrefLang: member.hreflang }));
  const records = [{ canonicalUrl, lastmod: "2026-10-01", imageUrls: [], videos: [] },
    ...alternates.map((alternate) => ({ canonicalUrl: alternate.href, lastmod: "2026-10-01", alternates }))];
  const xml = renderDiscoverySitemap({ pages: records });
  const options = { canonicalUrl, requiredUrls: [canonicalUrl, alternates[0].href], translationGroups: [group] };
  assert.deepEqual(assertLiveSitemap(xml, options), { entries: 4, translatedEntries: 3 });
  assert.throws(() => assertLiveSitemap(xml.replace('<loc>' + alternates[0].href + '</loc>',
    '<loc>' + canonicalUrl + '</loc>'), options), /duplicate loc/);
  assert.throws(() => assertLiveSitemap(xml.replace('hreflang="en"', 'hreflang="fa"'), options), /language group/);
  assert.throws(() => assertLiveSitemap(xml, { ...options, requiredUrls: [canonicalUrl + "missing"] }), /missing representative/);
});

test("robots discovery and canonical graph integrity use exact published resources", () => {
  const robots = "User-agent: *\nAllow: /\nDisallow: /cdn-cgi/\nSitemap: " + canonicalUrl + "sitemap.xml\n";
  assertLiveRobots(robots, canonicalUrl);
  assert.throws(() => assertLiveRobots(robots.replace("Allow: /", "Disallow: /"), canonicalUrl), /allow the public site/);
  assert.throws(() => assertLiveRobots(robots.replace("sitemap.xml", "wrong.xml"), canonicalUrl), /sitemap declaration/);
  assert.equal(assertLiveGraphBytes(Buffer.from("canonical"), Buffer.from("canonical")).length, 64);
  assert.throws(() => assertLiveGraphBytes(Buffer.from("changed"), Buffer.from("canonical")), /graph bytes drift/);
});

test("all priority local Botox and international sample paths exist in the actual canonical source", () => {
  const paths = new Set(contentRoutePaths(renderCanonicalPageHtml(inputs.pageBody), canonicalUrl));
  const priorities = ["/botox-doctor-selection-criteria-kermanshah", "/botox-dose-brand-and-unit-equivalence"];
  const members = inputs.pageFrontmatter.discovery.translationGroups[0].members;
  assert(members.some((member) => member.lang === "en") && members.some((member) => member.lang === "ar-IQ") &&
    members.some((member) => member.lang === "ckb-IQ"));
  for (const path of [...priorities, ...members.map((member) => member.path)]) {
    assert(paths.has(path), "Missing actual live sample: " + path);
    if (path !== "/botox-dose-brand-and-unit-equivalence")
      assert(inputs.graph["@graph"].some((node) => node.url === new URL(path, canonicalUrl).href &&
        [node["@type"]].flat().includes("Question")), "Live sample must retain its actual Question");
  }
  const pricing = deriveIndependentPages(actualHome, inputs.graph, canonicalUrl)
    .find((record) => record.path === "/botox-dose-brand-and-unit-equivalence");
  assert(pricing && pricing.entityTypes.includes("WebPageElement"), "Pricing preserves its actual scoped content type");
  assertLiveDocument(renderIndependentPage(actualHome, pricing), { ...actualOptions, pageUrl: pricing.canonicalUrl,
    expectedMainType: "WebPageElement", expectedEntityId: pricing.entityId });
});
