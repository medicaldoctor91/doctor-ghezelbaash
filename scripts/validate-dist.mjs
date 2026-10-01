import assert from "node:assert/strict";
import { canonicalContentHtmlId } from "../src/lib/graph-core.mjs";
import { contentRoutePaths } from "./lib/content-routes.mjs";
import { canonicalMetadataRedirectRows, renderStaticRedirects } from "./lib/redirect-registry.mjs";
import { deriveCanonicalAnswerProjection, validateProjectedAnswerHtml } from "../src/lib/answer-projection.mjs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { readCanonicalInputs } from "../src/lib/canonical-inputs.mjs";
import { MACHINE_RESOURCES } from "../src/lib/resources.mjs";
import { assertDocumentContract } from "./lib/html-contract.mjs";

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] ?? "dist");
const { graph, lifecycle, pageFrontmatter: page, evidenceRegistry } = readCanonicalInputs(root);
const html = await readFile(path.join(dist, "index.html"), "utf8");
assert(!/{{[A-Z][A-Z0-9_]*}}/.test(html), "Unresolved authored token in HTML");
const { elements, ids } = assertDocumentContract(html);
const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const namedMeta = new Map(elements.filter((node) => node.tagName === "meta")
  .map((node) => [attr(node, "name"), attr(node, "content")]));
for (const [name, value] of Object.entries(page.headValues))
  assert.equal(namedMeta.get(name), value, `Canonical head value: ${name}`);
assert.equal(namedMeta.get("x-build-release"), lifecycle.release);

const search = elements.find((node) => attr(node, "id") === "guide-search");
assert.deepEqual(JSON.parse(attr(search, "data-copy")), page.guideSearch);
const targets = JSON.parse(attr(search, "data-intent-targets"));
const intentHeadings = JSON.parse(attr(search, "data-intent-headings"));
for (const [intent, url] of Object.entries(page.intentTargets)) {
  const htmlId = canonicalContentHtmlId(url, lifecycle.canonicalUrl);
  assert.equal(targets[intent], url);
  assert(ids.includes(htmlId), `Missing search destination: ${intent}`);
  const answer = graph['@graph'].find((node) => node['@id'] === url);
  const headingId = canonicalContentHtmlId(answer.url, lifecycle.canonicalUrl);
  assert.equal(intentHeadings[intent], headingId);
  assert(elements.some((node) => /^h[1-5]$/.test(node.tagName) && attr(node, 'id') === headingId), `Missing canonical intent heading: ${intent}`);
}

const paths = contentRoutePaths(html, lifecycle.canonicalUrl);
const redirects = (await readFile(path.join(dist, "_redirects"), "utf8")).trim().split(/\r?\n/);
renderStaticRedirects(redirects.map((line) => {
  const [source, target, statusCode] = line.split(/\s+/);
  return { source, target, statusCode: Number(statusCode) };
}));
for (const route of paths) assert(redirects.includes(`${route} /index.html 200`), `Missing content route: ${route}`);
const metadataRoutes = canonicalMetadataRedirectRows(graph, lifecycle.canonicalUrl);
for (const { source, target, statusCode } of metadataRoutes)
  assert(redirects.includes(`${source} ${target} ${statusCode}`), `Missing metadata description: ${source}`);

// Check actual published links and media URLs, including chapter parameters.
// Canonical RDF identities are validated separately from browser resources.
const localOrigin = new URL(lifecycle.canonicalUrl).origin;
const redirectSources = new Set(redirects.map((line) => line.split(/\s+/)[0]));
for (const node of elements) {
  for (const name of ["href", "src", "poster", "data-poster"]) {
    const value = attr(node, name);
    if (!value) continue;
    const url = new URL(value, lifecycle.canonicalUrl);
    if (url.origin !== localOrigin) continue;
    if (url.pathname === "/") {
      if (url.hash) assert(ids.includes(decodeURIComponent(url.hash.slice(1))), `Missing local target: ${value}`);
      continue;
    }
    if (redirectSources.has(url.pathname)) continue;
    assert((await stat(path.join(dist, url.pathname.slice(1))).catch(() => null))?.isFile(), `Missing published resource: ${value}`);
  }
}
const answerValidation = validateProjectedAnswerHtml(html, deriveCanonicalAnswerProjection(graph, lifecycle));

const figure = elements.find((node) => attr(node, "id") === "image-saeed-ghezelbash-portrait-master");
assert.equal(attr(figure, "itemtype"), "https://schema.org/ImageObject");
const image = graph["@graph"].find((node) => node["@id"] === attr(figure, "itemid"));
const descendants = elements.filter((node) => {
  for (let parent = node.parentNode; parent; parent = parent.parentNode) if (parent === figure) return true;
  return false;
});
for (const key of ["contentUrl", "license", "acquireLicensePage", "creditText", "copyrightNotice", "encodingFormat"]) {
  const property = descendants.find((node) => attr(node, "itemprop") === key);
  assert.equal(attr(property, "href") ?? attr(property, "content"), image[key], `Image property: ${key}`);
}


const ldDocuments = elements.filter((node) => node.tagName === "script" &&
  attr(node, "type") === "application/ld+json")
  .map((node) => JSON.parse(node.childNodes.map((child) => child.value || "").join("")));
