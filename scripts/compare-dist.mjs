import assert from "node:assert/strict";
import path from "node:path";
import { readFile, readdir, writeFile } from "node:fs/promises";

const [before, after] = process.argv.slice(2);
if (!before || !after) throw new Error("Usage: node scripts/compare-dist.mjs BEFORE AFTER");
const files = async (root, prefix = "") => {
  const result = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await files(root, relative));
    else if (entry.isFile()) result.push(relative);
    else throw new Error("Unexpected distribution entry: " + relative);
  }
  return result.sort();
};
const previous = await files(before);
const current = await files(after);
assert.deepEqual(current, previous, "Distribution file inventories differ");
const changed = [];
for (const file of current) {
  const [oldBytes, newBytes] = await Promise.all([
    readFile(path.join(before, file)), readFile(path.join(after, file)),
  ]);
  if (!oldBytes.equals(newBytes)) changed.push(file);
}
const result = { identical: changed.length === 0, files: current.length, changed };
await writeFile(".generated/dist-equivalence.json", JSON.stringify(result, null, 2) + "\n");
assert.deepEqual(changed, [], "Distribution bytes differ");
console.log(JSON.stringify(result));
