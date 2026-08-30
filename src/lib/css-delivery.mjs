import { createHash } from "node:crypto";
import { minify } from "csso";
import { CSS_SPLIT_MARKER, RENDER_CALIBRATION_SLOT } from "./css-source.mjs";

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
  const source = String(cssSource);
  if (source.includes(RENDER_CALIBRATION_SLOT))
    throw new Error("CSS source must be assembled before delivery derivation");
  if (source.split(CSS_SPLIT_MARKER).length !== 2)
    throw new Error("Critical CSS split marker must occur exactly once");
  const splitAt = source.indexOf(CSS_SPLIT_MARKER);
  const externalAt = splitAt + CSS_SPLIT_MARKER.length;
  const criticalCss = `${minifyCss(source.slice(0, splitAt))}${CSS_SPLIT_MARKER}`;
  const externalCss = minifyCss(source.slice(externalAt));
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
