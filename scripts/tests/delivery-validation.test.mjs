import test from "node:test";
import assert from "node:assert/strict";
import { assertSingleHopDelivery, assertFinalNativeUrl, assertPublishedFragment, assertPhysicalHtmlSurface } from "../lib/delivery-validation.mjs";

const origin = "https://www.ghezelbaash.ir";
const base = origin + "/";

test("delivery validation checks final pathnames rather than fragment-bearing filenames", () => {
  assert.doesNotThrow(() => assertSingleHopDelivery([
    { source: "/old-answer", target: "/botox#answer-onset", statusCode: 301 },
    { source: "/ontology/*", target: "/graph.jsonld", statusCode: 200 },
  ], base));
  assert.throws(() => assertSingleHopDelivery([
    { source: "/old-answer", target: "/old-topic#answer-onset", statusCode: 301 },
    { source: "/old-topic", target: "/botox", statusCode: 301 },
  ], base), /Delivery chain/);
  assert.throws(() => assertSingleHopDelivery([
    { source: "/old-entity", target: "/ontology/term", statusCode: 301 },
    { source: "/ontology/*", target: "/graph.jsonld", statusCode: 200 },
  ], base), /Delivery chain/);
});

test("native links reject aliases and preserve a valid final URL with its fragment", () => {
  const options = { canonicalOrigin: origin, rows: [{ source: "/old-answer", target: "/botox#answer-onset", statusCode: 301 }], resolveContentUrl: (value) => value };
  assert.throws(() => assertFinalNativeUrl("/old-answer", base, options), /final URL/);
  const url = assertFinalNativeUrl("/botox#answer-onset", base, options);
  assert.equal(url.pathname, "/botox");
  assert.equal(url.hash, "#answer-onset");
  assert.throws(() => assertFinalNativeUrl("/botox#old-heading", base, { ...options, resolveContentUrl: () => origin + "/botox#answer-onset" }), /canonical content owner/);
});

test("a fragment must exist in the actual initial focused target, not merely somewhere on home", () => {
  const url = new URL("/botox#answer-onset", base);
  assert.doesNotThrow(() => assertPublishedFragment(url, new Set(["answer-onset"])));
  assert.throws(() => assertPublishedFragment(url, new Set(["other-answer"])), /actual target document/);
  assert.throws(() => assertPublishedFragment(url, undefined), /actual target document/);
  assert.throws(() => assertPublishedFragment(new URL("/botox#%E0%A4", base), new Set()), /fragment encoding/);
});

test("physical HTML must equal the finite canonical corpus plus the authored 404 document", () => {
  assert.doesNotThrow(() => assertPhysicalHtmlSurface(["index.html", "404.html", "botox.html"], ["/", "/botox"]));
  assert.throws(() => assertPhysicalHtmlSurface(["index.html", "404.html", "botox.html", "old-topic.html"], ["/", "/botox"]), /finite canonical corpus/);
  assert.throws(() => assertPhysicalHtmlSurface(["index.html", "404.html"], ["/", "/botox"]), /finite canonical corpus/);
});
