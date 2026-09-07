import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import os from "node:os";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { renderCalibrationCss, RENDER_CALIBRATION_WIDTHS } from "../src/lib/css-delivery.mjs";
import { assertCalibrationIdentities, assertCalibrationMetadata, inspectRenderChunks, renderSourceSnapshot } from "./lib/render-calibration.mjs";

const html = '<section class="content-section" id="section-a"><div class="render-chunk" id="rc1"><p>First</p></div><div class="render-chunk" id="rc2"><p>Second</p></div></section>';
const dom = inspectRenderChunks(html, { source: true });
const snapshot = { ...dom, sourceSha256: "a".repeat(64) };
const fixture = () => ({
  ...Object.fromEntries(RENDER_CALIBRATION_WIDTHS.map((width) => [width, { total: 120000, chunks: dom.chunks.map((chunk) => ({ ...chunk, h: 40000 })) }])),
  _meta: { schemaVersion: 1, measuredAt: "2026-09-07T00:00:00Z", sourceSha256: snapshot.sourceSha256, domSha256: dom.domSha256, measurement: {
    engine: "chromium", browserVersion: "reference", playwrightVersion: "reference", viewportHeight: 936, deviceScaleFactor: 1, skipping: "disabled-for-measurement", fonts: [{ width: 360, used: [{ familyName: "reference" }] }],
  } },
});

test("valid measured identities agree with parsed content and final DOM", () => {
  const data = fixture();
  assert.equal(renderCalibrationCss(JSON.stringify(data)).chunkCount, 2);
  assert.doesNotThrow(() => assertCalibrationMetadata(data, snapshot, dom));
});

test("consistently wrong identities and order cannot pass by agreeing across widths", () => {
  for (const mutate of [
    (chunks) => { chunks[0].id = "nonexistent"; },
    (chunks) => { chunks[0].key = "wrong/rc1"; },
    (chunks) => { chunks.reverse().forEach((chunk, i) => { chunk.i = i; }); },
    (chunks) => { chunks.pop(); },
  ]) {
    const data = fixture();
    for (const width of RENDER_CALIBRATION_WIDTHS) mutate(data[width].chunks);
    assert.doesNotThrow(() => renderCalibrationCss(JSON.stringify(data)));
    assert.throws(() => assertCalibrationIdentities(data, dom.chunks), /mismatch/);
  }
});

test("non-numeric, nonpositive and impossible geometry is rejected", () => {
  for (const h of ["40000", null, 0, -1, 10000000]) {
    const data = fixture();
    data[390].chunks[0].h = h;
    assert.throws(() => renderCalibrationCss(JSON.stringify(data)), /calibration|Calibration/);
  }
  const data = fixture();
  data[430].chunks.forEach((chunk) => { chunk.h = 70000; });
  assert.throws(() => renderCalibrationCss(JSON.stringify(data)), /exceed document/);
});

test("missing provenance, stale sources and changed final content fail closed", () => {
  const data = fixture();
  assert.throws(() => assertCalibrationMetadata({ ...data, _meta: undefined }, snapshot), /stale/);
  assert.throws(() => assertCalibrationMetadata(data, { ...snapshot, sourceSha256: "b".repeat(64) }), /stale/);
  assert.throws(() => assertCalibrationMetadata({ ...data, _meta: { ...data._meta, measurement: {} } }, snapshot), /provenance/);
  const changed = inspectRenderChunks(html.replace("First", "Changed text"), { source: true });
  assert.throws(() => assertCalibrationMetadata(data, snapshot, changed), /final DIST/);
});

test("ambiguous, nested and collapsed DOM inventories are rejected", () => {
  assert.throws(() => inspectRenderChunks(html.replace('id="rc2"', 'id="rc1"'), { source: true }), /Duplicate/);
  assert.throws(() => inspectRenderChunks(`<details>${html}</details>`, { source: true }), /initially visible/);
  assert.throws(() => inspectRenderChunks(html.replace("<p>First</p>", '<div class="render-chunk" id="nested">Inner</div>'), { source: true }), /nonnested/);
});

test("fingerprint catches real geometry inputs but excludes its generated calibration", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "render-calibration-contract-"));
  try {
    for (const name of ["src", "scripts", "public/fonts", "astro.config.mjs", "package-lock.json"]) {
      await cp(path.resolve(name), path.join(root, name), { recursive: true });
    }
    const first = await renderSourceSnapshot(root);
    await writeFile(path.join(root, "src/data/render-calibration.json"), '{"generated":"different"}');
    assert.equal((await renderSourceSnapshot(root)).sourceSha256, first.sourceSha256);
    const fontFile = first.inputs.find(([file]) => file.startsWith("public/fonts/"))[0];
    for (const file of ["src/styles/global.css", "src/layouts/BaseLayout.astro", "src/content-source/page.md", fontFile]) {
      const target = path.join(root, file);
      const original = await readFile(target);
      const changed = file.endsWith("page.md")
        ? original.toString().replace(/(class="render-chunk"[^>]*>)/, "$1<p>Geometry changed.</p>")
        : Buffer.concat([original, Buffer.from("\n/* geometry changed */\n")]);
      assert.notEqual(Buffer.from(changed).toString("hex"), original.toString("hex"));
      await writeFile(target, changed);
      assert.notEqual((await renderSourceSnapshot(root)).sourceSha256, first.sourceSha256, file);
      await writeFile(target, original);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
