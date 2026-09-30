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
const fail = (message) => { throw new Error(message); };

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
