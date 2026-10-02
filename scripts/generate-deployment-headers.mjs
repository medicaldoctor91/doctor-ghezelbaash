import path from "node:path";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { assertDocumentContract, inspectHtml } from "./lib/html-contract.mjs";
import { compileHeadersTemplate, expandMachineAliasHeaders } from "./lib/headers-template.mjs";
import { STATIC_ARTIFACTS, resourcesForTarget, quoteHttpParameter } from "../src/lib/resources.mjs";
import { canonicalLifecycle as release, pageFrontmatter, pageJsonLd } from "../src/lib/canonical-inputs.mjs";
import { validatePageJsonLd } from "../src/lib/page-discovery-jsonld.mjs";
import { resolveBuildIdentity } from "../src/lib/build-identity.mjs";

import { canonicalHostAliasRows, loadAliasRegistry } from "./lib/redirect-registry.mjs";

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] || "dist");
const data = path.join(root, "src/data");
const shaHex = (bytes) => createHash("sha256").update(bytes).digest("hex");
const shaB64 = (bytes) => createHash("sha256").update(bytes).digest("base64");
const fileMeta = async (relative) => {
  const bytes = await readFile(path.join(dist, relative));
  return { relative, bytes: bytes.length, sha256: shaHex(bytes) };
};

const html = await readFile(path.join(dist, "index.html"), "utf8");
const notFound = await readFile(path.join(dist, "404.html"), "utf8");
assertDocumentContract(html);
inspectHtml(notFound);

const activeCss = (html.match(/\/assets\/site\.[0-9a-f]{12}\.css/) ||
  [])[0]?.slice(1);
if (!activeCss)
  throw new Error(
    "Active fingerprint stylesheet missing before deployment header generation",
  );
const cssAssets = (await readdir(path.join(dist, "assets")))
  .filter((name) => /^site\.[0-9a-f]{12}\.css$/.test(name))
  .map((name) => `assets/${name}`)
  .sort();
if (cssAssets.length !== 1 || cssAssets[0] !== activeCss)
  throw new Error(
    `DIST fingerprint stylesheet contract drift: active=${activeCss}, present=${cssAssets.join(", ") || "none"}`,
  );

