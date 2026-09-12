import { createHash } from "node:crypto";
import { minify } from "csso";

export const CSS_SPLIT_MARKER = "/*DIST_CRITICAL_CSS_END*/";
export const CSS_LAYER_ORDER = Object.freeze([
  "reset",
  "tokens",
  "base",
  "components",
  "utilities",
]);
export const RENDER_CALIBRATION_SLOT = "/*DIST_CHUNK_INTRINSIC_SLOT*/";
const RENDER_CALIBRATION_START = "/*DIST_CHUNK_INTRINSIC_START*/";
const RENDER_CALIBRATION_END = "/*DIST_CHUNK_INTRINSIC_END*/";
export const RENDER_CALIBRATION_WIDTHS = Object.freeze([
  360, 390, 430, 768, 1024, 1440,
]);

const fail = (message) => {
  throw new Error(message);
};
const finite = (value) =>
  Number.isFinite(value)
    ? value
    : fail(`Non-finite calibration value: ${value}`);
const count = (source, needle) => String(source).split(needle).length - 1;

export function renderCalibrationCss(calibrationRaw) {
  const raw = String(calibrationRaw);
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid render calibration JSON: ${error.message}`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    fail("Render calibration must be an object");
  const baseline = data["360"];
  if (!baseline || !Array.isArray(baseline.chunks) || !baseline.chunks.length)
    fail("360px calibration baseline missing");
  const chunkCount = baseline.chunks.length;
  const identity = baseline.chunks.map(({ i, id, key }, index) => {
    if (
      !Number.isInteger(i) ||
      i !== index ||
      typeof id !== "string" ||
      !/^[A-Za-z][\w:-]*$/.test(id) ||
      typeof key !== "string" ||
      !key
    )
      fail(`Invalid calibration identity at 360:${index}`);
    return { i, id, key };
  });
  if (new Set(identity.map((item) => item.id)).size !== chunkCount)
    fail("Duplicate render calibration chunk ID");
  for (const width of RENDER_CALIBRATION_WIDTHS) {
    const entry = data[String(width)];
    if (
      !entry ||
      !Array.isArray(entry.chunks) ||
      entry.chunks.length !== chunkCount
    )
      fail(`Calibration width/chunk drift ${width}: expected ${chunkCount}`);
    if (!Number.isInteger(entry.total) || entry.total < 100000)
      fail(`Calibration document height invalid ${width}`);
    for (let index = 0; index < chunkCount; index++) {
      const current = entry.chunks[index],
        expected = identity[index];
      if (
        current.i !== expected.i ||
        current.id !== expected.id ||
        current.key !== expected.key ||
        finite(current.h) < 100
      )
        fail(`Calibration identity/height drift ${width}:${index}`);
    }
    const sum = entry.chunks.reduce((height, chunk) => height + chunk.h, 0);
    if (sum > entry.total + 2)
      fail(`Calibration chunk heights exceed document height ${width}: ${sum}/${entry.total}`);
  }
  // Store each measured height once; every chunk shares the same interpolation
  // function. Values stay unitless so calc uses only number/length arithmetic.
  // Do not round separate slope/intercept coefficients: that loses precision
  // even at the measured reference widths.
  const chunkRules = identity.map(({ id }, chunkIndex) =>
    `#${id}{${RENDER_CALIBRATION_WIDTHS.map((width, index) =>
      `--cis-${index}:${data[String(width)].chunks[chunkIndex].h}`,
    ).join(";")}}`,
  ).join("");
  const media = [];
  media.push(
    `@media(max-width:360px){.render-chunk{--cis:calc(var(--cis-0)*1px)}}`,
  );
  for (let index = 0; index < RENDER_CALIBRATION_WIDTHS.length - 1; index++) {
    const fromWidth = RENDER_CALIBRATION_WIDTHS[index],
      toWidth = RENDER_CALIBRATION_WIDTHS[index + 1];
    const value = `calc(var(--cis-${index})*1px + (var(--cis-${index + 1}) - var(--cis-${index}))*((100vw - ${fromWidth}px)/${toWidth - fromWidth}))`;
    // Inclusive endpoints cover fractional viewports without 0.01px gaps.
    // Adjacent formulas agree exactly at each shared measured endpoint, so
    // their value does not depend on rule order. This standard syntax also
    // survives the project's pinned minifier, unlike MQ4 range notation.
    media.push(
      `@media(min-width:${fromWidth}px) and (max-width:${toWidth}px){.render-chunk{--cis:${value}}}`,
    );
  }
  media.push(
    `@media(min-width:1440px){.render-chunk{--cis:calc(var(--cis-5)*1px)}}`,
  );
  const sha256 = createHash("sha256").update(Buffer.from(raw)).digest("hex");
  const css = `/*DIST_CHUNK_CALIBRATION_SHA256:${sha256}*/${RENDER_CALIBRATION_START}${chunkRules}${media.join("")}${RENDER_CALIBRATION_END}`;
  const ruleCount = chunkCount + media.length;
  if ((css.match(/#[A-Za-z][\w:-]*\{--cis-0:/g) || []).length !== chunkCount ||
      media.length !== RENDER_CALIBRATION_WIDTHS.length + 1)
    fail("Generated render calibration rule count drift");
  return {
    css,
    sha256,
    widths: [...RENDER_CALIBRATION_WIDTHS],
    chunkCount,
    ruleCount,
    data,
  };
}

export function assembleCssSource(authoredCss, calibrationRaw) {
  const source = String(authoredCss);
  if (count(source, RENDER_CALIBRATION_SLOT) !== 1)
    fail("Authored CSS must contain exactly one render calibration slot");
  if (
    source.includes("DIST_CHUNK_CALIBRATION_SHA256:") ||
    source.includes(RENDER_CALIBRATION_START) ||
    source.includes(RENDER_CALIBRATION_END)
  )
    fail(
      "Materialized render calibration CSS must not be stored in authored CSS",
    );
  const splitAt = source.indexOf(CSS_SPLIT_MARKER),
    slotAt = source.indexOf(RENDER_CALIBRATION_SLOT);
  if (count(source, CSS_SPLIT_MARKER) !== 1)
    fail("Authored CSS must contain exactly one critical CSS split marker");
  if (slotAt <= splitAt)
    fail("Render calibration slot must remain in deferred CSS");
  const calibration = renderCalibrationCss(calibrationRaw);
  const cssSource = source.replace(RENDER_CALIBRATION_SLOT, calibration.css);
  if (
    cssSource.includes(RENDER_CALIBRATION_SLOT) ||
    count(cssSource, RENDER_CALIBRATION_START) !== 1 ||
    count(cssSource, RENDER_CALIBRATION_END) !== 1 ||
    count(
      cssSource,
      `/*DIST_CHUNK_CALIBRATION_SHA256:${calibration.sha256}*/`,
    ) !== 1
  )
    fail("Render calibration CSS assembly drift");
  return { cssSource, calibration };
}

const deliveryCommentPattern = /\/\*(DIST_[A-Za-z0-9_:.-]+)\*\//g;
const minifyCss = (source) => {
  const input = String(source);
  const comments = [...input.matchAll(deliveryCommentPattern)].map(
    (match) => match[0],
  );
  const protectedInput = input.replace(
    deliveryCommentPattern,
    (_, body) => `/*!${body}*/`,
  );
  const output = minify(protectedInput, {
    comments: "exclamation",
    restructure: false,
  })
    .css.replace(/\/\*!(DIST_[A-Za-z0-9_:.-]+)\*\//g, "/*$1*/")
    .replace(/\r?\n/g, "");
  for (const comment of comments)
    if (!output.includes(comment))
      throw new Error(
        `CSS delivery comment lost during minification: ${comment}`,
      );
  return output;
};

export function deriveCssDelivery(cssSource) {
  const sourceWithLayers = String(cssSource);
  const layerPrelude = `@layer ${CSS_LAYER_ORDER.join(", ")};`;
  if (sourceWithLayers.split(layerPrelude).length !== 2)
    throw new Error("Authored CSS must contain exactly one cascade layer order");
  const source = sourceWithLayers.replace(`${layerPrelude}\n`, "").replace(layerPrelude, "");
  if (source.includes(RENDER_CALIBRATION_SLOT))
    throw new Error("CSS source must be assembled before delivery derivation");
  if (source.split(CSS_SPLIT_MARKER).length !== 2)
    throw new Error("Critical CSS split marker must occur exactly once");
  const splitAt = source.indexOf(CSS_SPLIT_MARKER);
  const externalAt = splitAt + CSS_SPLIT_MARKER.length;
  const criticalCss = `${layerPrelude}@layer base{${minifyCss(
    source.slice(0, splitAt),
  )}}${CSS_SPLIT_MARKER}`;
  const externalCss = `${layerPrelude}@layer components{${minifyCss(
    source.slice(externalAt),
  )}}`;
  // A minifier can preserve marker comments and ID data while silently dropping
  // unsupported media syntax. Do not accept output that loses calibration rules.
  const calibrationRuleCount = (css) => (css.match(/--cis:/g) || []).length;
  if (calibrationRuleCount(externalCss) !== calibrationRuleCount(source.slice(externalAt)))
    fail("Render calibration rules lost during CSS minification");
  const externalCssHash = createHash("sha256")
    .update(externalCss)
    .digest("hex")
    .slice(0, 12);
  const assetName = `site.${externalCssHash}.css`;
  return {
    criticalCss,
    externalCss,
    assetName,
    assetHref: `/assets/${assetName}`,
  };
}
