import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { canonicalLifecycle } from "../src/lib/canonical-inputs.mjs";
import { consolidateContentRedirectTargets, renderStaticRewrites } from "./lib/redirect-registry.mjs";

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] || "dist");
const records = JSON.parse(await readFile(path.join(root, ".generated/independent-pages.json"), "utf8"));
const source = await readFile(path.join(dist, "_redirects"), "utf8");
const rows = source.split(/\r?\n/u).filter(Boolean).map((line, index) => {
  const parts = line.trim().split(/\s+/u);
  if (parts.length !== 3) throw new Error(`Invalid _redirects line ${index + 1}`);
  const statusCode = Number(parts[2]);
  if (!Number.isInteger(statusCode)) throw new Error(`Invalid _redirects status at line ${index + 1}`);
  return { source: parts[0], target: parts[1], statusCode };
});

const { rows: consolidated, retargeted } = consolidateContentRedirectTargets(
  rows,
  records,
  canonicalLifecycle.canonicalUrl,
);
await writeFile(path.join(dist, "_redirects"), renderStaticRewrites(consolidated), "utf8");
console.log(JSON.stringify({ redirectConsolidation: "APPLIED", rules: consolidated.length, retargeted }, null, 2));
