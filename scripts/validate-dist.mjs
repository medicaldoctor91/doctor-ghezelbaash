import assert from "node:assert/strict";
import { deriveTopicBreadcrumbItems } from "./lib/topic-navigation.mjs";
import { assertRichResultsDocument } from "../src/lib/rich-results-contract.mjs";
import { canonicalContentHtmlId, exactLanguageLiteral } from "../src/lib/graph-core.mjs";
import { routeDocumentFile } from "./lib/independent-pages.mjs";
import { canonicalMetadataAliasRows, canonicalHostAliasRows, loadAliasRegistry, machineNamespaceAliasRows, renderStaticRewrites } from "./lib/redirect-registry.mjs";
import { readerRouteAliases } from "./lib/reader-route-aliases.mjs";
import { URL_ARCHITECTURE, canonicalPaths, assertHtmlTargets, fragmentRows, redirectRows, resolveContentUrl, urlForHtmlId } from "../src/lib/url-architecture.mjs";
import { dateValue, temporalValue } from "../src/lib/graph-dates.mjs";
import { browserContextFor } from "../src/lib/page-discovery-jsonld.mjs";
import { assertSingleHopDelivery, assertFinalNativeUrl, assertPublishedFragment, assertPhysicalHtmlSurface } from "./lib/delivery-validation.mjs";
import { deriveCanonicalAnswerProjection, validateProjectedAnswerHtml } from "../src/lib/answer-projection.mjs";
import { readFile, stat, readdir } from "node:fs/promises";
import path from "node:path";
import { readCanonicalInputs } from "../src/lib/canonical-inputs.mjs";
import { documentPolicy, headValues, guideSearch, intentTargets, socialAlternateLocales, discoveryPolicy } from "../src/config/site-policy.mjs";
import { MACHINE_RESOURCES } from "../src/lib/resources.mjs";
import { assertCloudflareHeadersContract } from "./lib/headers-template.mjs";
import { assertDocumentContract, inspectHtml } from "./lib/html-contract.mjs";
import { inspectSchemaInventoryScope, serializeSchemaInventoryCsv, validateSchemaInventoryCoverage, validateSchemaInventoryRow } from "./lib/schema-inventory.mjs";
import { guideSourceSignature } from "./lib/reader-scope.mjs";
import { assertCanonicalDocumentCoverage, assertCanonicalDocumentProjection } from "../src/lib/canonical-document-contract.mjs";

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] ?? "dist");
const { graph, lifecycle, evidenceRegistry } = readCanonicalInputs(root);
const html = await readFile(path.join(dist, "index.html"), "utf8");
assert(!/{{[A-Z][A-Z0-9_]*}}/.test(html), "Unresolved authored token in HTML");
const { elements, ids } = assertDocumentContract(html);
const attr = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const textContent = (node) => node.nodeName === "#text" ? node.value || ""
  : ["script", "style", "template"].includes(node.tagName) ? ""
    : (node.childNodes || []).map(textContent).join(" ");
const normalizedText = (node) => textContent(node).normalize("NFC").replace(/\s+/gu, " ").trim();
const homeArticle = elements.find((node) => node.tagName === "article" && (attr(node, "class") || "").split(/\s+/).includes("medical-guide"));
assert(homeArticle?.sourceCodeLocation?.startTag && homeArticle.sourceCodeLocation.endTag, "Authored article boundaries must be explicit");
const articleHtml = html.slice(homeArticle.sourceCodeLocation.startTag.endOffset, homeArticle.sourceCodeLocation.endTag.startOffset);
const authoredArticle = inspectHtml(articleHtml, { wrapMain: true });
assertHtmlTargets(authoredArticle.ids);
for (const retired of URL_ARCHITECTURE.retiredPaths)
  assert(!authoredArticle.ids.includes(retired.slice(1)), "Retired editorial block remains in the authored article: " + retired);
for (const heading of authoredArticle.headings)
  assert(normalizedText(heading), "Authored heading must have visible text: " + attr(heading, "id"));
const namedMeta = new Map(elements.filter((node) => node.tagName === "meta")
  .map((node) => [attr(node, "name"), attr(node, "content")]));
const readerSourceSignature = guideSourceSignature(homeArticle);
assert.equal(namedMeta.get("guide-source-signature"), readerSourceSignature, "Shared reader signature must describe the actual home article");
const homeCanonicals = elements.filter((node) => node.tagName === "link" && attr(node, "rel") === "canonical");
assert.equal(homeCanonicals.length, 1, "Homepage must have one self canonical");
assert.equal(attr(homeCanonicals[0], "href"), lifecycle.canonicalUrl);
for (const [name, value] of Object.entries(headValues))
  assert.equal(namedMeta.get(name), value, `Canonical head value: ${name}`);
