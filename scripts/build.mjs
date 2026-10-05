import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const authoredPaths = [
  "src/content-source/page.md",
  "src/data/semantic/knowledge-graph.jsonld",
  "src/data/semantic/shapes-supplement.ttl",
  "src/content-source/llms-guide.md",
  "src/config/site-policy.mjs",
  "src/config/machine-resources.mjs",
  "src/data/url-architecture.json",
];
const authoredHashes = () => Promise.all(authoredPaths.map(async (file) =>
  createHash("sha256").update(await readFile(file)).digest("hex")));
const before = await authoredHashes();
const steps = [
  ["scripts/generated-workspace.mjs", "reset"],
  ["scripts/generate-rdf.mjs"],
  ["scripts/generate-shapes.mjs"],
  ["scripts/generate-projections.mjs"],
  ["scripts/generate-descriptors.mjs"],
  ["node_modules/astro/bin/astro.mjs", "build"],
  ["scripts/materialize-static-artifacts.mjs"],
  ["scripts/generate-deployment-headers.mjs"],
  ["scripts/validate-dist.mjs"],
  ["scripts/write-dist-manifest.mjs"],
];

// One finite static distribution: compile canonical pages and machine artifacts,
// materialize only intentional public aliases, then validate the exact deployable
// output before fingerprinting it. Development-only paths are never generated.
for (const args of steps) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
const after = await authoredHashes();
if (before.some((hash, index) => hash !== after[index]))
  throw new Error("Build modified an authored content, graph or policy input");
console.log(JSON.stringify({ dist: "PASS", canonicalFilesUnchanged: true, authoredInputsUnchanged: true }));
