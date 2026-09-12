import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  renderCalibrationCss,
  assembleCssSource,
  deriveCssDelivery,
  RENDER_CALIBRATION_WIDTHS as widths,
} from "../src/lib/css-delivery.mjs";

const raw = await readFile(new URL("../src/data/render-calibration.json", import.meta.url), "utf8");
const data = JSON.parse(raw);
const compact = () => {
  const result = renderCalibrationCss(raw);
  const ids = [...result.css.matchAll(/#([A-Za-z][\w:-]*)\{([^{}]*)\}/g)];
  const media = [...result.css.matchAll(/@media([^{}]+)\{\.render-chunk\{--cis:([^{};]+);?\}\}/g)]
    .map(([, condition, expression]) => ({ condition: condition.replace(/\s+/g, ""), expression }));
  return { ...result, ids, media };
};

function matches(condition, width) {
  let match;
  if ((match = /^\(max-width:([\d.]+)px\)$/.exec(condition))) return width <= Number(match[1]);
  if ((match = /^\(min-width:([\d.]+)px\)$/.exec(condition))) return width >= Number(match[1]);
  if ((match = /^\(min-width:([\d.]+)px\)and\(max-width:([\d.]+)px\)$/.exec(condition)))
    return width >= Number(match[1]) && width <= Number(match[2]);
  throw new Error(`Unexpected calibration media condition: ${condition}`);
}

// Evaluate only the generator's restricted arithmetic grammar. This is a unit
// test oracle, not a CSS parser or a production code-evaluation path.
function evaluate(expression, values, viewport) {
  const arithmetic = expression
    .replace(/var\(--cis-(\d+)\)/g, (_, index) => {
      assert.ok(Number(index) < values.length, `Unknown calibration variable ${index}`);
      return String(values[Number(index)]);
    })
    .replace(/([\d.]+)vw\b/g, (_, number) => String(Number(number) * viewport / 100))
    .replace(/([\d.]+)px\b/g, "$1")
    .replace(/calc\(/g, "(");
  assert.match(arithmetic, /^[\d.\s()+*/-]+$/, "Only numeric calc arithmetic is accepted");
  const result = Function(`"use strict"; return (${arithmetic});`)();
  assert.ok(Number.isFinite(result));
  return result;
}

function interpolated(values, width) {
  if (width <= widths[0]) return values[0];
  if (width > widths.at(-1)) return values.at(-1);
  const upper = widths.findIndex((candidate) => width <= candidate);
  const from = upper - 1;
  return values[from] + (values[upper] - values[from])
    * ((width - widths[from]) / (widths[upper] - widths[from]));
}

test("compact calibration stores each exact measured height once per chunk", () => {
  const result = compact();
  assert.equal(result.ids.length, result.chunkCount);
  assert.equal(result.media.length, widths.length + 1);
  assert.equal(result.ruleCount, result.chunkCount + widths.length + 1);
  assert.equal(new Set(result.ids.map(([, id]) => id)).size, result.chunkCount);
  for (const [index, [, id, declarations]] of result.ids.entries()) {
    assert.equal(id, data[360].chunks[index].id);
    const expected = widths.map((width, sample) => [`--cis-${sample}`, String(data[width].chunks[index].h)]);
    assert.deepEqual(declarations.replace(/;$/, "").split(";").map((declaration) => declaration.split(":")), expected);
    assert.doesNotMatch(declarations, /calc\(|\bvw\b/, "Do not repeat interpolation arithmetic in every chunk");
  }
});

test("calibration media ranges have no fractional gaps and overlap only at measured endpoints", () => {
  const { media } = compact();
  const probes = [1, 320, 412, 1363, 1920, 4096,
    ...widths.flatMap((width) => [width - 0.005, width, width + 0.00001, width + 0.005, width + 0.01]),
    ...widths.slice(1).map((width, index) => (width + widths[index]) / 2),
  ];
  assert.equal(media.length, widths.length + 1);
  for (const width of probes)
    assert.equal(media.filter(({ condition }) => matches(condition, width)).length,
      widths.includes(width) ? 2 : 1, `Media coverage at ${width}px`);
});

test("shared CSS formulas reproduce every measured reference and interpolate without coefficient rounding", () => {
  const { media } = compact();
  assert.equal(media.length, widths.length + 1);
  const probes = [320, ...widths, 1920,
    ...widths.slice(1).flatMap((width, index) => [widths[index] + 0.005, (width + widths[index]) / 2]),
  ];
  for (let chunk = 0; chunk < data[360].chunks.length; chunk++) {
    const values = widths.map((width) => data[width].chunks[chunk].h);
    for (const width of probes) {
      const matched = media.filter(({ condition }) => matches(condition, width));
      assert.equal(matched.length, widths.includes(width) ? 2 : 1, `Media coverage at ${width}px`);
      // Every matching formula must agree, including both endpoint rules:
      // order is irrelevant, rather than one inaccurate estimate overriding another.
      for (const rule of matched) {
        const actual = evaluate(rule.expression, values, width);
        assert.ok(Math.abs(actual - interpolated(values, width)) < 1e-8,
          `${data[360].chunks[chunk].id} at ${width}px: ${actual}`);
      }
    }
  }
});

test("minified delivery retains every calibration formula and rejects unsupported media loss", async () => {
  const authored = await readFile(new URL("../src/styles/global.css", import.meta.url), "utf8");
  const { cssSource } = assembleCssSource(authored, raw);
  const delivery = deriveCssDelivery(cssSource);
  assert.equal((delivery.externalCss.match(/--cis:/g) || []).length, widths.length + 1);
  assert.equal((delivery.externalCss.match(/--cis-0:/g) || []).length, data[360].chunks.length);
  // CSSO 5 removes MQ4 range queries. Fail closed instead of quietly shipping
  // the data with none of its interpolation rules.
  assert.throws(() => deriveCssDelivery(cssSource.replace(
    "@media(max-width:360px){.render-chunk", "@media(width<=360px){.render-chunk",
  )), /calibration rules lost/);
});

test("compact calibration retains complete identity and fail-closed numeric validation", () => {
  for (const mutate of [
    (value) => { value[390].chunks.pop(); },
    (value) => { value[430].chunks[0].h = null; },
    (value) => { value[768].chunks[0].h = "4000"; },
    (value) => { value[1024].chunks[0].h = -1; },
    (value) => { value[1440].chunks[0].id = "different-chunk"; },
  ]) {
    const value = structuredClone(data);
    mutate(value);
    assert.throws(() => renderCalibrationCss(JSON.stringify(value)), /calibration/i);
  }
});