assert.equal(namedMeta.get("x-build-release"), lifecycle.release);

const search = elements.find((node) => attr(node, "id") === "guide-search");
assert.deepEqual(JSON.parse(attr(search, "data-copy")), guideSearch);
const targets = JSON.parse(attr(search, "data-intent-targets"));
const intentHeadings = JSON.parse(attr(search, "data-intent-headings"));
for (const [intent, url] of Object.entries(intentTargets)) {
  const headingId = canonicalContentHtmlId(url, lifecycle.canonicalUrl);
  assert.equal(targets[intent], url);
  assert(ids.includes(headingId), `Missing search destination: ${intent}`);
  assert.equal(intentHeadings[intent], headingId);
  assert(elements.some((node) => /^h[1-5]$/.test(node.tagName) && attr(node, 'id') === headingId), `Missing canonical intent heading: ${intent}`);
}

const canonicalSurface = canonicalPaths();
const paths = canonicalSurface.filter((route) => route !== "/");
assert.equal(canonicalSurface.length, 72, "Reviewed canonical corpus size drift");
assert.equal(assertCanonicalDocumentCoverage(graph).length, canonicalSurface.length,
  "Canonical source graph must define every published document");
const htmlFiles = [];
const collectHtmlFiles = async (directory, prefix = "") => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) await collectHtmlFiles(path.join(directory, entry.name), relative + "/");
    else if (entry.isFile() && relative.endsWith(".html")) htmlFiles.push(relative);
  }
};
await collectHtmlFiles(dist);
assertPhysicalHtmlSurface(htmlFiles, canonicalSurface);
const answerProjection = deriveCanonicalAnswerProjection(graph, lifecycle);
const answerAliases = answerProjection.answers.map((record) => ({
  source: "/" + record.htmlId,
  target: urlForHtmlId(record.htmlId),
  statusCode: 301,
}));
const redirects = (await readFile(path.join(dist, "_redirects"), "utf8")).trim().split(/\r?\n/);
const rewriteRows = redirects.map((line) => {
  const [source, target, statusCode] = line.split(/\s+/);
  return { source, target, statusCode: Number(statusCode) };
});
renderStaticRewrites(rewriteRows);
assertSingleHopDelivery(rewriteRows, lifecycle.canonicalUrl);
const cleanRouteFiles = new Map(paths.map((route) => [route, routeDocumentFile(route)]));
const deployedFileForPath = (pathname) => pathname === "/"
  ? "index.html"
  : cleanRouteFiles.get(pathname) ?? pathname.slice(1);
const documentCache = new Map([["/", { html, elements, ids: new Set(ids) }]]);
const publishedDocument = async (pathname) => {
  assert(canonicalSurface.includes(pathname), "Fragment target is not a canonical HTML resource: " + pathname);
  if (!documentCache.has(pathname)) {
    const source = await readFile(path.join(dist, deployedFileForPath(pathname)), "utf8");
    const inspected = assertDocumentContract(source);
    documentCache.set(pathname, { html: source, elements: inspected.elements, ids: new Set(inspected.ids), inspected });
  }
  return documentCache.get(pathname);
};
for (const { source, target, statusCode } of rewriteRows) {
  assert([200, 301, 308].includes(statusCode), `Unsupported delivery rule: ${source} ${statusCode}`);
  if (statusCode !== 200) assert.notEqual(source, target, `Permanent redirect must change URL: ${source}`);
  const destination = new URL(target, lifecycle.canonicalUrl);
  assert((await stat(path.join(dist, deployedFileForPath(destination.pathname))).catch(() => null))?.isFile(),
    `Redirect/rewrite must resolve to a deployed file: ${source} -> ${target}`);
  if (destination.hash) assertPublishedFragment(destination, (await publishedDocument(destination.pathname)).ids,
    `Redirect ${source} -> ${target}`);
}
const legacyAliases = canonicalHostAliasRows(await loadAliasRegistry(root));
const machinePaths = new Set(MACHINE_RESOURCES.filter((item) => item.materialize).map((item) => "/" + item.path));
const expectedAliases = readerRouteAliases(legacyAliases, machinePaths);
assert.deepEqual(JSON.parse(attr(search, "data-content-route-aliases")), { ...expectedAliases });
for (const target of Object.values(expectedAliases)) {
  const destination = new URL(target, lifecycle.canonicalUrl);
  assert(canonicalSurface.includes(destination.pathname), `Missing reader content owner: ${target}`);
  assertPublishedFragment(destination, (await publishedDocument(destination.pathname)).ids, `Reader alias ${target}`);
}
for (const { source, target, statusCode } of legacyAliases)
  assert(redirects.includes(`${source} ${target} ${statusCode}`),
    statusCode === 200 ? `Missing machine graph rewrite: ${source}` : `Missing permanent legacy redirect: ${source}`);
