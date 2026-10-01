import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertDocumentContract } from "./html-contract.mjs";
import { projectFocusedMedia } from "./focused-media.mjs";
import { assertRichResultsDocument } from "../../src/lib/rich-results-contract.mjs";

const attr = (node, name) => node.attrs?.find((entry) => entry.name === name)?.value;
const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const hasType = (node, type) => values(node?.["@type"]).includes(type);
const signature = (items) => JSON.stringify(items.map(({ href, hrefLang }) => [href, hrefLang]).sort());
const xmlText = (value) => value.replaceAll("&quot;", '"').replaceAll("&apos;", "'")
  .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

export function canonicalProductionUrl(value) {
  const url = new URL(value);
  assert(url.protocol === "https:" && url.pathname === "/" && !url.username && !url.password &&
    !url.search && !url.hash, "Live verification requires the canonical HTTPS homepage");
  return url;
}
export function assertLiveResponse(response, { url, mediaType, indexable = false }) {
  assert.equal(response.status, 200, "Live HTTP status for " + url);
  assert(!response.redirected && !response.headers.get("location"), "Live URL must not redirect: " + url);
  if (response.url) assert.equal(response.url, url, "Live response URL drift");
  assert.equal(response.headers.get("content-type")?.split(";")[0].trim().toLowerCase(),
    mediaType, "Live MIME for " + url);
  if (indexable) assert(!/\bnoindex\b/i.test(response.headers.get("x-robots-tag") || ""),
    "Live HTML must remain indexable: " + url);
}
export function assertDeploymentFingerprint(value, { expectedCommit, release }) {
  assert(/^[0-9a-f]{40}$/i.test(expectedCommit), "Expected live commit must be a full SHA");
  assert.equal(value.schemaVersion, "1.0", "Live fingerprint schema");
  assert.equal(value.commit, expectedCommit, "Live deployment has a different commit");
  assert.equal(value.branch, "main", "Live deployment must be main");
  assert.equal(value.provider, "cloudflare-pages", "Live deployment provider");
  if (release) assert.equal(value.release, release, "Live release");
  return value;
}

/** Bounded polling, with injectable clock and transport for offline tests. */
export async function waitForDeployment({ canonicalUrl, expectedCommit, release,
  fetchImpl = fetch, now = Date.now, delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  timeoutMs = 480000, intervalMs = 15000, onAttempt = () => {} }) {
  const canonical = canonicalProductionUrl(canonicalUrl);
  assert(/^[0-9a-f]{40}$/i.test(expectedCommit), "Expected live commit must be a full SHA");
  assert(timeoutMs > 0 && timeoutMs <= 480000 && intervalMs > 0, "Live poll bounds");
  const endpoint = new URL("build-info.json", canonical);
  endpoint.searchParams.set("verify", expectedCommit);
  const deadline = now() + timeoutMs;
  let attempt = 0, lastError = "No fingerprint received";
  while (now() < deadline) {
    attempt++;
    try {
      const response = await fetchImpl(endpoint.href, { method: "GET", redirect: "manual",
        headers: { "Cache-Control": "no-cache" },
        signal: AbortSignal.timeout(Math.max(1, Math.min(10000, deadline - now()))) });
      assertLiveResponse(response, { url: endpoint.href, mediaType: "application/json" });
      const fingerprint = assertDeploymentFingerprint(await response.json(), { expectedCommit, release });
      onAttempt({ attempt, commit: fingerprint.commit });
      return fingerprint;
    } catch (error) {
      lastError = error.message;
      onAttempt({ attempt, error: lastError });
    }
    const remaining = deadline - now();
    if (remaining > 0) await delay(Math.min(intervalMs, remaining));
  }
  throw new Error("Timed out waiting for production commit " + expectedCommit + ": " + lastError);
}

