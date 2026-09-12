import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertCssInputsUnchanged, digest } from "./lib/html-css-inputs.mjs";
import { validateCss } from "./validate-css.mjs";

export async function validateBrowserCss(selectors, values = []) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const invalid = await page.evaluate((values) => values.filter((value) => {
      if (CSS.supports(`selector(${value})`)) return false;
      // Safari's existing details-marker alias is intentionally not supported
      // by Chromium. Validate its exact spelling and the remaining selector
      // against its standard ::marker counterpart; no vendor wildcard bypass.
      return !value.endsWith("::-webkit-details-marker") ||
        !CSS.supports(`selector(${value.replace(/::-webkit-details-marker$/, "::marker")})`);
    }), selectors);
    assert.deepEqual(invalid, [], "CSS selector rejected by the pinned Chromium");
    const invalidValues = await page.evaluate((entries) => entries.filter(({ property, value, descriptor }) => {
      // Existing iOS extension: Apple's exact two-keyword grammar, already also
      // checked by CSS-tree. Chromium does not implement this Safari property.
      if (!descriptor && property === "-webkit-overflow-scrolling") return !["auto", "touch"].includes(value);
      if (!descriptor) return !CSS.supports(property, value);
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(`@${descriptor}{${property}:${value}}`);
      return !sheet.cssRules[0]?.style.getPropertyValue(property);
    }), values);
    assert.deepEqual(invalidValues, [], "Resolved CSS value rejected by the pinned Chromium");
    return { browser: browser.version(), selectors: selectors.length,
      resolvedValues: values.length,
      safariScrollingValues: values.filter(({ property }) => property === "-webkit-overflow-scrolling"),
      safariMarkerAliases: selectors.filter((value) => value.endsWith("::-webkit-details-marker")) };
  } finally { await browser.close(); }
}

export const validateSelectors = (selectors) => validateBrowserCss(selectors);

export async function validateHtmlCss(root = process.cwd(), directory = "dist") {
  // No error filters or exit-code overrides: both languages must pass their
  // checker. Nu lacks container-query support and a CSS-only disable switch.
  const inputs = await validateCss(root, directory);
  const { documents, selectors, browserValues, report } = inputs;
  const browserReport = await validateBrowserCss(selectors, browserValues);
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ghezelbaash-html-css-"));
  try {
    const projections = [];
    for (const [index, document] of documents.entries()) {
      const file = path.join(temporary, `${index}-${path.basename(document.file)}`);
      await writeFile(file, document.projection);
      projections.push(file);
    }
    const nu = spawnSync("npx", ["--yes", "--package=vnu-jar@26.8.30", "vnu", "--errors-only", ...projections],
      { cwd: root, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
    if (nu.stdout) process.stdout.write(nu.stdout);
    if (nu.stderr) process.stderr.write(nu.stderr);
    if (nu.error) throw nu.error;
    assert.equal(nu.status, 0, `Nu HTML validation failed (exit ${nu.status})`);
    await assertCssInputsUnchanged(inputs);
    return { ...report, browserReport, inventory: inputs.inventory, snapshots: inputs.snapshots,
      htmlChecker: "Nu 26.8.30 on CSS-masked HTML; original CSS independently validated",
      documents: documents.map((d) => ({ file: d.label, originalSha256: d.sha256, projectionSha256: digest(d.projection) })) };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(await validateHtmlCss(process.cwd(), process.argv[2] || "dist"), null, 2));
