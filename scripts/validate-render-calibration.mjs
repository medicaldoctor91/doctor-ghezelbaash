import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { computeRenderCalibrationFingerprint } from "./lib/render-calibration-fingerprint.mjs";
import { RENDER_CALIBRATION_WIDTHS, renderCalibrationCss } from "../src/lib/css-delivery.mjs";

const path = "src/data/render-calibration.json";
const raw = await readFile(path, "utf8");
const validation = renderCalibrationCss(raw);
const data = validation.data;
const meta = data?._meta;
assert.ok(meta && typeof meta === "object" && !Array.isArray(meta), "render calibration metadata is required");
assert.equal(meta.schemaVersion, 1, "render calibration metadata schema drift");
assert.ok(typeof meta.measuredAt === "string" && Number.isFinite(Date.parse(meta.measuredAt)), "render calibration measuredAt must be an ISO timestamp");
assert.ok(meta.measuredWith && typeof meta.measuredWith === "object", "render calibration browser evidence is required");
for (const field of ["product", "userAgent", "jsVersion", "protocolVersion"])
  assert.ok(typeof meta.measuredWith[field] === "string" && meta.measuredWith[field], `render calibration measuredWith.${field} is required`);
assert.equal(meta.measuredWith.deviceScaleFactor, 1, "render calibration deviceScaleFactor drift");

const expectedKeys = ["_meta", ...RENDER_CALIBRATION_WIDTHS.map(String)].sort();
assert.deepEqual(Object.keys(data).sort(), expectedKeys, "render calibration top-level width set drift");

const current = await computeRenderCalibrationFingerprint();
assert.deepEqual(meta.fingerprint, current, "render calibration is stale for the current DOM/CSS/font inputs; remeasure with node scripts/measure-render-calibration.mjs after a local Astro build");

console.log(
  JSON.stringify(
    {
      valid: true,
      measuredAt: meta.measuredAt,
      browser: meta.measuredWith.product,
      fingerprint: current.combinedSha256,
      widths: validation.widths,
      chunks: validation.chunkCount,
      cssRules: validation.ruleCount,
      calibrationSha256: validation.sha256,
    },
    null,
    2,
  ),
);
