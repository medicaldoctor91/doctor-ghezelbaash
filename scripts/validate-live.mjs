import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readCanonicalInputs } from "../src/lib/canonical-inputs.mjs";
import { URL_ARCHITECTURE, canonicalPaths, redirectRows, urlForHtmlId } from "../src/lib/url-architecture.mjs";
import { deriveCanonicalAnswerTopology } from "../src/lib/answer-projection.mjs";
import { assertRichResultsDocument } from "../src/lib/rich-results-contract.mjs";
import { inspectHtml } from "./lib/html-contract.mjs";
import { assertPublishedFragment, assertSingleHopDelivery } from "./lib/delivery-validation.mjs";
import { canonicalHostAliasRows, canonicalMetadataAliasRows, loadAliasRegistry, machineNamespaceAliasRows, renderStaticRewrites } from "./lib/redirect-registry.mjs";

const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const typed = (node, type) => values(node?.["@type"]).includes(type);
const noindex = (value) => /\b(?:noindex|none)\b/i.test(value || "");
const canonicalOrigin = URL_ARCHITECTURE.canonicalOrigin;
const physicianId = canonicalOrigin + "/#saeed-ghezelbash";

export function liveOptions(args) {
  const options = { origin: canonicalOrigin, concurrency: 8, timeoutMs: 20_000, redirects: "all", report: ".generated/live-validation.json" };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === "--help") return { help: true };
    assert(["--origin", "--expected-commit", "--concurrency", "--timeout-ms", "--redirects", "--report", "--redirects-file"].includes(flag), "Unknown live validation option: " + flag);
    const value = args[++i];
    assert(value && !value.startsWith("--"), "Missing value for " + flag);
    options[({ "--expected-commit": "expectedCommit", "--timeout-ms": "timeoutMs", "--redirects-file": "redirectsFile" })[flag] || flag.slice(2)] = value;
  }
  const origin = new URL(options.origin);
  assert(["https:", "http:"].includes(origin.protocol) && !origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/", "--origin must be a plain HTTP(S) origin without credentials");
  options.origin = origin.origin;
  for (const [key, maximum] of [["concurrency", 8], ["timeoutMs", 60_000]]) {
    options[key] = Number(options[key]);
    assert(Number.isInteger(options[key]) && options[key] > 0 && options[key] <= maximum, key + " must be between 1 and " + maximum);
  }
  assert(["all", "sample"].includes(options.redirects), "--redirects must be all or sample");
  if (options.expectedCommit) assert(/^[a-f\d]{40}$/i.test(options.expectedCommit), "--expected-commit must be a full commit SHA");
  return options;
}

export async function livePlan(root = process.cwd()) {
  const { graph, lifecycle } = readCanonicalInputs(root);
  const paths = canonicalPaths();
  const legacy = canonicalHostAliasRows(await loadAliasRegistry(root));
  const answers = deriveCanonicalAnswerTopology(graph, lifecycle).answers.map((record) => ({ source: "/" + record.htmlId, target: urlForHtmlId(record.htmlId), statusCode: 301 }));
  const corpus = redirectRows();
  const registered = new Set([...legacy, ...answers, ...corpus].map((row) => row.source));
  const metadata = canonicalMetadataAliasRows(graph, lifecycle.canonicalUrl).filter(({ source }) => !paths.includes(source) && !registered.has(source));
  const namespaces = machineNamespaceAliasRows();
  const rows = [...legacy, ...answers, ...corpus, ...metadata, ...namespaces];
  renderStaticRewrites(rows);
  assertSingleHopDelivery(rows, lifecycle.canonicalUrl);
  return { canonicalOrigin, paths, rows, namespaces, release: lifecycle.release,
    counts: { canonical: paths.length, corpusRedirects: corpus.length, answerRedirects: answers.length, legacyRules: legacy.length, metadataRules: metadata.length, namespaces: namespaces.length } };
}

