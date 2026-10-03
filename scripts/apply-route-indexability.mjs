import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { applyIndexabilityMeta } from "./lib/indexability-policy.mjs";

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] || "dist");
const records = JSON.parse(await readFile(path.join(root, ".generated/independent-pages.json"), "utf8"));
if (!Array.isArray(records) || !records.length)
  throw new Error("Route indexability requires generated route records");

let indexable = 0, noindex = 0;
const reasons = new Map();
for (const record of records) {
  const file = path.join(dist, record.file);
  const source = await readFile(file, "utf8");
  const output = applyIndexabilityMeta(source, record);
  await writeFile(file, output, "utf8");
  if (record.indexable) indexable++; else noindex++;
  const reason = record.indexability?.reason || "unknown";
  reasons.set(reason, (reasons.get(reason) || 0) + 1);
}

console.log(JSON.stringify({
  routeIndexability: "APPLIED",
  routable: records.length,
  indexable,
  noindex,
  reasons: Object.fromEntries([...reasons].sort(([a], [b]) => a.localeCompare(b))),
}, null, 2));
