import path from "node:path";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { assertDocumentContract, inspectHtml } from "./lib/html-contract.mjs";
import { compileHeadersTemplate } from "./lib/headers-template.mjs";
import { STATIC_ARTIFACTS, resourcesForTarget } from "../src/lib/resources.mjs";
import { HERO_EARLY_HINT_HREF } from "../src/lib/hero-image-contract.mjs";

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
const ldScripts = scriptBlocks.filter((script) =>
  /type=["']application\/ld\+json["']/i.test(script.attrs),
);
const execScripts = scriptBlocks.filter(
  (script) => !/type=["']application\/ld\+json["']/i.test(script.attrs),
);
const notFoundStyles = [
  ...notFound.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi),
].map((match) => match[1]);
const notFoundScripts = [
  ...notFound.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
].map((match) => ({ attrs: match[1], body: match[2] }));
if (
  ldScripts.length !== 2 ||
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

const scriptHashes = scriptBlocks
  .map((script) => `'sha256-${shaB64(Buffer.from(script.body))}'`)
  .join(" ");
const styleHashes = styleBlocks
  .map((style) => `'sha256-${shaB64(Buffer.from(style))}'`)
  .join(" ");
const joinCsp = (directives) => directives.join("; ");
const mainCsp = joinCsp([
  "default-src 'none'",
  "base-uri 'self'",
  `script-src ${scriptHashes}`,
  `style-src 'self' ${styleHashes}`,
  "img-src 'self' data:",
  "media-src 'self'",
  "font-src 'self'",
  "manifest-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "upgrade-insecure-requests",
]);
const csp404 = joinCsp([
  "default-src 'none'",
  "base-uri 'self'",
  `script-src ${notFoundScripts
    .map((script) => `'sha256-${shaB64(Buffer.from(script.body))}'`)
    .join(" ")}`,
  `style-src 'self' ${notFoundStyles
    .map((style) => `'sha256-${shaB64(Buffer.from(style))}'`)
    .join(" ")}`,
  "img-src 'self' data:",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
]);

const headersTemplate = await readFile(
  path.join(data, "templates/headers.template"),
  "utf8",
);
const httpResourceLinks = resourcesForTarget("website")
  .filter((resource) => resource.publishInHttpHeader)
  .map((resource) => {
    if (!resource.head?.rel || !resource.mediaType)
      throw new Error(`HTTP discovery metadata missing: ${resource.path}`);
    return `<https://www.ghezelbaash.ir/${resource.path}>; rel="${resource.head.rel}"; type="${resource.mediaType}"`;
  })
  .join(", ");
const headers = compileHeadersTemplate(headersTemplate, {
  mainCsp,
  csp404,
  heroEarlyHintHref: HERO_EARLY_HINT_HREF,
  httpResourceLinks,
});
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
    },
    null,
    2,
  ),
);
