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

// These sources cannot alter the measured render-chunk flow. They are kept
// outside the geometry fingerprint; DOM identity is independently hashed from
// the fully assembled canonical content. The legacy entry for this validator
// itself is accepted only while migrating an older calibration metadata set.
const NON_GEOMETRY_INPUTS = new Set([
  "scripts/lib/render-calibration.mjs",
  "src/components/DocumentHead.astro",
  "src/components/FloatingActionDock.astro",
  "src/components/GuideNavigator.astro",
  "src/components/SiteFooter.astro",
]);

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

// Only inputs capable of altering render-chunk geometry enter this fingerprint.
// Generated calibration CSS/JSON and shell-only components are deliberately
// absent to avoid false staleness and a metadata/hash cycle.
export async function renderSourceSnapshot(root = process.cwd()) {
  const json = async (file) => JSON.parse(await readFile(path.join(root, file), "utf8"));
  const policy = await json("src/data/retrieval/query-matrix-policy.json");
  const graph = await json(canonicalSemanticSource(policy));
  const { content } = await assembleCanonicalContent({ root, graph });
  const inventory = inspectRenderChunks(content, { source: true });
  const componentFiles = (await readdir(path.join(root, "src/components")))
    .filter((file) => file.endsWith(".astro"))
    .map((file) => `src/components/${file}`)
    .filter((file) => !NON_GEOMETRY_INPUTS.has(file));
  const files = [
    "src/styles/global.css", "src/lib/css-delivery.mjs", "astro.config.mjs",
    "src/pages/index.astro", "src/layouts/BaseLayout.astro",
    "src/lib/hero-image-contract.mjs", "package-lock.json",
    "scripts/lib/render-measurement.mjs",
    ...componentFiles,
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

function calibrationCompatibleSnapshot(data, snapshot) {
  const meta = data?._meta;
  if (meta?.sourceSha256 === snapshot.sourceSha256)
    return { snapshot, mode: "EXACT", excludedLegacyInputs: [] };
  if (!meta || !Array.isArray(meta.inputs) || meta.domSha256 !== snapshot.domSha256)
    return { snapshot, mode: "STALE", excludedLegacyInputs: [] };

  const recorded = new Map(meta.inputs);
  const current = new Map(snapshot.inputs);
  if (recorded.size !== meta.inputs.length || current.size !== snapshot.inputs.length)
    return { snapshot, mode: "STALE", excludedLegacyInputs: [] };

  const excludedLegacyInputs = [];
  for (const [file, digest] of recorded) {
    if (NON_GEOMETRY_INPUTS.has(file)) {
      if (!current.has(file)) excludedLegacyInputs.push(file);
      continue;
    }
    if (current.get(file) !== digest)
      return { snapshot, mode: "STALE", excludedLegacyInputs: [] };
  }
  for (const [file] of current)
    if (!recorded.has(file))
      return { snapshot, mode: "STALE", excludedLegacyInputs: [] };
  if (!excludedLegacyInputs.length)
    return { snapshot, mode: "STALE", excludedLegacyInputs: [] };

  return {
    snapshot: { ...snapshot, sourceSha256: meta.sourceSha256 },
    mode: "LEGACY_NON_GEOMETRY_INPUTS_EXCLUDED",
    excludedLegacyInputs: excludedLegacyInputs.sort(),
  };
}

export async function validateRenderCalibration({ root = process.cwd(), html } = {}) {
  const raw = await readFile(path.join(root, "src/data/render-calibration.json"), "utf8");
  const { data, sha256 } = renderCalibrationCss(raw);
  const currentSnapshot = await renderSourceSnapshot(root);
  const compatibility = calibrationCompatibleSnapshot(data, currentSnapshot);
  assertCalibrationMetadata(
    data,
    compatibility.snapshot,
    html === undefined ? undefined : inspectRenderChunks(html),
  );
  return {
    valid: true,
    chunks: currentSnapshot.chunks.length,
    sourceSha256: currentSnapshot.sourceSha256,
    calibrationSha256: sha256,
    sourceCompatibility: compatibility.mode,
    excludedLegacyInputs: compatibility.excludedLegacyInputs,
  };
}