/** No retries: each requested URL is checked once, with a bounded total worker pool. */
export async function validateLive(plan, options, { fetchImpl = fetch, onProgress = () => {} } = {}) {
  const startedAt = new Date().toISOString();
  const checks = [], documents = new Map();
  const logicalUrl = (value, base) => {
    const url = new URL(value, base);
    return url.origin === options.origin
      ? new URL(url.pathname + url.search + url.hash, plan.canonicalOrigin)
      : url;
  };
  const request = async (source, method, inspect) => {
    const record = { path: source, method, ok: false };
    const start = performance.now();
    try {
      const response = await fetchImpl(new URL(source, options.origin), { method, redirect: "manual", signal: AbortSignal.timeout(options.timeoutMs), headers: { "User-Agent": "ghezelbaash-live-validation/1.0", Accept: method === "HEAD" ? "*/*" : "text/html, application/ld+json, application/json" } });
      record.status = response.status;
      for (const [header, field] of [["cf-cache-status", "cacheStatus"], ["age", "cacheAge"], ["x-robots-tag", "httpRobots"]]) {
        const value = response.headers.get(header);
        if (value != null) record[field] = value;
      }
      await inspect(response, record);
      record.ok = true;
    } catch (error) { record.error = error.message; }
    record.elapsedMs = Math.round(performance.now() - start);
    checks.push(record);
    if (checks.length % 100 === 0) onProgress(checks.length);
  };
  const pooled = async (tasks) => {
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(options.concurrency, tasks.length) }, async () => {
      while (index < tasks.length) await tasks[index++]();
    }));
  };
  let build;
  await request("/build-info.json", "GET", async (response, record) => {
    assert.equal(response.status, 200, "Build identity must return 200 without redirection");
    assert(/application\/json\b/i.test(response.headers.get("content-type") || ""), "Build identity must have JSON MIME");
    build = await response.json();
    assert.equal(build.release, plan.release, "Deployed source release differs");
    assert(build.commit && build.branch && build.provider, "Incomplete deployed build identity");
    if (options.expectedCommit) assert.equal(build.commit, options.expectedCommit, "Deployed commit differs from --expected-commit");
    record.commit = build.commit;
  });
  await pooled(plan.paths.map((pathname) => () => request(pathname, "GET", async (response, record) => {
    assert.equal(response.status, 200, "Canonical page must return 200 without redirection");
    assert(/^text\/html\b/i.test(response.headers.get("content-type") || ""), "Canonical page must have HTML MIME");
    assert(!response.headers.get("location"), "Canonical 200 page unexpectedly advertises a redirect");
    assert(!noindex(response.headers.get("x-robots-tag")), "Canonical page has a noindex HTTP directive");
    const source = await response.text();
    const inspected = inspectHtml(source);
    // A fresh build-info endpoint does not prove that cached HTML belongs to
    // that deployment. Check each document before trusting its semantic data.
    for (const [name, expected] of [
      ["x-build-commit", options.expectedCommit ?? build?.commit],
      ["x-build-release", plan.release],
      ["x-build-branch", build?.branch],
      ["x-build-provider", build?.provider],
    ]) {
      const nodes = inspected.elements.filter((node) => node.tagName === "meta" && attr(node, "name") === name);
      assert.equal(nodes.length, 1, "Canonical page must advertise exactly one " + name);
      const actual = attr(nodes[0], "content");
      if (name === "x-build-commit") record.commit = actual;
      assert(expected, "Deployment identity is unavailable for " + name);
      assert.equal(actual, expected, "Canonical page deployment differs for " + name);
    }
    const links = inspected.elements.filter((node) => node.tagName === "link" && values((attr(node, "rel") || "").split(/\s+/)).includes("canonical"));
    assert.equal(links.length, 1, "Canonical page must advertise exactly one canonical");
    const expected = new URL(pathname, plan.canonicalOrigin).href;
    assert.equal(new URL(attr(links[0], "href"), new URL(pathname, options.origin)).href, expected, "Page canonical differs from its final public URL");
    record.canonical = expected;
    const robots = inspected.elements.filter((node) => node.tagName === "meta" && /^(?:robots|googlebot|bingbot)$/i.test(attr(node, "name") || ""));
    assert(robots.some((node) => /^robots$/i.test(attr(node, "name"))), "Canonical page lacks a robots meta directive");
    assert(robots.every((node) => !noindex(attr(node, "content"))), "Canonical page has a noindex meta directive");
    const scripts = inspected.elements.filter((node) => node.tagName === "script" && attr(node, "type") === "application/ld+json");
    assert.equal(scripts.length, 1, "Canonical page must have one compiled discovery graph");
    const document = JSON.parse(scripts[0].childNodes.map((node) => node.value || "").join(""));
    const pageId = pathname === "/" ? plan.canonicalOrigin + "/webpage" : expected + "#webpage";
    assertRichResultsDocument(document, { primaryPageId: pageId });
    const page = document["@graph"].find((node) => node["@id"] === pageId);
    assert(page && page.url === expected, "Discovery page identity differs from its canonical URL");
    const doctor = document["@graph"].find((node) => node["@id"] === physicianId);
    assert(typed(doctor, "Person") && doctor.url === plan.canonicalOrigin + "/", "Persistent physician identity or homepage URL differs");
    assert.equal(doctor.mainEntityOfPage?.["@id"], plan.canonicalOrigin + "/webpage", "Physician primary profile page differs");
    if (pathname === "/") {
      assert(typed(page, "ProfilePage") && typed(page, "MedicalWebPage"), "Homepage must be the physician ProfilePage and medical portfolio");
      assert.equal(page.mainEntity?.["@id"], physicianId, "Homepage profile must focus on the persistent physician");
      assert.equal(document["@graph"].filter((node) => typed(node, "ProfilePage")).length, 1, "Homepage has a competing ProfilePage");
    } else assert(!document["@graph"].some((node) => typed(node, "ProfilePage")), "A focused route competes with the primary home profile");
    documents.set(pathname, new Set(inspected.ids));
  })));
  const redirects = plan.rows.filter((row) => row.statusCode !== 200);
  const sampled = options.redirects === "sample" ? redirects.filter((row, index) => index % Math.max(1, Math.floor(redirects.length / 25)) === 0).slice(0, 30) : redirects;
  await pooled(sampled.map((row) => () => request(row.source, "HEAD", async (response, record) => {
    assert.equal(response.status, row.statusCode, "Legacy URL has the wrong permanent redirect status");
    const location = response.headers.get("location");
    assert(location, "Permanent redirect is missing Location");
    const actual = logicalUrl(location, new URL(row.source, options.origin));
    const expected = new URL(row.target, plan.canonicalOrigin);
    assert.equal(actual.href, expected.href, "Redirect must resolve in one hop to its exact final URL and fragment");
    record.location = actual.href;
    assert(plan.paths.includes(expected.pathname), "Redirect target is not a canonical HTML resource");
    assertPublishedFragment(expected, documents.get(expected.pathname), "Live redirect " + row.source);
    assert(documents.has(expected.pathname), "Redirect target did not pass the canonical 200 page checks");
  })));
  const machineCheck = (target, body) => async (response, record) => {
    assert.equal(response.status, 200, "Machine namespace must return its representation with 200");
    assert(!response.headers.get("location"), "Machine representation must not redirect");
    assert(/^application\/ld\+json\b/i.test(response.headers.get("content-type") || ""), "Machine namespace must have JSON-LD MIME, without HTML fallback");
    assert.equal(response.headers.get("access-control-allow-origin"), "*", "Machine representation must permit public CORS");
    const representation = new URL(target, plan.canonicalOrigin).href;
    const link = response.headers.get("link") || "";
    assert(link.split(/,(?=\s*<)/).some((value) => value.includes("<" + representation + ">") && /\brel\s*=\s*["']?canonical\b/i.test(value)), "Machine namespace has the wrong representation canonical Link");
    record.canonical = representation;
    if (body) {
      const json = await response.json();
      assert(json && json["@context"] && Array.isArray(json["@graph"]), "Machine namespace returned something other than the compiled JSON-LD graph");
    }
  };
  const machineRows = plan.rows.filter((row) => row.statusCode === 200 && !row.source.includes("*"));
  await pooled(machineRows.map((row) => () => request(row.source, "HEAD", machineCheck(row.target, false))));
  const probes = [...new Set(plan.namespaces.map((row) => row.target))].map((target) => ({ source: target, target }));
  probes.push(...plan.namespaces.map((row) => ({ source: row.source.replace("*", "live-validation-probe"), target: row.target })));
  await pooled(probes.map((row) => () => request(row.source, "GET", machineCheck(row.target, true))));
  checks.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  const failed = checks.filter((record) => !record.ok);
  return { schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), origin: options.origin, canonicalOrigin: plan.canonicalOrigin,
    expectedCommit: options.expectedCommit ?? null, build: build ?? null, redirectMode: options.redirects,
    coverage: { ...plan.counts, redirectsChecked: sampled.length, machineAliasesChecked: machineRows.length, machineRepresentationProbes: probes.length },
    ok: failed.length === 0, totals: { checked: checks.length, passed: checks.length - failed.length, failed: failed.length }, checks };
}

async function main() {
  const options = liveOptions(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/validate-live.mjs [--origin https://www.ghezelbaash.ir] [--expected-commit SHA] [--redirects all|sample] [--concurrency 1..8] [--timeout-ms 20000] [--redirects-file dist/_redirects] [--report .generated/live-validation.json]\nNetwork checks are optional and separate from the build. Public canonical URLs remain production URLs when --origin points to a local server.");
    return;
  }
  const plan = await livePlan();
  if (options.redirectsFile) assert.equal(await readFile(options.redirectsFile, "utf8"), renderStaticRewrites(plan.rows), "Local _redirects differs from the shared canonical publication policy");
  if (!options.expectedCommit) {
    const localBuild = JSON.parse(await readFile("dist/build-info.json", "utf8").catch(() => "null"));
    if (/^[a-f\d]{40}$/i.test(localBuild?.commit || "")) options.expectedCommit = localBuild.commit;
  }
  console.log(`Validating ${plan.paths.length} canonical pages and ${plan.counts.corpusRedirects} corpus redirects (${options.redirects}); at most ${options.concurrency} requests in flight.`);
  const report = await validateLive(plan, options, { onProgress: (count) => console.log("Checked " + count + " URLs.") });
  await mkdir(path.dirname(options.report), { recursive: true });
  await writeFile(options.report, JSON.stringify(report, null, 2) + "\n");
  console.log(`${report.totals.passed}/${report.totals.checked} checks passed. Report: ${options.report}`);
  for (const check of report.checks.filter((row) => !row.ok).slice(0, 20)) console.error(`${check.method} ${check.path}: ${check.error}`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