for (const { source, target } of answerAliases)
  assert(redirects.includes(`${source} ${target} 301`),
    `Missing canonical answer redirect: ${source}`);
for (const route of paths) {
  assert(!rewriteRows.some((row) => row.source === route),
    `Clean content route must not be rewritten through its .html file: ${route}`);
  assert((await stat(path.join(dist, routeDocumentFile(route))).catch(() => null))?.isFile(),
    `Missing independent content document: ${route}`);
}
const corpusAliases = redirectRows();
assert.equal(corpusAliases.length, URL_ARCHITECTURE.decisions.filter((row) => row.decision === "301_REDIRECT").length,
  "Every historical corpus path must redirect to its final canonical owner");
for (const { source, target, statusCode } of corpusAliases)
  assert(redirects.includes(`${source} ${target} ${statusCode}`), `Missing consolidated corpus redirect: ${source}`);
const fragmentAliases = fragmentRows();
for (const { source, target } of fragmentAliases) {
  assert(rewriteRows.some((row) => row.source === source && row.statusCode === 301),
    `Historical authored path must have its permanent HTTP redirect: ${source}`);
  const destination = new URL(target, lifecycle.canonicalUrl);
  assert.equal(destination.pathname, "/", `Authored browser navigation must retain its root fragment: ${source}`);
  assert(canonicalSurface.includes(destination.pathname), `Missing canonical fragment owner: ${target}`);
  assertPublishedFragment(destination, (await publishedDocument(destination.pathname)).ids,
    `Authored fragment alias ${source} -> ${target}`);
}
const registeredSources = new Set([...legacyAliases, ...answerAliases, ...corpusAliases].map((row) => row.source));
const metadataRoutes = canonicalMetadataAliasRows(graph, lifecycle.canonicalUrl)
  .filter(({ source }) => !paths.includes(source) && !registeredSources.has(source));
for (const { source, target, statusCode } of metadataRoutes)
  assert(redirects.includes(`${source} ${target} ${statusCode}`), `Missing metadata description: ${source}`);
const namespaceAliases = machineNamespaceAliasRows();
assert.equal(namespaceAliases.length, 5, "Only the reviewed machine namespaces may use wildcards");
assert.deepEqual(rewriteRows.filter((row) => row.source.includes("*")), namespaceAliases, "Machine namespace wildcard scope drift");
assert.equal(await readFile(path.join(dist, "_redirects"), "utf8"), renderStaticRewrites([
  ...legacyAliases, ...answerAliases, ...corpusAliases, ...metadataRoutes, ...namespaceAliases,
]), "Delivery rules must equal the complete reviewed one-hop registry");

const deliveryHeaders = await readFile(path.join(dist, "_headers"), "utf8");
assertCloudflareHeadersContract(deliveryHeaders);
for (const { source, target } of [
  ...namespaceAliases,
  ...["/website", "/medical-specialty-aesthetic-medicine"].map((source) => ({ source, target: "/graph.jsonld" })),
  ...legacyAliases.filter((row) => row.target === "/graph.jsonld"),
]) {
  const block = deliveryHeaders.split(/\n\n/).find((block) => block.startsWith(source + "\n"));
  assert(block?.includes("Content-Type: application/ld+json"), `Missing graph MIME: ${source}`);
  assert(block?.includes("Access-Control-Allow-Origin: *"), `Missing graph CORS: ${source}`);
  assert(block?.includes('<' + new URL(target, lifecycle.canonicalUrl).href + '>; rel="canonical"'),
    `Missing representation canonical: ${source}`);
}

