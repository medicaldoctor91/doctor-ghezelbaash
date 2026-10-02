import assert from "node:assert/strict";
import { deriveTopicBreadcrumbItems } from "./lib/topic-navigation.mjs";
import { assertRichResultsDocument } from "../src/lib/rich-results-contract.mjs";
import { canonicalContentHtmlId } from "../src/lib/graph-core.mjs";
import { contentRoutePaths } from "./lib/content-routes.mjs";
import { routeDocumentFile } from "./lib/independent-pages.mjs";
import { canonicalMetadataAliasRows, canonicalHostAliasRows, loadAliasRegistry, contentAliasTargets, renderStaticRewrites } from "./lib/redirect-registry.mjs";
import { deriveCanonicalAnswerProjection, validateProjectedAnswerHtml } from "../src/lib/answer-projection.mjs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { readCanonicalInputs } from "../src/lib/canonical-inputs.mjs";
import { MACHINE_RESOURCES } from "../src/lib/resources.mjs";
import { assertCloudflareHeadersContract } from "./lib/headers-template.mjs";
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
const rewriteRows = redirects.map((line) => {
  const [source, target, statusCode] = line.split(/\s+/);
  return { source, target, statusCode: Number(statusCode) };
});
renderStaticRewrites(rewriteRows);
const cleanRouteFiles = new Map(paths.map((route) => [route, routeDocumentFile(route)]));
const deployedFileForPath = (pathname) => pathname === "/"
  ? "index.html"
  : cleanRouteFiles.get(pathname) ?? pathname.slice(1);
for (const { source, target, statusCode } of rewriteRows) {
  assert.equal(statusCode, 200, `URL-changing redirect: ${source}`);
  assert((await stat(path.join(dist, deployedFileForPath(target))).catch(() => null))?.isFile(),
    `Rewrite must resolve to a deployed file: ${source} -> ${target}`);
}
const legacyAliases = canonicalHostAliasRows(await loadAliasRegistry(root));
const machinePaths = new Set(MACHINE_RESOURCES.filter((item) => item.materialize).map((item) => "/" + item.path));
const expectedAliases = contentAliasTargets(legacyAliases, machinePaths);
assert.deepEqual(JSON.parse(attr(search, "data-content-route-aliases")), { ...expectedAliases });
for (const target of Object.values(expectedAliases))
  assert(target === "/" || ids.includes(target.slice(1)), `Missing legacy content target: ${target}`);
for (const { source, target } of legacyAliases.filter((row) => row.source !== "/index.html"))
  assert(redirects.includes(`${source} ${target === "/" ? "/index.html" : target} 200`),
    `Missing direct legacy alias: ${source}`);
for (const route of paths) {
  assert(!rewriteRows.some((row) => row.source === route),
    `Clean content route must not be rewritten through its .html file: ${route}`);
  assert((await stat(path.join(dist, routeDocumentFile(route))).catch(() => null))?.isFile(),
    `Missing independent content document: ${route}`);
}
const metadataRoutes = canonicalMetadataAliasRows(graph, lifecycle.canonicalUrl);
for (const { source, target, statusCode } of metadataRoutes)
  assert(redirects.includes(`${source} ${target} ${statusCode}`), `Missing metadata description: ${source}`);

