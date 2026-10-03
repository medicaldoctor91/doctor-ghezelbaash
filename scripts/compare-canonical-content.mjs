import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Migration evidence only: the canonical loader never parses legacy metadata.
// Match the old loader's exact boundary, preserving every body whitespace byte.
export function legacyPageBody(bytes) {
  const match = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u.exec(bytes.toString("utf8"));
  return match ? bytes.subarray(Buffer.byteLength(match[0], "utf8")) : bytes;
}

export async function compareCanonicalContent(beforeRoot, afterRoot) {
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const pairs = [
    ["src/content-source/page.md", "src/content-source/page.md", legacyPageBody],
    ["src/data/semantic/knowledge-graph.jsonld", "src/data/semantic/knowledge-graph.jsonld"],
    ["dist/llms.txt", "src/content-source/llms-guide.md"],
  ];
  const inputs = [];
  for (const [beforePath, afterPath, transform] of pairs) {
    const oldBytes = await readFile(path.join(beforeRoot, beforePath));
    const before = transform ? transform(oldBytes) : oldBytes;
    const after = await readFile(path.join(afterRoot, afterPath));
    inputs.push({ path: afterPath, bytes: after.length, beforeSha256: hash(before), afterSha256: hash(after), identical: before.equals(after) });
  }
  return { identical: inputs.every((item) => item.identical), inputs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [beforeRoot, afterRoot] = process.argv.slice(2);
  if (!beforeRoot || !afterRoot) throw new Error("Usage: node scripts/compare-canonical-content.mjs BEFORE_ROOT AFTER_ROOT");
  const report = await compareCanonicalContent(beforeRoot, afterRoot);
  await writeFile(".generated/authored-content-equivalence.json", JSON.stringify(report, null, 2) + "\n");
  assert(report.identical, "Canonical page body, graph or editorial guide changed during source normalization");
  console.log(JSON.stringify(report));
}
