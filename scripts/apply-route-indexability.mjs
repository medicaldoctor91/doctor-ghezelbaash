import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { parse } from "parse5";
import { applyIndexabilityMeta } from "./lib/indexability-policy.mjs";
import { canonicalLifecycle } from "../src/lib/canonical-inputs.mjs";

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] || "dist");
const records = JSON.parse(await readFile(path.join(root, ".generated/independent-pages.json"), "utf8"));
if (!Array.isArray(records) || !records.length)
  throw new Error("Route indexability requires generated route records");

let indexable = 0, noindex = 0;
const reasons = new Map();
const rendered = new Map();
for (const record of records) {
  const file = path.join(dist, record.file);
  const source = await readFile(file, "utf8");
  const output = applyIndexabilityMeta(source, record);
  await writeFile(file, output, "utf8");
  if (record.indexable) {
    indexable++;
    rendered.set(record.path, output);
  } else noindex++;
  const reason = record.indexability?.reason || "unknown";
  reasons.set(reason, (reasons.get(reason) || 0) + 1);
}

const canonical = new URL(canonicalLifecycle.canonicalUrl);
const promotedPaths = new Set(["/", ...records.filter((record) => record.indexable).map((record) => record.path)]);
const attr = (node, name) => node.attrs?.find((entry) => entry.name === name)?.value;
const nativePromotedTargets = (html) => {
  const document = parse(String(html));
  const targets = new Set();
  const visit = (node) => {
    if (node.tagName === "a" && attr(node, "href")) {
      const url = new URL(attr(node, "href"), canonical);
      if (url.origin === canonical.origin && !url.hash && promotedPaths.has(url.pathname))
        targets.add(url.pathname);
    }
    for (const child of node.childNodes || []) visit(child);
    if (node.content) visit(node.content);
  };
  visit(document);
  return [...targets];
};

const linkGraph = new Map();
linkGraph.set("/", nativePromotedTargets(await readFile(path.join(dist, "index.html"), "utf8")));
for (const record of records.filter((record) => record.indexable))
  linkGraph.set(record.path, nativePromotedTargets(rendered.get(record.path)));

const reachable = new Set(["/"]), depths = new Map([["/", 0]]), queue = ["/"];
let maximumIndexDepth = 0;
while (queue.length) {
  const current = queue.shift();
  for (const next of linkGraph.get(current) || []) {
    if (reachable.has(next)) continue;
    reachable.add(next);
    const depth = depths.get(current) + 1;
    depths.set(next, depth);
    maximumIndexDepth = Math.max(maximumIndexDepth, depth);
    queue.push(next);
  }
}
const unreachable = [...promotedPaths].filter((route) => !reachable.has(route));
if (unreachable.length)
  throw new Error("Indexable routes require a native promoted-only path from home: " + unreachable.slice(0, 20).join(", ") +
    (unreachable.length > 20 ? ` (+${unreachable.length - 20} more)` : ""));

console.log(JSON.stringify({
  routeIndexability: "APPLIED",
  routable: records.length,
  indexable,
  noindex,
  promotedReachable: reachable.size - 1,
  maximumIndexDepth,
  reasons: Object.fromEntries([...reasons].sort(([a], [b]) => a.localeCompare(b))),
}, null, 2));