export function assertLiveDocument(html, { canonicalUrl, pageUrl, expectedCommit, personId, homePageId,
  graph, alternates = [], expectedMainType, expectedEntityId }) {
  const canonical = canonicalProductionUrl(canonicalUrl), url = new URL(pageUrl);
  assert.equal(url.origin, canonical.origin, "Live page must use the canonical origin");
  assert(!url.search && !url.hash, "Live page must use its canonical path");
  const inspected = assertDocumentContract(html);
  const elements = inspected.elements;
  const links = elements.filter((node) => node.tagName === "link");
  const canonicals = links.filter((node) => attr(node, "rel") === "canonical");
  assert.equal(canonicals.length, 1, "One live canonical");
  assert.equal(attr(canonicals[0], "href"), pageUrl, "Live self canonical");
  const metas = elements.filter((node) => node.tagName === "meta");
  assert.equal(attr(metas.find((node) => attr(node, "name") === "x-build-commit"), "content"),
    expectedCommit, "Live HTML fingerprint");
  const robots = attr(metas.find((node) => attr(node, "name") === "robots"), "content");
  assert(robots && !/\bnoindex\b/i.test(robots), "Live HTML robots");
  const actualAlternates = links.filter((node) => attr(node, "rel") === "alternate" && attr(node, "hreflang"))
    .map((node) => ({ href: attr(node, "href"), hrefLang: attr(node, "hreflang") }));
  assert.equal(signature(actualAlternates), signature(alternates), "Live reciprocal language alternates");
  const scripts = elements.filter((node) => node.tagName === "script" && attr(node, "type") === "application/ld+json");
  assert.equal(scripts.length, 1, "One live discovery graph");
  const document = JSON.parse(scripts[0].childNodes.map((node) => node.value || "").join(""));
  const isHome = pageUrl === canonical.href, pageId = isHome ? homePageId : pageUrl + "#webpage";
  const result = assertRichResultsDocument(document, { primaryPageId: pageId });
  assert.equal(result.incompleteCandidates.length, 0, "Live candidates must remain complete");
  const byId = new Map(document["@graph"].map((node) => [node["@id"], node]));
  const page = byId.get(pageId), person = byId.get(personId);
  assert(hasType(person, "Person"), "Live fixed Doctor must remain a Person");
  assert.equal(person.url, canonical.href, "Live Doctor homepage URL");
  assert.deepEqual(person.mainEntityOfPage, { "@id": homePageId }, "Live Doctor main profile");
  assert.equal(page.url, pageUrl, "Live structured page URL");
  const subjects = values(page.mainEntity).map((ref) => byId.get(ref?.["@id"]));
  assert(subjects.length && subjects.every((node) => values(node?.["@type"]).length), "Live typed mainEntity");
  if (expectedMainType) assert(subjects.some((node) => hasType(node, expectedMainType)), "Live subject type drift");
  if (expectedEntityId) assert(subjects.some((node) => node["@id"] === expectedEntityId), "Live subject identity drift");
  const originalPerson = graph["@graph"].find((node) => node["@id"] === personId);
  for (const key of ["sameAs", "hasCredential", "memberOf", "identifier"])
    if (key in originalPerson) assert.deepEqual(person[key], originalPerson[key], "Live Doctor identity: " + key);
  if (isHome) {
    for (const node of graph["@graph"]) {
      assert(byId.has(node["@id"]), "Live homepage lost entity: " + node["@id"]);
      assert.deepEqual(values(byId.get(node["@id"])["@type"]), values(node["@type"]), "Live homepage entity type drift");
    }
    assert.deepEqual(page.mainEntity, { "@id": personId }, "Live homepage Doctor mainEntity");
  } else {
    assert.equal(attr(elements.find((node) => node.tagName === "html"), "data-route-view"), "focused", "Live focused entry");
    assert(inspected.elements.some((node) => attr(node, "data-guide-expand") !== undefined), "Live complete-guide control");
    assert.deepEqual(page.author, { "@id": personId }, "Live topic author");
    assert.deepEqual(page.publisher, { "@id": personId }, "Live topic publisher");
    assert(values(page.isPartOf).some((ref) => ref["@id"] === homePageId), "Live topic homepage relation");
    assert.equal(projectFocusedMedia(html, pageUrl), html, "Live scoped media projection");
  }
  const videos = document["@graph"].filter((node) => hasType(node, "VideoObject"));
  assert.equal(videos.length, inspected.videos.length, "Live visible video discovery count");
  for (const video of videos) {
    const player = inspected.videos.find((node) => (node.childNodes || []).some((source) =>
      source.tagName === "source" && new URL(attr(source, "src"), canonical).href === video.contentUrl));
    assert(player, "Live video must retain its visible playable source");
    assert.equal(new URL(attr(player, "data-poster"), canonical).href, values(video.thumbnailUrl)[0],
      "Live video poster must match its discovery object");
  }
  return { url: pageUrl, entities: document["@graph"].length, subjects: subjects.map((node) => node["@id"]),
    videos: inspected.videos.length, languageAlternates: actualAlternates.length };
}

export function assertLiveSitemap(xml, { canonicalUrl, requiredUrls, translationGroups = [] }) {
  const canonical = canonicalProductionUrl(canonicalUrl);
  const records = new Map();
  for (const match of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/g)) {
    const body = match[1], loc = /<loc>([^<]+)<\/loc>/.exec(body)?.[1];
    assert(loc, "Live sitemap entry needs loc");
    const href = xmlText(loc), url = new URL(href);
    assert(url.origin === canonical.origin && url.protocol === "https:" && !url.search && !url.hash &&
      !url.username && !url.password && url.href === href, "Live sitemap canonical origin/path");
    assert(!records.has(href), "Live sitemap duplicate loc");
    const alternates = [...body.matchAll(/<xhtml:link\b([^>]*)\/?\s*>/g)].map((entry) => {
      const value = (key) => xmlText(new RegExp(key + '=["\\\']([^"\\\']+)["\\\']').exec(entry[1])?.[1] || "");
      assert.equal(value("rel"), "alternate", "Live sitemap language relation");
      return { href: value("href"), hrefLang: value("hreflang") };
    });
    records.set(href, alternates);
  }
  assert(records.size > 0 && records.size <= 50000, "Live sitemap entry bounds");
  for (const url of requiredUrls) assert(records.has(url), "Live sitemap missing representative: " + url);
  const expected = new Map();
  for (const group of translationGroups) {
    const alternates = group.members.map((member) => ({ href: new URL(member.path, canonical).href, hrefLang: member.hreflang }));
    for (const alternate of alternates) expected.set(alternate.href, alternates);
  }
  for (const [url, alternates] of records)
    assert.equal(signature(alternates), signature(expected.get(url) || []), "Live sitemap language group: " + url);
  for (const url of expected.keys()) assert(records.has(url), "Live sitemap missing declared translation: " + url);
  return { entries: records.size, translatedEntries: expected.size };
}

export function assertLiveRobots(text, canonicalUrl) {
  canonicalProductionUrl(canonicalUrl);
  assert(/^User-agent:\s*\*\s*$/im.test(text) && /^Allow:\s*\/\s*$/im.test(text) &&
    !/^Disallow:\s*\/\s*$/im.test(text), "Live robots must allow the public site");
  assert(text.split(/\r?\n/).some((line) => line.trim() === "Sitemap: " + canonicalUrl + "sitemap.xml"),
    "Live robots sitemap declaration");
}
export function assertLiveGraphBytes(bytes, expectedBytes) {
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  const actual = digest(bytes);
  assert.equal(actual, digest(expectedBytes), "Live canonical graph bytes drift");
  return actual;
}
