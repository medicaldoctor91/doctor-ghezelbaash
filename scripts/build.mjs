import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const canonicalPaths = [
  "src/content-source/page.md",
  "src/data/semantic/knowledge-graph.jsonld",
];
const canonicalHashes = () => Promise.all(canonicalPaths.map(async (file) =>
  createHash("sha256").update(await readFile(file)).digest("hex")));
const before = await canonicalHashes();
const steps = [
  ["scripts/generated-workspace.mjs", "reset"],
  ["scripts/generate-rdf.mjs"],
  ["scripts/generate-projections.mjs"],
  ["scripts/generate-descriptors.mjs"],
  ["node_modules/astro/bin/astro.mjs", "build"],
  ["scripts/materialize-static-artifacts.mjs"],
  ["scripts/generate-deployment-headers.mjs"],
  ["scripts/validate-dist.mjs"],
  ["scripts/write-dist-manifest.mjs"],
];

// One finite static distribution: derive its published formats, compile the
// document, materialize assets and validate the actual output in that order.
for (const args of steps) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const after = await canonicalHashes();
if (before.some((hash, index) => hash !== after[index]))
  throw new Error("Build modified an authored canonical file");
console.log(JSON.stringify({ dist: "PASS", canonicalFilesUnchanged: true }));