const deliveryHeaders = await readFile(path.join(dist, "_headers"), "utf8");
assertCloudflareHeadersContract(deliveryHeaders);
for (const source of ["/graph.jsonld/*", "/provenance.jsonld/*", "/website",
  "/medical-specialty-aesthetic-medicine",
  ...legacyAliases.filter((row) => row.target === "/graph.jsonld").map((row) => row.source)]) {
  const block = deliveryHeaders.split(/\n\n/).find((block) => block.startsWith(source + "\n"));
  assert(block?.includes("Content-Type: application/ld+json"), `Missing graph MIME: ${source}`);
  assert(block?.includes("Access-Control-Allow-Origin: *"), `Missing graph CORS: ${source}`);
  assert(block?.includes('<' + lifecycle.canonicalUrl + 'graph.jsonld>; rel="canonical"'),
    `Missing graph canonical: ${source}`);
}

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
    assert((await stat(path.join(dist, deployedFileForPath(url.pathname))).catch(() => null))?.isFile(), `Missing published resource: ${value}`);
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
const richResultCounts = assertRichResultsDocument(ldDocuments[0]);
console.log(JSON.stringify({ pageStructuredDataValidation: "PASS", ...richResultCounts }));
assert(ldDocuments[0]["@context"].includes("https://schema.org"));
const browserNodes = ldDocuments[0]["@graph"];
const browserById = new Map(browserNodes.map((node) => [node["@id"], node]));
const typeHas = (node, type) => [node["@type"]].flat().includes(type);
const profileNodes = browserNodes.filter((node) => typeHas(node, "ProfilePage"));
const primaryProfile = browserById.get(page.pageMicrodata.itemId);
assert(typeHas(primaryProfile, "ProfilePage"));
assert(typeHas(browserById.get(primaryProfile.mainEntity["@id"]), "Person"));
assert.equal(profileNodes.length, 1, "Homepage browser projection must expose only the canonical ProfilePage");
for (const type of ["FAQPage", "Event", "EducationEvent", "Review", "Dataset"])
  assert(!browserNodes.some((node) => typeHas(node, type)), "Homepage must not expose unsupported/noisy Google candidate: " + type);
const authoredPerson = graph["@graph"].find((node) => node["@id"] === primaryProfile.mainEntity["@id"]);
const publishedPerson = browserById.get(authoredPerson["@id"]);
for (const property of ["sameAs", "identifier", "hasCredential", "memberOf", "worksFor", "alumniOf"])
  assert.deepEqual(publishedPerson[property], authoredPerson[property], "Primary entity signal drift: " + property);
assert.equal(richResultCounts.incompleteCandidates.length, 0, "Published Google-facing candidates must be complete");
assert(!elements.some((node) => (attr(node, "itemtype") || "").includes("ProfilePage")),
  "Do not duplicate the JSON-LD profile with URL-valued Microdata");