const styleBlocks = [
  ...html.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi),
].map((match) => match[1]);
const scriptBlocks = [
  ...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
].map((match) => ({ attrs: match[1], body: match[2] }));
const attributeValue = (attrs, name) => {
  const match = attrs.match(
    new RegExp(`(?:^|\\s)${name}=(["'])(.*?)\\1`, "i"),
  );
  return match?.[2] ?? null;
};
const ldScripts = scriptBlocks.filter((script) =>
  /type=["']application\/ld\+json["']/i.test(script.attrs),
);
const ldDocuments = new Map();
for (const script of ldScripts) {
  const id = attributeValue(script.attrs, "id");
  if (!id || ldDocuments.has(id))
    throw new Error(`Published JSON-LD requires a unique script id: ${id || "missing"}`);
  const document = JSON.parse(script.body);
  if (!Array.isArray(document["@graph"]))
    throw new Error("Published JSON-LD must contain @graph");
  ldDocuments.set(id, document);
}
const projectedJsonLd = validatePageJsonLd(pageJsonLd);
const expectedLdIds = projectedJsonLd.map((script) => script.id);
if (
  ldDocuments.size !== expectedLdIds.length ||
  expectedLdIds.some((id) => !ldDocuments.has(id))
)
  throw new Error(
    `Published JSON-LD scripts must be exactly: ${expectedLdIds.join(", ")}`,
  );

const nodeTypes = (node) =>
  [node?.["@type"]].flat().filter((value) => typeof value === "string");
for (const script of projectedJsonLd) {
  if (JSON.stringify(ldDocuments.get(script.id)) !== JSON.stringify(script.document))
    throw new Error(`Published JSON-LD differs from browser discovery projection: ${script.id}`);
}
const coreDocument = ldDocuments.get(projectedJsonLd[0].id);
const pageId = pageFrontmatter.pageMicrodata.itemId;
const pageNode = coreDocument["@graph"].find((node) => node?.["@id"] === pageId);
const personNode = coreDocument["@graph"].find(
  (node) => node?.["@id"] === release.primaryEntity.id,
);
if (
  !pageNode ||
  !nodeTypes(pageNode).includes("MedicalWebPage") ||
  nodeTypes(pageNode).includes("ProfilePage") ||
  pageNode.mainEntity?.["@id"] !== release.primaryEntity.id ||
  !personNode ||
  !nodeTypes(personNode).includes("Person") ||
  personNode.url !== release.canonicalUrl + "saeed-ghezelbash" ||
  personNode.mainEntityOfPage?.["@id"] !== release.canonicalUrl + "saeed-ghezelbash#webpage"
)
  throw new Error(
    "Homepage must be a MedicalWebPage whose canonical Person resolves to the dedicated ProfilePage",
  );

const profileHtml = await readFile(path.join(dist, "saeed-ghezelbash.html"), "utf8");
const profileElements = inspectHtml(profileHtml).elements;
const profileDocuments = profileElements.filter((node) =>
  node.tagName === "script" && node.attrs?.some((attr) =>
    attr.name === "type" && attr.value === "application/ld+json"))
  .map((node) => JSON.parse(node.childNodes.map((child) => child.value || "").join("")));
if (profileDocuments.length !== 1)
  throw new Error("Dedicated physician profile requires one JSON-LD document");
const profileGraph = profileDocuments[0]["@graph"] || [];
const profilePage = profileGraph.find((node) =>
  node?.["@id"] === release.canonicalUrl + "saeed-ghezelbash#webpage");
if (
  !profilePage ||
  !nodeTypes(profilePage).includes("ProfilePage") ||
  profilePage.mainEntity?.["@id"] !== release.primaryEntity.id
)
  throw new Error("Dedicated physician URL must publish ProfilePage mainEntity -> canonical Person");

const execScripts = scriptBlocks.filter(
  (script) => !/type=["']application\/ld\+json["']/i.test(script.attrs),
);
const buildIdentity = resolveBuildIdentity();
const namedMeta = new Map(
  [...html.matchAll(/<meta\b([^>]*)>/gi)]
    .map((match) => match[1])
    .map((attrs) => [
      attributeValue(attrs, "name"),
      attributeValue(attrs, "content"),
    ])
    .filter(([name]) => name),
);
for (const [name, expected] of [
  ["x-build-release", release.release],
  ["x-build-commit", buildIdentity.commit],
  ["x-build-branch", buildIdentity.branch],
  ["x-build-provider", buildIdentity.provider],
]) {
  if (namedMeta.get(name) !== expected)
    throw new Error(
      `Deployment identity mismatch for ${name}: expected=${expected} actual=${namedMeta.get(name) || "missing"}`,
    );
}
const buildInfo = JSON.parse(
  await readFile(path.join(dist, "build-info.json"), "utf8"),
);
if (
  buildInfo.release !== release.release ||
  buildInfo.commit !== buildIdentity.commit ||
  buildInfo.branch !== buildIdentity.branch ||
  buildInfo.provider !== buildIdentity.provider
)
  throw new Error("build-info.json does not match the rendered deployment identity");

const notFoundStyles = [
  ...notFound.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi),
].map((match) => match[1]);
const notFoundScripts = [
  ...notFound.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
].map((match) => ({ attrs: match[1], body: match[2] }));
if (
  ldScripts.length !== projectedJsonLd.length ||
  execScripts.length !== 2 ||
  !execScripts.some((script) =>
    /id=["']site-runtime["']/i.test(script.attrs),
  ) ||
  !execScripts.some((script) =>
    /id=["']deferred-stylesheet-loader["']/i.test(script.attrs),
  ) ||
  notFoundScripts.length !== 1 ||
  !/id=["']deferred-stylesheet-loader["']/i.test(notFoundScripts[0].attrs) ||
  styleBlocks.length < 1 ||
  notFoundStyles.length < 1
)
  throw new Error(
    `Unexpected inline assets: styles=${styleBlocks.length}, ld=${ldScripts.length}, exec=${execScripts.length}, exec404=${notFoundScripts.length}`,
  );

const joinCsp = (directives) => directives.join("; ");
const documentCsp = (scripts, styles) => joinCsp([
  "default-src 'none'",
  "base-uri 'self'",
  `script-src ${scripts.map((script) => `'sha256-${shaB64(Buffer.from(script.body))}'`).join(" ")}`,
  `style-src 'self' ${styles.map((style) => `'sha256-${shaB64(Buffer.from(style))}'`).join(" ")}`,
  "img-src 'self' data:", "media-src 'self'", "font-src 'self'", "manifest-src 'self'",
  "connect-src 'self'", "object-src 'none'", "frame-src 'none'", "frame-ancestors 'none'",
  "form-action 'self'", "upgrade-insecure-requests",
]);
const mainCsp = documentCsp(execScripts, styleBlocks);
const csp404 = documentCsp(notFoundScripts, notFoundStyles);
const sharedDocumentCsp = documentCsp([...execScripts, ...notFoundScripts], [...styleBlocks, ...notFoundStyles]);

const headersTemplate = await readFile(
  path.join(data, "templates/headers.template"),
  "utf8",
);
const httpResourceLinks = resourcesForTarget("website")
  .filter((resource) => resource.publishInHttpHeader)
  .map((resource) => {
    if (!resource.head?.rel || !resource.mediaType)
      throw new Error(`HTTP discovery metadata missing: ${resource.path}`);
    return `<${release.canonicalUrl}${resource.path}>; rel=${quoteHttpParameter(resource.head.rel)}; type=${quoteHttpParameter(resource.contentType)}`;
  })
  .join(", ");
const compiledHeaders = compileHeadersTemplate(headersTemplate, {
  mainCsp,
  csp404,
  documentCsp: sharedDocumentCsp,
  httpResourceLinks,
});
const machineAliases = canonicalHostAliasRows(await loadAliasRegistry(root))
  .filter((row) => row.target === "/graph.jsonld").map((row) => row.source);
const headers = expandMachineAliasHeaders(compiledHeaders, [
  "/graph.jsonld/*", "/provenance.jsonld/*", "/website", "/medical-specialty-aesthetic-medicine",
  ...machineAliases,
]);
if (/\btrack-src\b/i.test(headers))
  throw new Error("Invalid CSP directive track-src");
await writeFile(path.join(dist, "_headers"), headers);

const dataPackage = JSON.parse(
  await readFile(path.join(dist, "datapackage.json"), "utf8"),
);
const croissant = JSON.parse(
  await readFile(path.join(dist, "croissant.json"), "utf8"),
);
for (const resource of dataPackage.resources || []) {
  const relative = String(resource.path || "").replace(/^\//, "");
  if (!relative) continue;
  const meta = await fileMeta(relative);
  if (
    resource.bytes !== meta.bytes ||
    resource.hash !== `sha256:${meta.sha256}`
  )
    throw new Error(`Data Package materialization hash drift ${relative}`);
}
for (const resource of croissant.distribution || []) {
  const url = String(resource.contentUrl || "");
  if (!url.startsWith("https://www.ghezelbaash.ir/")) continue;
  const relative = url
    .slice("https://www.ghezelbaash.ir/".length)
    .split("#")[0];
  if (!relative) continue;
  const meta = await fileMeta(relative);
  if (
    String(resource.contentSize) !== String(meta.bytes) ||
    resource.sha256 !== meta.sha256
  )
    throw new Error(`Croissant materialization hash drift ${relative}`);
}

console.log(
  JSON.stringify(
    {
      deploymentHeadersGenerated: true,
      htmlBytes: Buffer.byteLength(html),
      activeCss,
      publicMachineResources: STATIC_ARTIFACTS.length,
      descriptorResources: (dataPackage.resources || []).length,
      headersSha256: shaHex(Buffer.from(headers)),
      descriptorIntegrity: "PASS",
      jsonLdContract: "PASS",
      buildIdentity,
    },
    null,
    2,
  ),
);
