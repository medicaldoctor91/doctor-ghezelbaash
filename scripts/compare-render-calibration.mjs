import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderCalibrationCss, RENDER_CALIBRATION_WIDTHS } from "../src/lib/css-delivery.mjs";

const [committedPath, measuredPath] = process.argv.slice(2);
if (!committedPath || !measuredPath) throw new Error("Usage: compare-render-calibration.mjs committed.json measured.json");
const load = async (file) => renderCalibrationCss(await readFile(file, "utf8")).data;
const committed = await load(committedPath);
const measured = await load(measuredPath);
assert.equal(committed._meta?.sourceSha256, measured._meta.sourceSha256, "Committed calibration is stale; commit the measured CI artifact or run render:calibration:update in the reference environment");
assert.equal(committed._meta.domSha256, measured._meta.domSha256, "Measured final DOM changed");
let maxError = 0;
for (const width of RENDER_CALIBRATION_WIDTHS) {
  assert.equal(committed[width].chunks.length, measured[width].chunks.length);
  for (const [index, chunk] of measured[width].chunks.entries()) {
    const previous = committed[width].chunks[index];
    assert.deepEqual([previous.i, previous.id, previous.key], [chunk.i, chunk.id, chunk.key]);
    const error = Math.abs(previous.h - chunk.h);
    maxError = Math.max(maxError, error);
    assert.ok(error <= 1, `Reference geometry changed ${width}:${chunk.id}: ${previous.h} -> ${chunk.h}`);
  }
}
console.log(JSON.stringify({ valid: true, widths: RENDER_CALIBRATION_WIDTHS, maxChunkErrorPx: maxError }));