const inspectBrowserValue = (value) => {
  if (Array.isArray(value)) return value.forEach(inspectBrowserValue);
  if (!value || typeof value !== "object") return;
  assert(!("@value" in value), "Browser strings must not use RDF language-value objects");
  if (value["@id"] && Object.keys(value).length === 1)
    assert(browserById.has(value["@id"]) || /^https?:\/\//.test(value["@id"]), "Invalid browser entity reference: " + value["@id"]);
  Object.values(value).forEach(inspectBrowserValue);
};
inspectBrowserValue(browserNodes);
for (const node of browserNodes.filter((node) => ["ProfilePage", "Person", "MedicalClinic", "VideoObject"].some((type) => typeHas(node, type))))
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
const answerPaths = new Set(graph["@graph"].filter((node) => typeHas(node, "Answer"))
  .map((node) => new URL(node["@id"]).pathname));
const indexablePaths = paths.filter((route) => !answerPaths.has(route));
assert.deepEqual(sitemapLocs, [lifecycle.canonicalUrl, ...indexablePaths.map((route) => new URL(route, lifecycle.canonicalUrl).href)],
  "Sitemap must publish only indexable focused paths");
const pageNode = graph["@graph"].find((node) => node["@id"] === page.pageMicrodata.itemId);
assert(sitemap.includes("<lastmod>" + pageNode.dateModified + "</lastmod>"), "Sitemap revision must be authored");
for (const match of sitemap.matchAll(/<(?:image:loc|video:thumbnail_loc|video:content_loc)>([^<]+)<\/(?:image:loc|video:thumbnail_loc|video:content_loc)>/g)) {
  const url = new URL(xmlValue(match[1]));
  assert.equal(url.origin, localOrigin, "Sitemap media must use the canonical origin");
  assert((await stat(path.join(dist, url.pathname.slice(1))).catch(() => null))?.isFile(),
    "Missing sitemap media: " + url.href);
}
const browserVideos = browserNodes.filter((node) => typeHas(node, "VideoObject"));
assert.equal(browserVideos.length, graph["@graph"].filter((node) => [node["@type"]].flat().includes("VideoObject")).length);
const visibleVideos = elements.filter((node) => node.tagName === "video");
assert.equal(browserVideos.length, visibleVideos.length, "Each visible video needs one complete discovery object");
const matchedVideos = new Set();
for (const video of browserVideos) {
  const escapeXml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  assert(sitemap.includes("<video:content_loc>" + escapeXml(video.contentUrl) + "</video:content_loc>"),
    "Browser video and sitemap must agree");
  const visible = visibleVideos.find((node) => node.childNodes.some((child) =>
    child.tagName === "source" && new URL(attr(child, "src"), lifecycle.canonicalUrl).href === video.contentUrl));
  assert(visible, "VideoObject has no matching visible player: " + video["@id"]);
  const thumbnail = [video.thumbnailUrl].flat()[0];
  assert.equal(new URL(attr(visible, "data-poster"), lifecycle.canonicalUrl).href, thumbnail,
    "VideoObject thumbnail differs from its visible player");
  matchedVideos.add(visible);
}
assert.equal(matchedVideos.size, visibleVideos.length, "Duplicate or missing VideoObject for a visible player");

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

const execBodies = (source) => [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter((match) => !/type=["']application\/ld\+json/.test(match[1])).map((match) => match[2]);
const sharedExec = new Set(execBodies(html));
const sharedStyles = new Set([...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]));
const records = JSON.parse(await readFile(path.join(root, ".generated/independent-pages.json"), "utf8"));
assert.deepEqual(records.map((record) => record.path), paths);
const pageIds = new Set();
const knownPaths = new Set(records.map((record) => record.path));
const nativeTargets = (nodes) => [...new Set(nodes.filter((node) => node.tagName === "a").map((node) => {
  const href = attr(node, "href"); if (!href) return undefined;
  const url = new URL(href, lifecycle.canonicalUrl);
  return url.origin === localOrigin && !url.hash && knownPaths.has(url.pathname) ? url.pathname : undefined;
}).filter(Boolean))];
const linkGraph = new Map([["/", nativeTargets(elements)]]);
let overviewPages = 0, contextualTitles = 0, nativePosters = 0;
const scopeTexts = new Map();
let translatedPages = 0, topicalPages = 0;
const homeArticle = elements.find((node) => node.tagName === "article" && (attr(node, "class") || "").split(/\s+/).includes("medical-guide"));
assert.equal(attr(homeArticle, "lang"), page.lang, "Complete guide needs its own language");
assert.equal(attr(homeArticle, "dir"), page.dir, "Complete guide needs its own direction");
const homeBody = elements.find((node) => node.tagName === "body");
assert.equal(attr(homeBody, "lang"), page.lang, "Shared UI needs its authored language");
assert.equal(attr(homeBody, "dir"), page.dir, "Shared UI needs its authored direction");
assert(!elements.some((node) => node.tagName === "link" && attr(node, "hreflang")), "Homepage must not claim unrelated translations");
const sitemapHtml = await readFile(path.join(dist, "sitemap.xml"), "utf8");
for (const record of records) {
  const source = await readFile(path.join(dist, record.file), "utf8");
  const scoped = assertDocumentContract(source), scopedIds = new Set(scoped.ids);
  const canonicals = scoped.elements.filter((node) => node.tagName === "link" && attr(node, "rel") === "canonical");
  assert.equal(canonicals.length, 1);
  assert.equal(attr(canonicals[0], "href"), record.canonicalUrl, "Independent self canonical");
  const actualAlternates = scoped.elements.filter((node) => node.tagName === "link" && attr(node, "rel") === "alternate" && attr(node, "hreflang"))
    .map((node) => ({ href: attr(node, "href"), hrefLang: attr(node, "hreflang") }));
  assert.deepEqual(actualAlternates, record.alternates || [], "Route language alternates must match validated authored translations");
  if (actualAlternates.length) translatedPages++;
  const routeArticle = scoped.elements.find((node) => node.tagName === "article" && (attr(node, "class") || "").split(/\s+/).includes("medical-guide"));
  assert.equal(attr(routeArticle, "lang"), record.lang, "Focused article language");
  assert.equal(attr(routeArticle, "dir"), record.dir, "Focused article direction");
  const routeBody = scoped.elements.find((node) => node.tagName === "body");
  assert.equal(attr(routeBody, "lang"), page.lang, "Shared UI language must not inherit route language");
  assert.equal(attr(routeBody, "dir"), page.dir, "Shared UI direction must not inherit route direction");
  const localeMeta = scoped.elements.find((node) => node.tagName === "meta" && attr(node, "property") === "og:locale");
  if (localeMeta) assert(/^[a-z]{2}_[A-Z]{2}$/.test(attr(localeMeta, "content")), "Open Graph locale must use ISO 639-1");
  const robots = scoped.elements.find((node) => attr(node, "name") === "robots");
  assert(robots, "Every focused page needs an explicit robots policy");
  if (record.indexable === false) assert(/\bnoindex\b/.test(attr(robots, "content")), "Answer-only route must be noindex");
  else assert(!/\bnoindex\b/.test(attr(robots, "content")), "Indexable route must not be noindex");
  assert(scopedIds.has(record.htmlId), "Focused initial content lost destination: " + record.path);
  assert(source.includes('data-route-view="focused"'), "Direct entry must retain its focused view");
  assert(record.navigation, "Every route needs authored navigation");
  linkGraph.set(record.path, nativeTargets(scoped.elements));
  if (record.scopeKind === "overview") overviewPages++;
  if (record.metadataContext) contextualTitles++;
  nativePosters += scoped.elements.filter((node) => node.tagName === "video" && attr(node, "poster")).length;
  const routeContext = scoped.elements.find((node) => attr(node, "data-route-context") !== undefined);
  assert(routeContext?.sourceCodeLocation && routeArticle?.sourceCodeLocation?.endTag,
    "Focused scope needs its authored article and context boundaries");
  const scopeHtml = source.slice(routeContext.sourceCodeLocation.endOffset,
    routeArticle.sourceCodeLocation.endTag.startOffset);
  const scopeText = scopeHtml.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!scopeTexts.has(scopeText)) scopeTexts.set(scopeText, []);
  scopeTexts.get(scopeText).push(record.path);
  assert(scoped.elements.some((node) => attr(node, "data-guide-expand") !== undefined), "Direct entry needs an explicit complete-guide control");
  const documents = scoped.elements.filter((node) => node.tagName === "script" && attr(node, "type") === "application/ld+json")
    .map((node) => JSON.parse(node.childNodes.map((child) => child.value || "").join("")));
  assert.equal(documents.length, 1);
  const pageId = record.canonicalUrl + "#webpage";
  assertRichResultsDocument(documents[0], { primaryPageId: pageId });
  assert(!pageIds.has(pageId)); pageIds.add(pageId);
  const pageGraph = new Map(documents[0]["@graph"].map((node) => [node["@id"], node]));
  const pageEntity = pageGraph.get(pageId), refs = [pageEntity.mainEntity].flat();
  assert.equal(pageEntity.url, record.canonicalUrl);
  const breadcrumb = pageGraph.get(pageEntity.breadcrumb["@id"]);
  assert.deepEqual(breadcrumb.itemListElement, deriveTopicBreadcrumbItems(record, records,
    { canonicalUrl: lifecycle.canonicalUrl, homeTitle: breadcrumb.itemListElement[0].name }), "Authored topic breadcrumb lineage");
  const aboutIds = [pageEntity.about].flat().map((ref) => ref?.["@id"]).filter(Boolean);
  assert(aboutIds.includes(primaryProfile.mainEntity["@id"]), "Every topic must retain its fixed physician about relation");
  if (aboutIds.some((id) => id !== primaryProfile.mainEntity["@id"])) topicalPages++;
  assert(refs.some((ref) => ref["@id"] === record.entityId), "Route mainEntity mismatch");
  assert(pageGraph.get(record.entityId)?.["@type"], "Route mainEntity must retain its type");
  const scopedAuthor = pageGraph.get(primaryProfile.mainEntity["@id"]);
  assert.equal(scopedAuthor.url, lifecycle.canonicalUrl, "Doctor homepage URL must remain central");
  assert.deepEqual(scopedAuthor.mainEntityOfPage, { "@id": primaryProfile["@id"] }, "Doctor main profile must remain the homepage");
  const homeAuthor = browserById.get(primaryProfile.mainEntity["@id"]);
  for (const property of ["sameAs", "hasCredential", "memberOf", "identifier"])
    assert.deepEqual(scopedAuthor[property], homeAuthor[property], "Doctor identity/qualification drift: " + property);
  for (const ref of [...scopedAuthor.hasCredential, ...scopedAuthor.identifier, scopedAuthor.worksFor, scopedAuthor.alumniOf])
    assert(pageGraph.get(ref["@id"])?.["@type"], "Doctor qualification or identity needs its authored typed node");
  assert([pageEntity.isPartOf].flat().some((ref) => ref["@id"] === primaryProfile["@id"]), "Topic must relate to the comprehensive homepage");
  for (const body of execBodies(source)) assert(sharedExec.has(body), "New unapproved executable script in scoped page");
  for (const match of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    assert(sharedStyles.has(match[1]), "New unapproved style in scoped page");
  for (const node of scoped.elements) for (const name of ["href", "src", "data-poster"]) {
    const value = attr(node, name); if (!value) continue;
    const url = new URL(value, lifecycle.canonicalUrl);
    if (url.origin !== localOrigin || url.pathname === "/" || redirectSources.has(url.pathname)) continue;
    assert((await stat(path.join(dist, deployedFileForPath(url.pathname))).catch(() => null))?.isFile(), "Broken scoped resource: " + value);
  }
}
const reachable = new Set(["/"]), queue = ["/"];
let maximumDepth = 0;
const depths = new Map([["/", 0]]);
while (queue.length) {
  const current = queue.shift();
  for (const next of linkGraph.get(current) || []) if (!reachable.has(next)) {
    reachable.add(next); depths.set(next, depths.get(current) + 1); queue.push(next);
    maximumDepth = Math.max(maximumDepth, depths.get(next));
  }
}
assert.equal(reachable.size - 1, records.length, "Every sitemap topic must be reachable through actual native HTML links from home");
const duplicateScopes = [...scopeTexts.values()].filter((paths) => paths.length > 1);
const indexableTitleGroups = new Map();
for (const record of records.filter((entry) => entry.indexable !== false)) {
  if (!indexableTitleGroups.has(record.documentTitle)) indexableTitleGroups.set(record.documentTitle, []);
  indexableTitleGroups.get(record.documentTitle).push(record.path);
}
const duplicateIndexableTitles = [...indexableTitleGroups.values()].filter((paths) => paths.length > 1);
assert.deepEqual(duplicateIndexableTitles, [], "Indexable focused pages need distinct document titles");
console.log(JSON.stringify({ topicDiscoveryValidation: "PASS", reachableTopics: reachable.size - 1, maximumDepth, overviewPages, contextualTitles, nativePosters, duplicateScopes, duplicateIndexableTitles }));
const translationMembers = (page.discovery?.translationGroups || []).flatMap((group) => group.members);
assert.equal(translatedPages, translationMembers.length, "Every authored translation member must be rendered once");
assert.equal([...sitemapHtml.matchAll(/<xhtml:link\b/g)].length, records.filter((record) => record.indexable !== false)
  .reduce((total, record) => total + (record.alternates?.length || 0), 0),
  "Sitemap must publish every reciprocal language alternate");
console.log(JSON.stringify({ independentPageValidation: "PASS", pages: records.length, sharedSinglePageRuntime: true, translatedPages, topicalPages }));

console.log(JSON.stringify({ canonicalOutputValidation: "PASS", release: lifecycle.release, answers: answerValidation.answers, contentRoutes: paths.length, metadataRoutes: metadataRoutes.length, resources: MACHINE_RESOURCES.length, assessments: evidenceRegistry.evidence.length }));
