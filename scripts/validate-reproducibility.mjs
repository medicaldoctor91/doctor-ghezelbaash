import path from "node:path";
import { createHash } from "node:crypto";
import { assembleCssSource } from "../src/lib/css-source.mjs";
import { deriveCssDelivery } from "../src/lib/css-delivery.mjs";
import { readFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { MACHINE_RESOURCES } from "../src/lib/resources.mjs";

const root = process.cwd();
const [authoredCss, renderCalibrationRaw] = await Promise.all([
  readFile(path.join(root, "src/styles/global.css"), "utf8"),
  readFile(path.join(root, "src/data/render-calibration.json"), "utf8"),
]);
const { cssSource } = assembleCssSource(authoredCss, renderCalibrationRaw),
  { assetName: cssAssetName } = deriveCssDelivery(cssSource),
  cssAsset = `.generated/public/assets/${cssAssetName}`;
const files = [
  ...new Set([
    ".generated/content/home.md",
    ".generated/semantic/head-graph.json",
    ".generated/semantic/support-graph.json",
    ".generated/semantic/rdf-lock.json",
    ...MACHINE_RESOURCES.map((resource) => resource.source).filter((source) =>
      source.startsWith(".generated/"),
    ),
    cssAsset,
  ]),
];
const sha = (b) => createHash("sha256").update(b).digest("hex");
async function snap() {
  const out = {};
  for (const f of files) out[f] = sha(await readFile(path.join(root, f)));
  return out;
}
const pipeline = [
  ["scripts/generated-workspace.mjs", "reset"],
  "scripts/generate-rdf.mjs",
  ["scripts/generate-projections.mjs", "distribution"],
  "scripts/generate-retrieval-projections.mjs",
  "scripts/generate-descriptors.mjs",
];
const runPipeline = () => {
  for (const step of pipeline) {
    const [script, ...args] = Array.isArray(step) ? step : [step];
    const run = spawnSync(process.execPath, [script, ...args], {
      cwd: root,
      encoding: "utf8",
    });
    if (run.status !== 0)
      throw new Error(
        `Generated pipeline regeneration failed in ${script}:\n${run.stderr || run.stdout}`,
      );
  }
};
runPipeline();
for (const f of files) await access(path.join(root, f));
const before = await snap();
runPipeline();
const after = await snap(),
  drift = files.filter((f) => before[f] !== after[f]);
if (drift.length)
  throw new Error(
    `Non-deterministic generated workspace drift: ${drift.join(", ")}`,
  );
const rdfLock = JSON.parse(
  await readFile(path.join(root, ".generated/semantic/rdf-lock.json"), "utf8"),
);
if (!Number.isInteger(rdfLock.triples) || rdfLock.triples < 1)
  throw new Error("RDF measurement is missing after regeneration");
console.log(
  JSON.stringify(
    {
      valid: true,
      files: files.length,
      deterministic: true,
      fullPipeline: true,
      generatedWorkspace: ".generated",
      sourceTreeMutation: false,
      pipeline,
      aggregateSha256: sha(
        Buffer.from(files.map((f) => `${f}:${after[f]}`).join("\n")),
      ),
    },
    null,
    2,
  ),
);
