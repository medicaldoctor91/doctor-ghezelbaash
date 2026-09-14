import path from "node:path";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { inspectHtml } from "./html-contract.mjs";
import { assembleCanonicalContent } from "./assemble-content.mjs";
import { canonicalSemanticSource } from "../../src/lib/semantic-projection.mjs";
import { renderCalibrationCss, RENDER_CALIBRATION_WIDTHS } from "../../src/lib/css-delivery.mjs";

export const CALIBRATION_SCHEMA = 1;
export const CALIBRATION_VIEWPORT_HEIGHT = 936;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const attribute = (node, name) => node.attrs?.find((item) => item.name === name)?.value;
const hasClass = (node, name) => (attribute(node, "class") || "").split(/\s+/).includes(name);
const tree = (node) => node.nodeName === "#text"
  ? ["text", node.value]
  : [node.tagName || node.nodeName,
    (node.attrs || []).map(({ name, value }) => [name, value]).sort(([a], [b]) => a.localeCompare(b)),
    (node.childNodes || []).filter((child) => child.nodeName !== "#comment").map(tree)];

export function inspectRenderChunks(html, { source = false } = {}) {
  const { elements } = inspectHtml(html, { wrapMain: source });
  const nodes = elements.filter((node) => hasClass(node, "render-chunk"));
  if (!nodes.length) throw new Error("Render chunk DOM inventory is empty");
  const chunks = nodes.map((node, i) => {
    const id = attribute(node, "id");
    let section;
    for (let parent = node.parentNode; parent; parent = parent.parentNode) {
      if (hasClass(parent, "render-chunk") || parent.tagName === "details")
        throw new Error(`Calibration requires nonnested, initially visible chunks: ${id}`);
      if (!section && hasClass(parent, "content-section")) section = attribute(parent, "id");
    }
    if (!id || !/^[A-Za-z][\w:-]*$/.test(id) || !section)
      throw new Error(`Invalid render chunk DOM identity: ${id}`);
    return { i, id, key: `${section}/${id}` };
  });
  if (new Set(chunks.map(({ id }) => id)).size !== chunks.length)
    throw new Error("Duplicate render chunk DOM ID");
  return { chunks, domSha256: sha(JSON.stringify(nodes.map(tree))) };
}

export function assertCalibrationIdentities(data, expected) {
  for (const width of RENDER_CALIBRATION_WIDTHS) {
    const actual = data[String(width)]?.chunks;
    if (actual?.length !== expected.length)
      throw new Error(`Calibration/DOM chunk count mismatch ${width}`);
    for (const [index, wanted] of expected.entries()) {
      const found = actual[index];
      if (found.i !== wanted.i || found.id !== wanted.id || found.key !== wanted.key)
        throw new Error(`Calibration/DOM identity or order mismatch ${width}:${index}`);
    }
  }
}

// Only source inputs enter this fingerprint. Generated calibration CSS, JSON,
// timestamps and its embedded SHA are deliberately absent to avoid a hash cycle.
export async function renderSourceSnapshot(root = process.cwd()) {
  const json = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
  const policy = await json("src/data/retrieval/query-matrix-policy.json");
  const graph = await json(canonicalSemanticSource(policy));
  const { content } = await assembleCanonicalContent({ root, graph });
  const inventory = inspectRenderChunks(content, { source: true });
  const files = [
    "src/styles/global.css", "src/lib/css-delivery.mjs", "astro.config.mjs",
    "src/pages/index.astro", "src/layouts/BaseLayout.astro",
    "src/lib/hero-image-contract.mjs", "package-lock.json",
    "scripts/lib/render-measurement.mjs", "scripts/lib/render-calibration.mjs",
    ...(await readdir(path.join(root, "src/components"))).filter((file) => file.endsWith(".astro")).map((file) => `src/components/${file}`),
    ...(await readdir(path.join(root, "public/fonts"))).map((file) => `public/fonts/${file}`),
  ].sort();
  const inputs = await Promise.all(files.map(async (file) => [file, sha(await readFile(path.join(root, file)))]));
  inputs.push(["assembled-render-chunk-content", inventory.domSha256]);
  return { ...inventory, inputs, sourceSha256: sha(JSON.stringify(inputs)) };
}

export function assertCalibrationMetadata(data, snapshot, dom) {
  const meta = data._meta;
  if (meta?.schemaVersion !== CALIBRATION_SCHEMA || meta.sourceSha256 !== snapshot.sourceSha256)
    throw new Error("Render calibration is stale for this source; run npm run render:calibration:update");
  if (!/^[a-f0-9]{64}$/.test(meta.domSha256 || "") ||
      !Number.isFinite(Date.parse(meta.measuredAt)) ||
      meta.measurement?.engine !== "chromium" ||
      !meta.measurement.browserVersion || !meta.measurement.playwrightVersion ||
      meta.measurement.viewportHeight !== CALIBRATION_VIEWPORT_HEIGHT ||
      meta.measurement.deviceScaleFactor !== 1 ||
      meta.measurement.skipping !== "disabled-for-measurement" ||
      !Array.isArray(meta.measurement.fonts) || !meta.measurement.fonts.length)
    throw new Error("Render calibration measurement provenance is missing or invalid");
  assertCalibrationIdentities(data, snapshot.chunks);
  if (dom) {
    assertCalibrationIdentities(data, dom.chunks);
    if (meta.domSha256 !== dom.domSha256)
      throw new Error("Measured render chunk DOM differs from the final DIST");
  }
}

export async function validateRenderCalibration({ root = process.cwd(), html } = {}) {
  const raw = await readFile(path.join(root, "src/data/render-calibration.json"), "utf8");
  const { data, sha256 } = renderCalibrationCss(raw);
  const snapshot = await renderSourceSnapshot(root);
  assertCalibrationMetadata(data, snapshot, html === undefined ? undefined : inspectRenderChunks(html));
  return { valid: true, chunks: snapshot.chunks.length, sourceSha256: snapshot.sourceSha256, calibrationSha256: sha256 };
}
