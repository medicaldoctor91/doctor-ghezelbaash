import path from "node:path";
import { createHash } from "node:crypto";
import { brotliCompressSync } from "node:zlib";
import { readdir, readFile, stat } from "node:fs/promises";
import { parse } from "parse5";
import {
  CSS_LAYER_ORDER,
  assembleCssSource,
  deriveCssDelivery,
} from "../src/lib/css-delivery.mjs";
import {
  MACHINE_RESOURCES,
  resourcesForTarget,
} from "../src/lib/resources.mjs";
import {
  canonicalAnswerHtmlId,
  deriveCanonicalAnswerProjection,
  validateProjectedAnswerHtml,
} from "../src/lib/answer-projection.mjs";
import { assertDocumentContract, inspectHtml } from "./lib/html-contract.mjs";

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] || "dist");
const fail = (message) => {
  throw new Error(`DIST production contract: ${message}`);
};
const readText = async (relative) => readFile(path.join(dist, relative), "utf8");
const readJson = async (relative) => JSON.parse(await readText(relative));
const attr = (node, name) =>
  node?.attrs?.find((candidate) => candidate.name === name)?.value;
const classes = (node) =>
  new Set(String(attr(node, "class") || "").split(/\s+/u).filter(Boolean));
const hasAncestor = (node, tagName) => {
  for (let parent = node?.parentNode; parent; parent = parent.parentNode)
    if (parent.tagName === tagName) return true;
  return false;
};
const textContent = (node) =>
  node?.nodeName === "#text"
    ? node.value
    : (node?.childNodes || []).map(textContent).join("");