// Check actual published links and media URLs, including chapter parameters.
// Canonical RDF identities are validated separately from browser resources.
const localOrigin = new URL(lifecycle.canonicalUrl).origin;
const authoredById = new Map(graph["@graph"].map((node) => [node["@id"], node]));
const authoredPhysician = authoredById.get(lifecycle.primaryEntity.id);
const homeProfileMeta = elements.filter((node) => node.tagName === "meta" && attr(node, "property")?.startsWith("profile:"));
assert.deepEqual(homeProfileMeta.map((node) => [attr(node, "property"), attr(node, "content")]).sort(), [
  ["profile:first_name", exactLanguageLiteral(authoredPhysician.givenName, "fa", "Canonical physician given name")],
  ["profile:last_name", exactLanguageLiteral(authoredPhysician.familyName, "fa", "Canonical physician family name")],
].sort(), "Homepage profile metadata must contain only the graph's actual physician names");
const homeOgTypes = elements.filter((node) => node.tagName === "meta" && attr(node, "property") === "og:type");
assert.equal(homeOgTypes.length, 1, "Homepage must have one Open Graph type");
assert.equal(attr(homeOgTypes[0], "content"), "profile", "Homepage must advertise its primary physician profile");
const identityProperties = new Set(["about", "creator", "publisher", "author", "provider", "mainEntity", "mainEntityOfPage", "sameAs", "gender", "knowsAbout", "medicalSpecialty", "isPartOf", "subjectOf", "identifier"]);
const validatePublishedTargets = async (nodes, pageUrl) => {
  for (const node of nodes) {
    const itemId = attr(node, "itemid");
    if (itemId && new URL(itemId, pageUrl).origin === localOrigin)
      assert(authoredById.has(itemId), "Microdata identity is absent from the canonical graph: " + itemId);
    for (const name of ["href", "src", "poster", "data-poster"]) {
      const value = attr(node, name);
      if (!value) continue;
      const url = new URL(value, pageUrl);
      if (url.origin !== localOrigin) continue;
      // A typed RDF relation identifies a subject, rather than a browser page.
      // Keep those stable entity IRIs distinct from the finite HTML route surface.
      const identityRelation = name === "href" && node.tagName === "link" &&
        (identityProperties.has(attr(node, "itemprop")) ||
          /(?:^|\s)(?:author|about)(?:\s|$)/.test(attr(node, "rel") || ""));
      if (identityRelation) {
        assert(authoredById.has(url.href), "Local RDF relation lacks its canonical entity: " + value);
        continue;
      }
      if (name === "href" && node.tagName === "a") assertFinalNativeUrl(value, pageUrl, {
        rows: rewriteRows, canonicalOrigin: localOrigin, resolveContentUrl,
        // The skip link intentionally focuses the current document's shared main
        // landmark; it does not name the homepage's authored article subject.
        localUiFragment: value === "#main-content",
      });
      assert((await stat(path.join(dist, deployedFileForPath(url.pathname))).catch(() => null))?.isFile(),
        `Missing published resource on ${pageUrl}: ${value}`);
      if (url.hash) assertPublishedFragment(url, (await publishedDocument(url.pathname)).ids,
        `Link on ${pageUrl}: ${value}`);
    }
    const srcset = attr(node, "srcset");
    if (srcset) for (const candidate of srcset.split(",")) {
      const value = candidate.trim().split(/\s+/)[0], url = new URL(value, pageUrl);
      if (url.origin === localOrigin) assert((await stat(path.join(dist, deployedFileForPath(url.pathname))).catch(() => null))?.isFile(),
        `Missing responsive media on ${pageUrl}: ${value}`);
    }
  }
};
await validatePublishedTargets(elements, lifecycle.canonicalUrl);
const answerValidation = validateProjectedAnswerHtml(html, answerProjection);

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
const typeHas = (node, type) => [node?.["@type"]].flat().includes(type);
const profileNodes = browserNodes.filter((node) => typeHas(node, "ProfilePage"));
const primaryPage = browserById.get(lifecycle.canonicalUrl + "webpage");
assert(typeHas(primaryPage, "MedicalWebPage"));
assert(typeHas(primaryPage, "ProfilePage"), "Homepage must own the physician profile");
assert.equal(profileNodes.length, 1, "Homepage projection must expose only its own ProfilePage candidate");
assert.equal(profileNodes[0]["@id"], primaryPage["@id"]);
const primaryPerson = browserById.get(primaryPage.mainEntity["@id"]);
assert(typeHas(primaryPerson, "Person"));
assert.equal(primaryPerson["@id"], lifecycle.primaryEntity.id, "Physician entity IRI must remain stable");
assert.equal(primaryPerson["@id"], lifecycle.canonicalUrl + "saeed-ghezelbash");
assert.equal(primaryPerson.url, lifecycle.canonicalUrl);
assert.deepEqual(primaryPerson.mainEntityOfPage, { "@id": primaryPage["@id"] });
assert.deepEqual(ldDocuments[0]["@context"], browserContextFor(graph), "Browser context must retain canonical source term namespaces");
assert(browserNodes.length < graph["@graph"].length, "Homepage search projection must be narrower than the canonical graph");
for (const published of browserNodes) {
  const authored = authoredById.get(published["@id"]);
  if (!authored) {
    assert.equal(published["@id"], lifecycle.canonicalUrl + "#questions", "Unexpected generated browser node");
    continue;
  }
  assert.deepEqual([published["@type"]].flat(), [authored["@type"]].flat(), "Published entity type drift");
}
assert(!browserNodes.some((node) => typeHas(node, "ProfilePage") && node["@id"] !== primaryPage["@id"]), "Homepage projection exposes an unrelated ProfilePage");
assert(!browserNodes.some((node) => typeHas(node, "Review")), "Homepage projection exposes an unrelated Review candidate");
assert.deepEqual(primaryPage.hasPart, authoredById.get(primaryPage["@id"]).hasPart, "Homepage portfolio links must preserve compact authored references");
assert.deepEqual(values(primaryPage.hasPart).map((ref) => ref["@id"]).sort(),
  paths.map((route) => new URL(route, lifecycle.canonicalUrl).href + "#webpage").sort(), "Homepage portfolio references must equal the canonical focused corpus");
