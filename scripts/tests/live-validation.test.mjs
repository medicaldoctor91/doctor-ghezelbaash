import test from "node:test";
import assert from "node:assert/strict";
import { liveOptions, livePlan, validateLive } from "../validate-live.mjs";
import { machineNamespaceAliasRows } from "../lib/redirect-registry.mjs";
import { fragmentRows } from "../../src/lib/url-architecture.mjs";

const origin = "https://www.ghezelbaash.ir";
const doctor = { "@id": origin + "/saeed-ghezelbash", "@type": "Person", name: "Physician", url: origin + "/", mainEntityOfPage: { "@id": origin + "/webpage" } };
const plan = { canonicalOrigin: origin, paths: ["/", "/topic"], release: "test-release", namespaces: machineNamespaceAliasRows(),
  rows: [{ source: "/old-answer", target: "/topic#answer", statusCode: 301 }, { source: "/saeed-ghezelbash", target: "/#saeed-ghezelbash", statusCode: 301 }, { source: "/entity", target: "/graph.jsonld", statusCode: 200 }],
  counts: { canonical: 2, corpusRedirects: 2, answerRedirects: 1, legacyRules: 1, metadataRules: 0, namespaces: 5 } };
const options = liveOptions(["--origin", "http://localhost:8788", "--expected-commit", "a".repeat(40)]);
const documentFor = (pathname) => ({ "@context": "https://schema.org", "@graph": [doctor,
  pathname === "/" ? { "@id": origin + "/webpage", "@type": ["ProfilePage", "MedicalWebPage"], url: origin + "/", mainEntity: { "@id": doctor["@id"] }, dateModified: "2026-10-03" }
    : { "@id": origin + pathname + "#webpage", "@type": "MedicalWebPage", url: origin + pathname, mainEntity: { "@id": origin + "/topic-entity" } },
  { "@id": origin + "/topic-entity", "@type": "WebPageElement" },
] });
function fixtureFetch({ badLocation = false, badNamespace = false, noindex = false, httpNoindex = false, stalePage = false } = {}) {
  let active = 0, maximum = 0;
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ path: url.pathname, method: init.method, redirect: init.redirect });
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    if (url.pathname === "/build-info.json") return new Response(JSON.stringify({ release: plan.release, commit: "a".repeat(40), branch: "test", provider: "local" }), { headers: { "Content-Type": "application/json" } });
    if (plan.paths.includes(url.pathname)) {
      const canonical = new URL(url.pathname, origin).href;
      const commit = stalePage && url.pathname === "/topic" ? "b".repeat(40) : "a".repeat(40);
      const buildMeta = Object.entries({ "x-build-commit": commit, "x-build-release": plan.release, "x-build-branch": "test", "x-build-provider": "local" })
        .map(([name, value]) => '<meta name="' + name + '" content="' + value + '">').join("");
      const html = '<!doctype html><html><head><link rel="canonical" href="' + canonical + '"><meta name="robots" content="' + (noindex ? "noindex" : "index, follow") + '">' + buildMeta + '<script type="application/ld+json">' + JSON.stringify(documentFor(url.pathname)) + '</script></head><body><div id="saeed-ghezelbash"></div><div id="answer"></div></body></html>';
      return new Response(html, { headers: { "Content-Type": "text/html", "X-Robots-Tag": httpNoindex ? "index, follow, googlebot: noindex" : "index, follow" } });
    }
    const row = plan.rows.find((row) => row.source === url.pathname);
    if (row?.statusCode === 301) return new Response(null, { status: 301, headers: { Location: badLocation ? "/topic#wrong-answer" : row.target } });
    const target = url.pathname.startsWith("/provenance.jsonld") ? "/provenance.jsonld" : "/graph.jsonld";
    return new Response(init.method === "HEAD" ? null : JSON.stringify({ "@context": {}, "@graph": [] }), { headers: { "Content-Type": badNamespace ? "text/html" : "application/ld+json", "Access-Control-Allow-Origin": "*", Link: '<' + origin + target + '>; rel="canonical"' } });
  };
  return { fetchImpl, requests, maximum: () => maximum };
}

