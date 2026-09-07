import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalHostRedirectRows,
  loadRedirectRegistry,
  renderCanonicalHostRedirects,
} from "./lib/redirect-registry.mjs";

const rule = (source, target = "/#botox") => ({
  source,
  target,
  statusCode: 301,
});
const registryFor = (rules) => ({
  canonicalOrigin: "https://www.ghezelbaash.ir",
  canonicalHostRedirects: { host: "www.ghezelbaash.ir", rules },
});

test("known legacy URLs resolve directly to the same passage in both slash forms", async () => {
  const registry = await loadRedirectRegistry();
  const original = structuredClone(registry);
  const rows = canonicalHostRedirectRows(registry);
  const bySource = new Map(rows.map((row) => [row.source, row]));
  assert.equal(bySource.size, rows.length);
  for (const [source, target] of [
    ["/services", "/#aesthetic-treatment-selection"],
    ["/subcision-kermanshah", "/#acne-pigmentation-and-scars"],
    ["/contact", "/#saeed-ghezelbash-clinic-contact-and-location"],
    ["/thread-lift-kermanshah", "/#thread-lift"],
    ["/category/درمان-اسکار", "/#acne-pigmentation-and-scars"],
    ["/kg", "/graph.jsonld"],
  ]) {
    assert.deepEqual(bySource.get(source), rule(source, target));
    assert.deepEqual(bySource.get(`${source}/`), rule(`${source}/`, target));
  }
  for (const declared of registry.canonicalHostRedirects.rules) {
    assert.deepEqual(bySource.get(declared.source), declared);
    if (declared.source.endsWith("/"))
      assert.deepEqual(
        bySource.get(declared.source.slice(0, -1)),
        { ...declared, source: declared.source.slice(0, -1) },
      );
  }
  for (const row of rows) {
    assert.doesNotMatch(row.source, /[*:]/u);
    assert.equal(bySource.has(new URL(row.target, registry.canonicalOrigin).pathname), false);
  }
  for (const source of ["/", "/__unknown_redirect_test__", "/2025/02/blog-post_57.html"])
    assert.equal(bySource.has(source), false);
  assert.deepEqual(registry, original);
  assert.equal(renderCanonicalHostRedirects(registry), renderCanonicalHostRedirects(original));
});

test("existing matching pairs stay unique and retain their declared order", () => {
  const rules = [rule("/services"), rule("/services/"), rule("/contact/")];
  assert.deepEqual(canonicalHostRedirectRows(registryFor(rules)), [
    ...rules,
    rule("/contact"),
  ]);
});

test("conflicting explicit slash variants fail before publishing", () => {
  const rules = [rule("/services/"), rule("/services", "/#filler")];
  for (const ordered of [rules, rules.toReversed()])
    assert.throws(
      () => canonicalHostRedirectRows(registryFor(ordered)),
      /trailing-slash aliases disagree/,
    );
});

test("alias expansion does not redirect root, invent file variants or shadow a canonical target", () => {
  const rules = [
    rule("/", "/"),
    rule("/index.html", "/"),
    rule("/kg/graph.jsonld", "/graph.jsonld"),
    rule("/graph.jsonld/", "/graph.jsonld"),
    rule("/legacy/*/"),
    rule("/legacy/:slug/"),
  ];
  assert.deepEqual(canonicalHostRedirectRows(registryFor(rules)), rules);
});