const courseInstanceIds = new Set(browserNodes.filter((node) => typeHas(node, "Course"))
  .flatMap((course) => [course.hasCourseInstance].flat().filter(Boolean))
  .map((ref) => typeof ref === "string" ? ref : ref["@id"]));
for (const event of browserNodes.filter((node) => typeHas(node, "Event") || typeHas(node, "EducationEvent")))
  assert(courseInstanceIds.has(event["@id"]) && typeHas(event, "CourseInstance") && typeHas(event, "EducationEvent"),
    "Homepage projection exposes an Event outside its authored Course instance: " + event["@id"]);
for (const id of courseInstanceIds) {
  const instance = browserById.get(id);
  assert(typeHas(instance, "CourseInstance") && typeHas(instance, "EducationEvent"), "Published Course instance must resolve: " + id);
}
assert(browserNodes.some((node) => typeHas(node, "FAQPage")), "Comprehensive home requires its visible FAQ coverage");
assert.equal(richResultCounts.incompleteCandidates.length, 0, "Known required candidate fields must be completed from authored/user facts");
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
assert.deepEqual(sitemapLocs, [lifecycle.canonicalUrl, ...paths.map((route) => new URL(route, lifecycle.canonicalUrl).href)], "Sitemap must cover every independently rendered canonical path");
for (const { source } of answerAliases)
  assert(!sitemapLocs.includes(new URL(source, lifecycle.canonicalUrl).href), "Answer redirect must not remain in the sitemap: " + source);