assert.equal(ldDocuments.length, 1, "One browser discovery graph is required");
assert.equal(ldDocuments[0]["@context"], "https://schema.org");
const browserNodes = ldDocuments[0]["@graph"];
const browserById = new Map(browserNodes.map((node) => [node["@id"], node]));
const profileNodes = browserNodes.filter((node) => node["@type"] === "ProfilePage");
assert.equal(profileNodes.length, 1, "External evidence profiles must not become page profiles");
assert.equal(profileNodes[0]["@id"], page.pageMicrodata.itemId);
assert.equal(browserById.get(profileNodes[0].mainEntity["@id"])?.["@type"], "Person");
assert(!browserNodes.some((node) => ["Event", "EducationEvent", "CourseInstance", "Review"].includes(node["@type"])),
  "Historical events and self-hosted reviews belong in the full graph");
assert(!elements.some((node) => (attr(node, "itemtype") || "").includes("ProfilePage")),
  "Do not duplicate the JSON-LD profile with URL-valued Microdata");
const inspectBrowserValue = (value) => {
  if (Array.isArray(value)) return value.forEach(inspectBrowserValue);
  if (!value || typeof value !== "object") return;
  assert(!("@value" in value), "Browser strings must not use RDF language-value objects");
  if (value["@id"] && Object.keys(value).length === 1)
    assert(browserById.has(value["@id"]), "Unresolved browser entity: " + value["@id"]);
  Object.values(value).forEach(inspectBrowserValue);
};
inspectBrowserValue(browserNodes);
for (const node of browserNodes.filter((node) => ["ProfilePage", "Person", "MedicalClinic", "ImageObject", "VideoObject"].includes(node["@type"])))
  assert.equal(typeof node.name, "string", "Browser name must be a text value");
const creator = descendants.find((node) => attr(node, "itemprop") === "creator");
assert.equal(attr(creator, "itemtype"), "https://schema.org/Person");
assert.equal(attr(creator, "itemid"), image.creator["@id"]);
assert(creator.attrs.some((attribute) => attribute.name === "itemscope"));
assert(creator.childNodes.some((node) => attr(node, "itemprop") === "name" && attr(node, "content")),
  "Microdata image creator needs its authored name");
const sitemap = await readFile(path.join(dist, "sitemap.xml"), "utf8");
const xmlValue = (value) => value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => xmlValue(match[1]));
assert.deepEqual(sitemapLocs, [lifecycle.canonicalUrl], "Only the canonical document belongs in sitemap");
const pageNode = graph["@graph"].find((node) => node["@id"] === page.pageMicrodata.itemId);
assert(sitemap.includes("<lastmod>" + pageNode.dateModified + "</lastmod>"), "Sitemap revision must be authored");
for (const match of sitemap.matchAll(/<(?:image:loc|video:thumbnail_loc|video:content_loc)>([^<]+)<\/(?:image:loc|video:thumbnail_loc|video:content_loc)>/g)) {
  const url = new URL(xmlValue(match[1]));
  assert.equal(url.origin, localOrigin, "Sitemap media must use the canonical origin");
  assert((await stat(path.join(dist, url.pathname.slice(1))).catch(() => null))?.isFile(),
    "Missing sitemap media: " + url.href);
}
const browserVideos = browserNodes.filter((node) => node["@type"] === "VideoObject");
assert.equal(browserVideos.length, graph["@graph"].filter((node) => [node["@type"]].flat().includes("VideoObject")).length);
for (const video of browserVideos)
  assert(sitemap.includes("<video:content_loc>" + video.contentUrl + "</video:content_loc>"),
    "Browser video and sitemap must agree");

assert.deepEqual(await readFile(path.join(dist, "graph.jsonld")),
  await readFile(path.join(root, "src/data/semantic/knowledge-graph.jsonld")), "Published graph differs from canonical graph");
assert.equal(await readFile(path.join(dist, "llms.txt"), "utf8"), page.llmsGuide);
for (const resource of MACHINE_RESOURCES.filter((item) => item.materialize))
  assert((await stat(path.join(dist, resource.path))).size > 0, `Missing resource: ${resource.path}`);

const provenance = JSON.parse(await readFile(path.join(dist, "provenance.jsonld"), "utf8"));
const provenanceById = new Map(provenance["@graph"].map((node) => [node["@id"], node]));
for (const assessment of evidenceRegistry.assessmentNodes)
  assert.deepEqual(provenanceById.get(assessment["@id"]), assessment, `Rewritten assessment: ${assessment["@id"]}`);
const snapshot = JSON.parse(await readFile(path.join(dist, "evidence-snapshot.json"), "utf8"));
for (const entry of evidenceRegistry.evidence) {
  const published = snapshot.entries.find((item) => item.assessmentId === entry.assessmentId);
  assert(published, `Missing evidence snapshot entry: ${entry.id}`);
  assert.equal(published.status, entry.liveStatus);
  assert.equal(published.verifiedAt, entry.verifiedAt);
}
assert(!JSON.stringify(snapshot).includes("not-verified-for-current-release"));
assert(!/PRICE_RANGE: undefined|X-PRICE-RANGE:undefined/.test(
  await readFile(path.join(dist, "llms-full.txt"), "utf8") + await readFile(path.join(dist, "clinic.vcf"), "utf8")));
console.log(JSON.stringify({ canonicalOutputValidation: "PASS", release: lifecycle.release, answers: answerValidation.answers, contentRoutes: paths.length, metadataRoutes: metadataRoutes.length, resources: MACHINE_RESOURCES.length, assessments: evidenceRegistry.evidence.length }));
