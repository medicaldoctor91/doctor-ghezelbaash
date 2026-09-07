import path from "node:path";
import { cp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { renderCalibrationCss } from "../src/lib/css-delivery.mjs";
import { CALIBRATION_SCHEMA, assertCalibrationMetadata, inspectRenderChunks, renderSourceSnapshot } from "./lib/render-calibration.mjs";
import { measureRenderChunks, withStaticSite } from "./lib/render-measurement.mjs";

const root = process.cwd();
const canonicalPath = path.join(root, "src/data/render-calibration.json");
const inputPath = process.argv[2] ? path.resolve(root, process.argv[2]) : undefined;
const snapshot = await renderSourceSnapshot(root);
const candidate = path.join(root, ".generated/calibration-candidate");
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Calibration candidate build failed: ${command}`);
};
// This isolated candidate is never a release: it intentionally uses the last
// valid estimates, so changed geometry can be measured before the freshness gate.
run("npm", ["run", "prepare:site"]);
run(process.execPath, ["node_modules/astro/bin/astro.mjs", "build", "--outDir", candidate]);
await cp(path.join(root, ".generated/public/assets"), path.join(candidate, "assets"), { recursive: true });
const dom = inspectRenderChunks(await readFile(path.join(candidate, "index.html"), "utf8"));
let data;
if (inputPath) {
  data = JSON.parse(await readFile(inputPath, "utf8"));
} else {
  const { measurements, provenance } = await withStaticSite(candidate, (url) => measureRenderChunks(url, dom.chunks));
  data = { ...measurements, _meta: {
    schemaVersion: CALIBRATION_SCHEMA, measuredAt: new Date().toISOString(),
    sourceSha256: snapshot.sourceSha256, domSha256: dom.domSha256,
    inputs: snapshot.inputs, measurement: provenance,
  } };
}
const after = await renderSourceSnapshot(root);
if (after.sourceSha256 !== snapshot.sourceSha256) throw new Error("Geometry source changed during measurement; calibration was not written");
assertCalibrationMetadata(data, snapshot, dom);
const canonicalRaw = `${JSON.stringify(data, null, 2)}\n`;
const calibration = renderCalibrationCss(canonicalRaw);
const temporaryPath = `${canonicalPath}.${process.pid}-${Date.now()}.tmp`;
try {
  await writeFile(temporaryPath, canonicalRaw, { flag: "wx", mode: 0o644 });
  await rename(temporaryPath, canonicalPath);
} finally {
  await rm(temporaryPath, { force: true });
}
console.log(
  JSON.stringify(
    {
      updated: true,
      input: inputPath ? path.relative(root, inputPath) : "measured Chromium candidate",
      widths: calibration.widths,
      chunks: calibration.chunkCount,
      sha256: calibration.sha256,
      cssRules: calibration.ruleCount,
      cssMutation: false,
      cssAssembly: "in-memory",
    },
    null,
    2,
  ),
);