const descendants = (node, output = []) => {
  for (const child of node?.childNodes || []) {
    if (child.tagName) output.push(child);
    descendants(child, output);
  }
  return output;
};
const elements = (source) => {
  const output = [];
  const walk = (node) => {
    if (node.tagName) output.push(node);
    for (const child of node.childNodes || []) walk(child);
  };
  walk(parse(source, { sourceCodeLocationInfo: true }));
  return output;
};
const routeBlock = (headers, route) => {
  const marker = `\n${route}\n`;
  const start = headers.indexOf(marker);
  if (start < 0) fail(`missing _headers route ${route}`);
  const bodyStart = start + marker.length;
  const end = headers.indexOf("\n\n", bodyStart);
  return headers.slice(bodyStart, end < 0 ? headers.length : end);
};
const assetPath = (value) => {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  const relative = value.slice(1).split(/[?#]/u, 1)[0];
  if (!relative || relative.includes("..")) return null;
  return relative;
};
const numericAttr = (node, name) => {
  const value = Number(attr(node, name));
  return Number.isFinite(value) && value > 0 ? value : null;
};
const exactKeys = (value, expected, label) => {
  const actual = Object.keys(value || {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted))
    fail(`${label} fields are not canonical`);
};
const fileBytes = async (relative) => {
  const bytes = await readFile(path.join(dist, relative));
  return bytes.length;
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const release = JSON.parse(
  await readFile(path.join(root, "src/data/release.json"), "utf8"),
);
const invariants = JSON.parse(
  await readFile(path.join(root, "src/data/release-invariants.json"), "utf8"),
);
const sourceGraph = JSON.parse(
  await readFile(
    path.join(root, "src/data/semantic/knowledge-graph.jsonld"),
    "utf8",
  ),
);
const projection = deriveCanonicalAnswerProjection(sourceGraph, release);
const html = await readText("index.html");
const notFound = await readText("404.html");
const page = assertDocumentContract(html, { expectedContentSections: 15 });
const notFoundPage = inspectHtml(notFound);

if (!/^<!doctype html>/iu.test(html.trimStart())) fail("index.html lacks HTML5 doctype");
if (!/^<!doctype html>/iu.test(notFound.trimStart())) fail("404.html lacks HTML5 doctype");
if (page.mains.length !== 1 || page.guideArticles.length !== 1)
  fail("index.html must have exactly one main and canonical article");
for (const tag of ["header", "nav", "main", "footer", "aside"])
  if (!page.elements.some((node) => node.tagName === tag))
    fail(`index.html lacks ${tag} semantic element`);
if (!page.elements.some((node) => node.tagName === "header" && classes(node).has("entity-hero")))
  fail("canonical entity header is missing");
if (notFoundPage.mains.length !== 1 || notFoundPage.guideArticles.length !== 1)
  fail("404.html must have exactly one main and canonical article");
if (notFoundPage.headings.filter((node) => node.tagName === "h1").length !== 1)
  fail("404.html must have exactly one H1");
if (!notFoundPage.elements.some((node) => node.tagName === "nav"))
  fail("404.html lacks recovery navigation");
if (/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/iu.test(notFound))
  fail("404.html must not declare a canonical link");

const idSet = new Set(page.ids);
for (const node of page.elements) {
  for (const relation of ["aria-labelledby", "aria-describedby", "aria-controls"]) {
    const value = attr(node, relation);
    if (
      value &&
      value
        .split(/\s+/u)
        .filter(Boolean)
        .some((id) => !idSet.has(id))
    )
      fail(`${relation} points at a missing ID`);
  }
  if (attr(node, "aria-label") !== undefined && !attr(node, "aria-label")?.trim())
    fail("aria-label must not be empty");
  if (["main", "nav", "button", "dialog", "search"].includes(node.tagName)) {
    const role = attr(node, "role");
    if (role && role.toLowerCase() === node.tagName)
      fail(`redundant native role on ${node.tagName}`);
  }
  for (const attribute of node.attrs || [])
    if (/^on[a-z]/iu.test(attribute.name)) fail(`inline event handler found: ${attribute.name}`);
}
for (const button of page.elements.filter((node) => node.tagName === "button"))
  if (!/^(?:button|submit|reset)$/iu.test(attr(button, "type") || ""))
    fail("every button must declare an explicit valid type");
for (const node of page.elements.filter((candidate) => ["a", "button"].includes(candidate.tagName))) {
  const name = `${attr(node, "aria-label") || ""} ${attr(node, "title") || ""} ${textContent(node)}`
    .replace(/\s+/gu, " ")
    .trim();
  if (!name && attr(node, "aria-hidden") !== "true") fail(`unnamed ${node.tagName}`);
}
if (page.elements.filter((node) => node.tagName === "search").length !== 1)
  fail("native search landmark must be present exactly once");
if (page.elements.filter((node) => attr(node, "role") === "search").length)
  fail("search landmark must not use a redundant role=search");

const mainHeadings = page.elements.filter(
  (node) => /^h[1-6]$/u.test(node.tagName) && hasAncestor(node, "main"),
);
if (mainHeadings.filter((node) => node.tagName === "h1").length !== 1)
  fail("canonical main content must have exactly one H1");
if (mainHeadings[0]?.tagName !== "h1") fail("main heading hierarchy must start at H1");
for (let index = 0; index < mainHeadings.length; index++) {
  if (!textContent(mainHeadings[index]).trim()) fail("heading must not be empty");
  if (index === 0) continue;
  const previous = Number(mainHeadings[index - 1].tagName[1]);
  const current = Number(mainHeadings[index].tagName[1]);
  if (current > previous + 1)
    fail(`heading hierarchy jumps from H${previous} to H${current}`);
}
for (const section of page.elements.filter((node) => classes(node).has("content-section"))) {
  const label = attr(section, "aria-labelledby");
  if (!label) fail("content section lacks aria-labelledby");
  if (!page.ids.includes(label)) fail(`content section label target missing: ${label}`);
}

const dialog = page.elements.find((node) => node.tagName === "dialog");
const dialogLabel = dialog && attr(dialog, "aria-labelledby");
if (
  !dialog ||
  attr(dialog, "aria-modal") !== "true" ||
  !dialogLabel ||
  page.elements.filter((node) => attr(node, "id") === dialogLabel && /^h[1-6]$/u.test(node.tagName)).length !== 1
)
  fail("dialog label/modal contract drift");
const opener = page.elements.filter((node) => attr(node, "data-guide-search-open") !== undefined);
if (
  opener.length !== 1 ||
  opener[0].tagName !== "button" ||
  attr(opener[0], "type") !== "button" ||
  attr(opener[0], "aria-controls") !== "guide-search" ||
  attr(opener[0], "aria-haspopup") !== "dialog"
)
  fail("search opener must be a native labelled dialog button");
const searchInput = page.elements.find((node) => attr(node, "id") === "guide-search-input");
const inputLabel = page.elements.find(
  (node) => node.tagName === "label" && attr(node, "for") === "guide-search-input",
);
if (!searchInput || attr(searchInput, "type") !== "search" || !inputLabel)
  fail("search input must have a native label and type=search");

const images = page.elements.filter((node) => node.tagName === "img");
const pictures = page.elements.filter((node) => node.tagName === "picture");
if (!images.length || images.length !== pictures.length)
  fail("every image must be delivered through a picture element");
for (const image of images) {
  if (attr(image, "alt") === undefined || !attr(image, "alt")?.trim())
    fail("every image must have nonempty alt text");
  if (!numericAttr(image, "width") || !numericAttr(image, "height"))
    fail(`image dimensions missing: ${attr(image, "src")}`);
  const picture = image.parentNode?.tagName === "picture" ? image.parentNode : null;
  const sourceTypes = (picture?.childNodes || [])
    .filter((node) => node.tagName === "source")
    .map((node) => String(attr(node, "type") || "").toLowerCase());
  if (!picture || !sourceTypes.includes("image/avif") || !sourceTypes.includes("image/webp"))
    fail(`picture format fallback contract drift: ${attr(image, "src")}`);
  if (!assetPath(attr(image, "src"))) fail(`image fallback is not a safe local asset: ${attr(image, "src")}`);
}
if (attr(images[0], "fetchpriority") !== "high" || attr(images[0], "loading") !== "eager")
  fail("first image must be the prioritized eager LCP candidate");
if (images.slice(1).some((image) => attr(image, "loading") !== "lazy"))
  fail("non-LCP images must use loading=lazy");
if (images.filter((image) => attr(image, "fetchpriority") === "high").length !== 1)
  fail("exactly one image may have fetchpriority=high");

const [authoredCss, calibration] = await Promise.all([
  readFile(path.join(root, "src/styles/global.css"), "utf8"),
  readFile(path.join(root, "src/data/render-calibration.json"), "utf8"),
]);
const assembledCss = assembleCssSource(authoredCss, calibration);
const delivery = deriveCssDelivery(assembledCss.cssSource);
const cssBytes = Buffer.byteLength(delivery.externalCss);
const criticalBytes = Buffer.byteLength(delivery.criticalCss);
const cssBrotliBytes = brotliCompressSync(Buffer.from(delivery.externalCss)).length;
if (criticalBytes > invariants.maxCriticalCssBytes)
  fail(`critical CSS budget exceeded: ${criticalBytes}/${invariants.maxCriticalCssBytes}`);
if (cssBytes > invariants.maxDeferredCssBytes)
  fail(`deferred CSS budget exceeded: ${cssBytes}/${invariants.maxDeferredCssBytes}`);
if (cssBrotliBytes > invariants.maxDeferredCssBrotliBytes)
  fail(`deferred CSS Brotli budget exceeded: ${cssBrotliBytes}/${invariants.maxDeferredCssBrotliBytes}`);
for (const layer of CSS_LAYER_ORDER)
  if (!authoredCss.includes(layer)) fail(`CSS layer missing: ${layer}`);
if (!delivery.criticalCss.includes("@layer base") || !delivery.externalCss.includes("@layer components"))
  fail("delivered CSS layers are not deterministic");
if (!assembledCss.cssSource.includes("@container") || !assembledCss.cssSource.includes("contain:"))
  fail("container-query or CSS containment contract missing");
const cssLinks = page.elements.filter(
  (node) => node.tagName === "link" && attr(node, "rel")?.split(/\s+/u).includes("stylesheet"),
);
const cssHref = cssLinks.find((node) => /^\/assets\/site\.[0-9a-f]{12}\.css$/u.test(attr(node, "href") || ""));
const noScriptCssHref = html.match(
  /<noscript>\s*<link\s+[^>]*href=["'](\/assets\/site\.[0-9a-f]{12}\.css)["'][^>]*rel=["']stylesheet["'][^>]*>\s*<\/noscript>/iu,
)?.[1];
const deliveredCssHref = attr(cssHref, "href") || noScriptCssHref;
if (!deliveredCssHref || (await readText(deliveredCssHref.slice(1))) !== delivery.externalCss)
  fail("fingerprinted stylesheet bytes drift from source delivery compiler");

const factMap = await readJson("fact-map.json");
exactKeys(
  factMap,
  ["authority", "canonicalUrl", "records", "release", "schemaVersion", "sourceOfTruth", "type"],
  "fact-map",
);
exactKeys(factMap.authority, ["answerText", "graph", "jsonLd", "retrieval", "visibleHtml"], "fact-map authority");
const expectedFactMapAuthority = {
  answerText: "Answer.text",
  graph: "src/data/semantic/knowledge-graph.jsonld",
  jsonLd: "graph.jsonld#answer-*",
  retrieval: "answers.txt::ANSWER",
  visibleHtml: ".answer-projection[id]",
};
const canonicalObject = (value) =>
  Object.fromEntries(Object.entries(value || {}).sort(([left], [right]) => left.localeCompare(right)));
if (JSON.stringify(canonicalObject(factMap.authority)) !== JSON.stringify(canonicalObject(expectedFactMapAuthority)))
  fail("fact-map authority values are not canonical");
if (
  factMap.schemaVersion !== "1.0" ||
  factMap.type !== "CanonicalFactMap" ||
  factMap.canonicalUrl !== release.canonicalUrl ||
  factMap.release !== release.release ||
  factMap.sourceOfTruth !== "src/data/semantic/knowledge-graph.jsonld" ||
  factMap.records.length !== projection.answers.length
)
  fail("fact-map identity/cardinality drift");
const factKeys = [
  "aboutIds",
  "answer",
  "answerId",
  "claimEvidenceIds",
  "entityEvidenceIds",
  "evidenceIds",
  "graphNodeIds",
  "htmlId",
  "htmlUrl",
  "language",
  "question",
  "questionId",
  "sourceHashSha256",
  "sourceUrl",
];
const sourceByAnswerId = new Map(
  projection.answers.map((record) => [record.answerId, record]),
);
for (const record of factMap.records) {
  exactKeys(record, factKeys, `fact-map record ${record.answerId}`);
  const source = sourceByAnswerId.get(record.answerId);
  if (
    !source ||
    record.questionId !== source.questionId ||
    record.question !== source.questionText ||
    record.answer !== source.answerText ||
    record.language !== source.language ||
    record.sourceUrl !== source.sourceUrl ||
    record.htmlId !== source.htmlId ||
    record.htmlUrl !== source.htmlUrl ||
    !/^[0-9a-f]{64}$/u.test(record.sourceHashSha256) ||
    record.sourceHashSha256 !== sha256(Buffer.from(source.answerText))
  )
    fail(`fact-map record does not project the canonical graph: ${record.answerId}`);
  if (record.htmlId !== canonicalAnswerHtmlId(record.answerId, release.canonicalUrl))
    fail(`fact-map HTML ID drift: ${record.answerId}`);
  for (const field of ["aboutIds", "graphNodeIds", "evidenceIds", "claimEvidenceIds", "entityEvidenceIds"])
    if (!Array.isArray(record[field]) || new Set(record[field]).size !== record[field].length)
      fail(`fact-map ${field} must be a unique array: ${record.answerId}`);
}
validateProjectedAnswerHtml(html, projection);
const answerComments = [
  ...((await readText("index.md")).matchAll(/<!-- answer-id: (https:\/\/www\.ghezelbaash\.ir\/#answer-[^ ]+) -->/gu)),
].map((match) => match[1]);
if (answerComments.length !== projection.answers.length || new Set(answerComments).size !== answerComments.length)
  fail("index.md answer anchor projection drift");
const fullCorpus = await readText("llms-full.txt");
const fullAnswerIds = [
  ...fullCorpus.matchAll(/^ANSWER_IDS:\s*(https:\/\/www\.ghezelbaash\.ir\/#answer-[^\s|]+)/gmu),
].map((match) => match[1]);
if (fullAnswerIds.length !== projection.answers.length || new Set(fullAnswerIds).size !== fullAnswerIds.length)
  fail("llms-full answer projection drift");

const requiredMachineFiles = [
  "graph.jsonld",
  "graph.ttl",
  "fact-map.json",
  "answers.txt",
  "index.md",
  "llms.txt",
  "llms-full.txt",
  "knowledge.xml",
  "provenance.jsonld",
  "evidence-snapshot.json",
  "datapackage.json",
  "croissant.json",
  "linkset.json",
  "dcat.ttl",
  "void.ttl",
  "shapes.ttl",
];
for (const file of requiredMachineFiles) {
  const bytes = await fileBytes(file).catch(() => 0);
  if (!bytes) fail(`required machine resource missing or empty: ${file}`);
}
for (const resource of resourcesForTarget("website").filter((item) => item.materialize)) {
  const bytes = await fileBytes(resource.path).catch(() => 0);
  if (!bytes) fail(`registered materialized resource missing or empty: ${resource.path}`);
}
const graph = await readJson("graph.jsonld");
if (!Array.isArray(graph["@graph"]) || graph["@graph"].length < 1)
  fail("dist graph.jsonld lacks @graph");
const graphById = new Map(graph["@graph"].map((node) => [node["@id"], node]));
const graphSubjectIds = (node) =>
  (Array.isArray(node?.about) ? node.about : [node?.about])
    .filter((value) => value && typeof value["@id"] === "string")
    .map((value) => value["@id"])
    .sort();
for (const record of factMap.records) {
  const graphQuestion = graphById.get(record.questionId);
  const graphAnswer = graphById.get(record.answerId);
  const questionTypes = Array.isArray(graphQuestion?.["@type"])
    ? graphQuestion["@type"]
    : [graphQuestion?.["@type"]];
  const answerTypes = Array.isArray(graphAnswer?.["@type"])
    ? graphAnswer["@type"]
    : [graphAnswer?.["@type"]];
  if (
    !questionTypes.includes("Question") ||
    graphQuestion.acceptedAnswer?.["@id"] !== record.answerId ||
    graphQuestion.name !== record.question ||
    graphQuestion.url !== record.sourceUrl ||
    graphQuestion.inLanguage !== record.language ||
    !answerTypes.includes("Answer") ||
    graphAnswer.text !== record.answer ||
    graphAnswer.url !== record.sourceUrl ||
    graphAnswer.inLanguage !== record.language ||
    JSON.stringify(graphSubjectIds(graphAnswer)) !==
      JSON.stringify([...record.aboutIds].sort())
  )
    fail(`fact-map/JSON-LD Answer.text drift: ${record.answerId}`);
}
const ttl = await readText("graph.ttl");
if (!ttl.trim() || !/^\S+\s+<[^>]+>\s+[\s\S]*?\.\s*$/mu.test(ttl))
  fail("RDF Turtle graph is not a nonempty canonical RDF serialization");
if (!(await readText("robots.txt")).includes(`Sitemap: ${release.canonicalUrl}sitemap.xml`))
  fail("robots.txt lacks canonical sitemap declaration");
if (!/^User-agent:\s*\*/mu.test(await readText("robots.txt")) || !/^Allow:\s*\//mu.test(await readText("robots.txt")))
  fail("robots.txt crawl policy is incomplete");
const sitemap = await readText("sitemap.xml");
if (!sitemap.includes(`<loc>${release.canonicalUrl}</loc>`))
  fail("sitemap.xml lacks the canonical landing page");

const headers = await readText("_headers");
for (const resource of resourcesForTarget("website")) {
  const route = resource.path === "index.html" ? "/" : `/${resource.path}`;
  const block = routeBlock(headers, route);
  if (!block.includes(`Content-Type: ${resource.contentType}`))
    fail(`header Content-Type drift: ${route}`);
}
for (const route of ["/", "/404.html", "/fact-map.json", "/graph.jsonld", "/assets/*", "/fonts/*"])
  if (!headers.includes(`\n${route}\n`)) fail(`required static header route missing: ${route}`);
if (
  !headers.includes("X-Content-Type-Options: nosniff") ||
  !headers.includes("Content-Security-Policy:") ||
  !headers.includes("Cache-Control: public, max-age=31536000, immutable")
)
  fail("static security/cache header baseline missing");

const distEntries = await (async () => {
  const output = [];
  const walk = async (directory, prefix = "") => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), relative);
      else if (entry.isFile()) output.push({ relative, bytes: (await stat(path.join(directory, entry.name))).size });
    }
  };
  await walk(dist);
  return output;
})();
const assetBytes = distEntries
  .filter(({ relative }) => /^(?:assets|media|fonts)\//u.test(relative))
  .reduce((sum, entry) => sum + entry.bytes, 0);
const fontBytes = distEntries
  .filter(({ relative }) => /^fonts\/.*\.(?:woff2?|ttf|otf)$/iu.test(relative))
  .reduce((sum, entry) => sum + entry.bytes, 0);
const jsBytes = distEntries
  .filter(({ relative }) => /\.m?js$/iu.test(relative))
  .reduce((sum, entry) => sum + entry.bytes, 0) +
  page.elements
    .filter((node) => node.tagName === "script" && !/application\/ld\+json/iu.test(attr(node, "type") || ""))
    .reduce((sum, node) => sum + Buffer.byteLength(textContent(node)), 0);
if (assetBytes > invariants.maxTotalAssetBytes)
  fail(`published asset budget exceeded: ${assetBytes}/${invariants.maxTotalAssetBytes}`);
if (fontBytes > invariants.maxFontBytes) fail(`font budget exceeded: ${fontBytes}/${invariants.maxFontBytes}`);
if (jsBytes > invariants.maxJavaScriptBytes) fail(`JavaScript budget exceeded: ${jsBytes}/${invariants.maxJavaScriptBytes}`);
const initialImagePaths = new Set();
for (const source of descendants(images[0].parentNode).filter((node) => node.tagName === "source"))
  for (const candidate of String(attr(source, "srcset") || "").split(",")) {
    const local = assetPath(candidate.trim().split(/\s+/u, 1)[0]);
    if (local) initialImagePaths.add(local);
  }
const fallback = assetPath(attr(images[0], "src"));
if (fallback) initialImagePaths.add(fallback);
let initialImageBytes = 0;
for (const image of initialImagePaths) initialImageBytes += await fileBytes(image);
if (initialImageBytes > invariants.maxInitialImageBytes)
  fail(`initial image budget exceeded: ${initialImageBytes}/${invariants.maxInitialImageBytes}`);

console.log(
  JSON.stringify(
    {
      stage: "DIST_PRODUCTION_CONTRACT",
      htmlBytes: Buffer.byteLength(html),
      answers: projection.answers.length,
      visibleAnswerAtoms: page.elements.filter((node) => classes(node).has("answer-projection")).length,
      css: { criticalBytes, deferredBytes: cssBytes, deferredBrotliBytes: cssBrotliBytes },
      assets: { publishedBytes: assetBytes, initialImageBytes, fontBytes, javascriptBytes: jsBytes },
      machineResources: MACHINE_RESOURCES.filter((resource) => resource.targets.includes("website")).length,
      integrity: "PASS",
    },
    null,
    2,
  ),
);