const pageNode = graph["@graph"].find((node) => node["@id"] === lifecycle.canonicalUrl + "webpage");
assert(sitemap.includes("<lastmod>" + dateValue(pageNode.dateModified) + "</lastmod>"), "Sitemap revision must be authored");
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
assert.equal(await readFile(path.join(dist, "llms.txt"), "utf8"), await readFile(path.join(root, "src/content-source/llms-guide.md"), "utf8"));
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
  .filter((match) => !/type=["']application\/(?:ld\+)?json["']/i.test(match[1])).map((match) => match[2]);
const sharedExec = new Set(execBodies(html));
const sharedStyles = new Set([...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]));
const records = JSON.parse(await readFile(path.join(root, ".generated/independent-pages.json"), "utf8"));
assert.deepEqual(records.map((record) => record.path), paths);
const schemaInventory = JSON.parse(await readFile(path.join(root, ".generated/schema-inventory.json"), "utf8"));
const schemaInventoryCoverage = validateSchemaInventoryCoverage(schemaInventory, {
  records, canonicalUrl: lifecycle.canonicalUrl,
});
assert.equal(await readFile(path.join(root, ".generated/schema-inventory.csv"), "utf8"),
  serializeSchemaInventoryCsv(schemaInventory), "Schema CSV must match the validated JSON inventory");
const schemaRowsByPath = new Map(schemaInventory.rows.map((row) => [row.path, row]));
validateSchemaInventoryRow(schemaRowsByPath.get("/"), {
  html, scoped: { elements, ids }, canonicalGraph: graph, canonicalUrl: lifecycle.canonicalUrl,
});
const pageIds = new Set();
const knownPaths = new Set(records.map((record) => record.path));
const nativeTargets = (nodes) => [...new Set(nodes.filter((node) => node.tagName === "a").map((node) => {
  const href = attr(node, "href"); if (!href) return undefined;
  const url = new URL(href, lifecycle.canonicalUrl);
  return url.origin === localOrigin && knownPaths.has(url.pathname) ? url.pathname : undefined;
}).filter(Boolean))];
const linkGraph = new Map([["/", nativeTargets(elements)]]);
let overviewPages = 0, contextualTitles = 0, nativePosters = 0;
const scopeTexts = new Map();
let translatedPages = 0, topicalPages = 0;
assert.equal(attr(homeArticle, "lang"), documentPolicy.lang, "Complete guide needs its own language");
assert.equal(attr(homeArticle, "dir"), documentPolicy.dir, "Complete guide needs its own direction");
const homeBody = elements.find((node) => node.tagName === "body");
assert.equal(attr(homeBody, "lang"), documentPolicy.lang, "Shared UI needs its authored language");
assert.equal(attr(homeBody, "dir"), documentPolicy.dir, "Shared UI needs its authored direction");
assert(!elements.some((node) => node.tagName === "link" && attr(node, "hreflang")), "Homepage must not claim unrelated translations");
assert(!elements.some((node) => node.tagName === "meta" && attr(node, "property") === "og:locale:alternate"),
  "Multilingual sections do not make the complete homepage available as translated equivalents");
const declaredSocialLocales = [documentPolicy.lang.replace("-", "_"), ...socialAlternateLocales];
const socialLocale = (language) => {
  const normalized = language.replace(/^ckb(?=-|$)/, "ku");
  return /^[a-z]{2}-[A-Z]{2}$/.test(normalized) ? normalized.replace("-", "_")
    : declaredSocialLocales.find((locale) => locale.startsWith(normalized.split("-")[0] + "_"));
};
const sitemapHtml = await readFile(path.join(dist, "sitemap.xml"), "utf8");
const metadataOwners = { title: new Map(), description: new Map() };
const assertPageMetadata = (nodes, pathname, expected = {}) => {
  const titles = nodes.filter((node) => node.tagName === "title");
  const descriptions = nodes.filter((node) => node.tagName === "meta" && attr(node, "name") === "description");
  assert.equal(titles.length, 1, "One document title is required: " + pathname);
  assert.equal(descriptions.length, 1, "One document description is required: " + pathname);
  const metadata = { title: normalizedText(titles[0]), description: String(attr(descriptions[0], "content") || "").normalize("NFC").replace(/\s+/gu, " ").trim() };
  for (const [property, value] of Object.entries(metadata)) {
    assert(value, "Empty document " + property + ": " + pathname);
    if (expected[property] !== undefined) assert.equal(value, expected[property].normalize("NFC").replace(/\s+/gu, " ").trim(), "Generated " + property + " drift: " + pathname);
    assert(!metadataOwners[property].has(value), `Exact duplicate ${property} competes across URLs: ${metadataOwners[property].get(value)} and ${pathname}`);
    metadataOwners[property].set(value, pathname);
  }
};
assertPageMetadata(elements, "/");
const initialScopes = new Map([[inspectSchemaInventoryScope(html).textSha256, "/"]]);
for (const record of records) {
  assert.equal(record.file, routeDocumentFile(record.path), "Manifest physical document drift");
  assert.equal(record.canonicalUrl, new URL(record.path, lifecycle.canonicalUrl).href, "Manifest canonical URL drift");
  const published = await publishedDocument(record.path), source = published.html;
  const scoped = published.inspected, scopedIds = published.ids;
  assert(!scoped.elements.some((node) => node.tagName === "meta" && attr(node, "property")?.startsWith("profile:")),
    "Focused routes must not inherit physician ProfilePage Open Graph fields: " + record.path);
  const focusedOgTypes = scoped.elements.filter((node) => node.tagName === "meta" && attr(node, "property") === "og:type");
  assert.equal(focusedOgTypes.length, 1, "Focused route must have one Open Graph type: " + record.path);
  assert.equal(attr(focusedOgTypes[0], "content"), "article", "Focused route must advertise its own article context: " + record.path);
  assertPageMetadata(scoped.elements, record.path, { title: record.documentTitle, description: record.description });
  const initialScope = inspectSchemaInventoryScope(source, { scoped, focused: true });
  assert(initialScope.textLength > 0, "Canonical focused document has no authored initial content: " + record.path);
  assert(!initialScopes.has(initialScope.textSha256), "Exact duplicate authored scope competes across URLs: " + initialScopes.get(initialScope.textSha256) + " and " + record.path);
  initialScopes.set(initialScope.textSha256, record.path);
  if (initialScope.headings.length) assert.equal(initialScope.headings[0].level, 2, "Focused authored content must start below its document H1: " + record.path);
  validateSchemaInventoryRow(schemaRowsByPath.get(record.path), {
    record, html: source, scoped, canonicalGraph: graph, canonicalUrl: lifecycle.canonicalUrl,
  });
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
  assert.equal(attr(routeBody, "lang"), documentPolicy.lang, "Shared UI language must not inherit route language");
  assert.equal(attr(routeBody, "dir"), documentPolicy.dir, "Shared UI direction must not inherit route direction");
  const localeMeta = scoped.elements.find((node) => node.tagName === "meta" && attr(node, "property") === "og:locale");
  if (localeMeta) assert(/^[a-z]{2}_[A-Z]{2}$/.test(attr(localeMeta, "content")), "Open Graph locale must use ISO 639-1");
  const socialAlternates = scoped.elements.filter((node) => node.tagName === "meta" && attr(node, "property") === "og:locale:alternate")
    .map((node) => attr(node, "content"));
  const reviewedSocialAlternates = [...new Set(actualAlternates.map(({ hrefLang }) => socialLocale(hrefLang))
    .filter((locale) => locale && locale !== attr(localeMeta, "content")))];
  assert.deepEqual(socialAlternates, reviewedSocialAlternates,
    "Social locale alternates must describe only reviewed translations of this page");
  assert(scoped.elements.some((node) => attr(node, "name") === "robots" && !/\bnoindex\b/.test(attr(node, "content"))));
  assert(scopedIds.has(record.htmlId), "Focused initial content lost destination: " + record.path);
  assert(source.includes('data-route-view="focused"'), "Direct entry must retain its focused view");
  const readerMetadata = scoped.elements.filter((node) => node.tagName === "script" && attr(node, "id") === "guide-reader-scope");
  assert.equal(readerMetadata.length, 1, "Focused page needs one compiled primary-content boundary");
  assert.equal(attr(readerMetadata[0], "type"), "application/json", "Reader boundary must remain inert data");
  const readerScope = JSON.parse(readerMetadata[0].childNodes.map((node) => node.value || "").join(""));
  assert.deepEqual(readerScope, record.readerScope, "Published reader boundary must match its compiled canonical scope");
  assert.equal(readerScope.schemaVersion, 1);
  assert.equal(readerScope.sourceSignature, readerSourceSignature, "Focused scope must reference the published complete reader");
  assert.equal(attr(scoped.elements.find((node) => node.tagName === "meta" && attr(node, "name") === "guide-source-signature"), "content"), readerSourceSignature);
  assert(readerScope.ranges.length > 0, "Focused page must own substantive source intervals");
  for (const point of [readerScope.insertion, ...readerScope.ranges.flatMap(({ start, end }) => [start, end])]) {
    let node = homeArticle;
    assert(Array.isArray(point.path) && point.path.every((index) => Number.isInteger(index) && index >= 0), "Reader path must contain actual child-node indexes");
    for (const index of point.path) node = node?.childNodes?.[index];
    assert(node && Number.isInteger(point.offset) && point.offset >= 0 && point.offset <= (node.childNodes || []).length,
      "Reader boundary must resolve in the actual compiled source");
  }
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
  assert.deepEqual(documents[0]["@context"], browserContextFor(graph), "Focused context must retain canonical source term namespaces");
  const pageId = record.canonicalUrl + "#webpage";
  assertRichResultsDocument(documents[0], { primaryPageId: pageId });
  assert(!pageIds.has(pageId)); pageIds.add(pageId);
  const pageGraph = new Map(documents[0]["@graph"].map((node) => [node["@id"], node]));
  const pageEntity = pageGraph.get(pageId), refs = [pageEntity.mainEntity].flat();
  assertCanonicalDocumentProjection(graph, pageEntity);
  assert(!typeHas(pageEntity, "ProfilePage"), "Physician ProfilePage belongs only to the homepage");
  assert.equal(pageEntity.url, record.canonicalUrl);
  const mainEntity = pageGraph.get(record.entityId);
  assert.equal(typeHas(pageEntity, "FAQPage"), typeHas(mainEntity, "Question") && Boolean(mainEntity.acceptedAnswer),
    "Question pages must preserve their authored FAQ semantics");
  const visibleQuestionRecords = answerProjection.answers.filter((answer) => scopedIds.has(answer.sourceHtmlId) && scopedIds.has(answer.htmlId));
  const publishedQuestions = documents[0]["@graph"].filter((node) => typeHas(node, "Question"));
  assert.deepEqual(publishedQuestions.map((node) => node["@id"]).sort(), visibleQuestionRecords.map((answer) => answer.questionId).sort(),
    "Focused FAQ coverage must equal its actual visible Question/Answer scope: " + record.path);
  validateProjectedAnswerHtml(source, { ...answerProjection, answers: visibleQuestionRecords });
  for (const question of publishedQuestions) {
    const destination = new URL(question.url, lifecycle.canonicalUrl);
    assert(canonicalSurface.includes(destination.pathname), "Question URL has no canonical content owner: " + question["@id"]);
    assertPublishedFragment(destination, (await publishedDocument(destination.pathname)).ids, "Question URL: " + question.url);
    assert.equal(question.url, authoredById.get(question["@id"]).url, "Published Question URL drift");
  }
  if (visibleQuestionRecords.length && !typeHas(pageEntity, "FAQPage")) {
    const faq = pageGraph.get(record.canonicalUrl + "#questions");
    assert(typeHas(faq, "FAQPage"), "Contextual questions require their scoped FAQ subgraph: " + record.path);
    assert(values(pageEntity.hasPart).some((ref) => ref?.["@id"] === faq["@id"]), "Contextual FAQ subgraph must belong to its focused page");
    assert.deepEqual(values(faq.mainEntity).map((ref) => ref?.["@id"]).sort(), visibleQuestionRecords.map((answer) => answer.questionId).sort(),
      "Contextual FAQ references must equal its visible questions");
  }
  if (typeHas(pageEntity, "ProfilePage")) {
    const authoredProfile = authoredById.get(pageId);
    assert.deepEqual(pageEntity.primaryImageOfPage, authoredProfile.primaryImageOfPage,
      "Physician profile must retain its existing canonical portrait relation");
  }
  const breadcrumb = pageGraph.get(pageEntity.breadcrumb["@id"]);
  assert.deepEqual(breadcrumb.itemListElement, deriveTopicBreadcrumbItems(record, records,
    { canonicalUrl: lifecycle.canonicalUrl, homeTitle: breadcrumb.itemListElement[0].name }), "Authored topic breadcrumb lineage");
  const aboutIds = [pageEntity.about].flat().map((ref) => ref?.["@id"]).filter(Boolean);
  assert(aboutIds.includes(primaryPage.mainEntity["@id"]), "Every topic must retain its fixed physician about relation");
  if (aboutIds.some((id) => id !== primaryPage.mainEntity["@id"])) topicalPages++;
  assert(refs.some((ref) => ref["@id"] === record.entityId), "Route mainEntity mismatch");
  assert(pageGraph.get(record.entityId)?.["@type"], "Route mainEntity must retain its type");
  if (record.pageType !== "ProfilePage") assert.equal(pageEntity.dateModified, temporalValue(authoredById.get(primaryPage["@id"]).dateModified), "Focused revision must preserve its authored source date");
  const scopedAuthor = pageGraph.get(primaryPage.mainEntity["@id"]);
  assert.equal(scopedAuthor["@id"], lifecycle.primaryEntity.id, "Focused document must preserve the physician entity IRI");
  assert.equal(scopedAuthor.url, lifecycle.canonicalUrl, "Doctor URL must resolve to his primary homepage profile");
  assert.deepEqual(scopedAuthor.mainEntityOfPage, { "@id": primaryPage["@id"] },
    "Doctor mainEntityOfPage must resolve to the primary homepage ProfilePage");
  const homeAuthor = browserById.get(primaryPage.mainEntity["@id"]);
  for (const property of ["sameAs", "hasCredential", "memberOf", "identifier"])
    assert.deepEqual(scopedAuthor[property], homeAuthor[property], "Doctor identity/qualification drift: " + property);
  for (const ref of [...values(scopedAuthor.hasCredential), ...values(scopedAuthor.identifier), ...values(scopedAuthor.worksFor), ...values(scopedAuthor.alumniOf)])
    assert(pageGraph.get(ref["@id"])?.["@type"], "Doctor qualification or identity needs its authored typed node");
  assert([pageEntity.isPartOf].flat().some((ref) => ref["@id"] === primaryPage["@id"]), "Topic must relate to the comprehensive homepage");
  for (const body of execBodies(source)) assert(sharedExec.has(body), "New unapproved executable script in scoped page");
  for (const match of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    assert(sharedStyles.has(match[1]), "New unapproved style in scoped page");
  await validatePublishedTargets(scoped.elements, record.canonicalUrl);
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
assert.equal(duplicateScopes.length, 0, "Canonical focused pages must not publish exact duplicate prose scopes");
console.log(JSON.stringify({ topicDiscoveryValidation: "PASS", reachableTopics: reachable.size - 1, maximumDepth, overviewPages, contextualTitles, nativePosters, duplicateScopes }));
const translationMembers = (discoveryPolicy.translationGroups || []).flatMap((group) => group.members);
assert.equal(translatedPages, translationMembers.length, "Every authored translation member must be rendered once");
assert.equal([...sitemapHtml.matchAll(/<xhtml:link\b/g)].length, records.reduce((total, record) => total + (record.alternates?.length || 0), 0),
  "Sitemap must publish every reciprocal language alternate");
console.log(JSON.stringify({ independentPageValidation: "PASS", pages: records.length, sharedSinglePageRuntime: true, translatedPages, topicalPages }));
console.log(JSON.stringify({ schemaInventoryValidation: schemaInventoryCoverage }));

console.log(JSON.stringify({ canonicalOutputValidation: "PASS", release: lifecycle.release, answers: answerValidation.answers, contentRoutes: paths.length, metadataRoutes: metadataRoutes.length, resources: MACHINE_RESOURCES.length, assessments: evidenceRegistry.evidence.length }));
