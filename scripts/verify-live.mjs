import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { readCanonicalInputs } from "../src/lib/canonical-inputs.mjs";
import { renderCanonicalPageHtml } from "../src/lib/canonical-page-html.mjs";
import { contentRoutePaths } from "./lib/content-routes.mjs";
import { canonicalProductionUrl, waitForDeployment, assertLiveResponse, assertLiveDocument,
  assertLiveSitemap, assertLiveRobots, assertLiveGraphBytes } from "./lib/live-smoke.mjs";

const inputs = readCanonicalInputs(), { lifecycle, graph, pageFrontmatter } = inputs;
const canonical = canonicalProductionUrl(lifecycle.canonicalUrl);
const expectedCommit = process.env.GITHUB_SHA;
assert(/^[0-9a-f]{40}$/i.test(expectedCommit || ""), "GITHUB_SHA must identify the exact main deployment");
const types = (node) => [node?.["@type"]].flat();
const homePage = graph["@graph"].find((node) => node.url === canonical.href && types(node).includes("ProfilePage"));
assert(homePage, "Canonical homepage identity is required");
const routes = new Set(contentRoutePaths(renderCanonicalPageHtml(inputs.pageBody), canonical.href));
const groups = pageFrontmatter.discovery?.translationGroups || [];
const representatives = [
  { path: "/", mainType: "Person" },
  { path: "/botox" },
  { path: "/botox-heading" },
  { path: "/answer-botox-onset-of-action", mainType: "Answer" },
  { path: "/historical-patient-origin-summary", mainType: "CreativeWork" },
  { path: "/jalupro-vs-profhilo-selection", mainType: "Question" },
  { path: "/video-saeed-ghezelbash-jalupro-vs-profhilo", mainType: "VideoObject" },
  { path: "/botox-doctor-selection-criteria-kermanshah", mainType: "Question" },
  { path: "/botox-dose-brand-and-unit-equivalence", mainType: "WebPageElement" },
  ...(groups[0]?.members || []).map((member) => ({ path: member.path, mainType: "Question", lang: member.lang })),
];
assert.equal(new Set(representatives.map((record) => record.path)).size, representatives.length);
assert(representatives.some((record) => record.lang === "en"), "Live sample requires an authored English translation");
for (const record of representatives) assert(record.path === "/" || routes.has(record.path), "Unpublished live sample: " + record.path);
const report = { status: "FAIL", expectedCommit, canonicalUrl: canonical.href, startedAt: new Date().toISOString(), pages: [] };
const request = async (url, mediaType, indexable = false) => {
  const response = await fetch(url, { method: "GET", redirect: "manual", headers: { "Cache-Control": "no-cache" },
    signal: AbortSignal.timeout(10000) });
  assertLiveResponse(response, { url, mediaType, indexable });
  return response;
};
try {
  report.fingerprint = await waitForDeployment({ canonicalUrl: canonical.href, expectedCommit, release: lifecycle.release,
    onAttempt: (value) => console.log(JSON.stringify({ deploymentPoll: value })) });
  for (const record of representatives) {
    const pageUrl = new URL(record.path, canonical).href;
    const group = groups.find((entry) => entry.members.some((member) => member.path === record.path));
    const alternates = (group?.members || []).map((member) => ({
      href: new URL(member.path, canonical).href, hrefLang: member.hreflang }));
    const expectedEntity = record.mainType === "Question"
      ? graph["@graph"].find((node) => node.url === pageUrl && types(node).includes("Question"))
      : undefined;
    if (record.mainType === "Question") assert(expectedEntity, "Live sample must have its authored Question");
    const response = await request(pageUrl, "text/html", true);
    report.pages.push(assertLiveDocument(await response.text(), {
      canonicalUrl: canonical.href, pageUrl, expectedCommit, personId: lifecycle.primaryEntity.id,
      homePageId: homePage["@id"], graph, alternates, expectedMainType: record.mainType,
      expectedEntityId: expectedEntity?.["@id"],
    }));
  }
  const sitemap = await request(new URL("sitemap.xml", canonical).href, "application/xml");
  report.sitemap = assertLiveSitemap(await sitemap.text(), { canonicalUrl: canonical.href,
    requiredUrls: report.pages.map((page) => page.url), translationGroups: groups });
  const robots = await request(new URL("robots.txt", canonical).href, "text/plain");
  assertLiveRobots(await robots.text(), canonical.href);
  report.robots = "PASS";
  const response = await request(new URL("graph.jsonld", canonical).href, "application/ld+json");
  report.graphSha256 = assertLiveGraphBytes(Buffer.from(await response.arrayBuffer()),
    await readFile("src/data/semantic/knowledge-graph.jsonld"));
  report.status = "PASS";
} catch (error) {
  report.error = error.message;
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await writeFile("live-smoke-report.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