test("live options reject credentials, unbounded concurrency and abbreviated deployment identity", () => {
  assert.equal(liveOptions([]).redirects, "all");
  assert.throws(() => liveOptions(["--origin", "https://user:secret@example.com"]), /without credentials/);
  assert.throws(() => liveOptions(["--concurrency", "9"]), /between 1 and 8/);
  assert.throws(() => liveOptions(["--timeout-ms", "Infinity"]), /between 1 and/);
  assert.throws(() => liveOptions(["--expected-commit", "abc123"]), /full commit SHA/);
});

test("live plan probes historical paths while authored navigation preserves root fragments", async () => {
  const actual = await livePlan();
  const fragments = fragmentRows();
  assert.equal(actual.paths.length, 72);
  assert.equal(actual.counts.corpusRedirects, fragments.length + 2);
  assert(fragments.length > 1000);
  assert(fragments.every((fragment) => actual.rows.some((row) => row.source === fragment.source && row.statusCode === 301)));
  assert.equal(actual.namespaces.length, 5);
  assert.deepEqual(actual.rows.find((row) => row.source === "/saeed-ghezelbash"),
    { source: "/saeed-ghezelbash", target: "/#saeed-ghezelbash", statusCode: 301 });
  assert.deepEqual(fragments.find((row) => row.source === "/saeed-ghezelbash"),
    { source: "/saeed-ghezelbash", target: "/#saeed-ghezelbash" });
  assert.deepEqual(fragments.find((row) => row.source === "/botox-heading"),
    { source: "/botox-heading", target: "/#botox-heading" });
  assert(actual.counts.answerRedirects > 0);
  assert(actual.rows.some((row) => row.statusCode === 301 && /#answer-/.test(row.target)));
});

test("live validation checks each canonical once, preserves exact redirect fragments and caps concurrency", async () => {
  const fixture = fixtureFetch();
  const report = await validateLive(plan, options, fixture);
  assert.equal(report.ok, true, JSON.stringify(report.checks.filter((row) => !row.ok)));
  assert.equal(report.coverage.machineRepresentationProbes, 7);
  assert.equal(report.coverage.redirectsChecked, 2);
  assert(fixture.maximum() <= 8);
  assert(fixture.requests.every((request) => request.redirect === "manual"));
  for (const pathname of plan.paths) assert.equal(fixture.requests.filter((request) => request.path === pathname).length, 1);
});

test("live report rejects wrong redirect fragments, noindex pages and namespace HTML fallback", async () => {
  for (const problem of ["badLocation", "badNamespace", "noindex"]) {
    const report = await validateLive(plan, options, fixtureFetch({ [problem]: true }));
    assert.equal(report.ok, false, problem);
    assert(report.totals.failed > 0);
    assert.equal(report.totals.checked, 13, "Failures must still produce the complete bounded report");
  }
});

test("live validation rejects cached stale HTML even when build-info and the homepage are current", async () => {
  const report = await validateLive(plan, options, fixtureFetch({ stalePage: true }));
  assert.equal(report.ok, false);
  assert.equal(report.build.commit, "a".repeat(40));
  assert.equal(report.checks.find((row) => row.path === "/").ok, true);
  const stale = report.checks.find((row) => row.path === "/topic");
  assert.equal(stale.commit, "b".repeat(40));
  assert.match(stale.error, /deployment differs for x-build-commit/);
  assert.equal(report.totals.failed, 2, "The stale topic and its redirect target must fail");
});

test("an index meta and index HTTP directive cannot cancel a restrictive Googlebot HTTP directive", async () => {
  const report = await validateLive(plan, options, fixtureFetch({ httpNoindex: true }));
  assert.equal(report.ok, false);
  for (const pathname of plan.paths) {
    const page = report.checks.find((row) => row.path === pathname);
    assert.match(page.error, /noindex HTTP directive/);
    assert.equal(page.httpRobots, "index, follow, googlebot: noindex");
  }
});
