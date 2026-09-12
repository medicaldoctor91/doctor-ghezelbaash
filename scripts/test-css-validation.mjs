import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateCssUnits } from "./lib/css-validation.mjs";
import { assertCssInputsUnchanged, extractHtmlCss } from "./lib/html-css-inputs.mjs";
import { validateCss } from "./validate-css.mjs";
import { validateBrowserCss, validateHtmlCss, validateSelectors } from "./validate-html-css.mjs";

const audit = (value) => validateCssUnits([{ label: "fixture.css", css: value }]);
const modern = ':root{--ink:green}main{container:page-shell/inline-size}@container page-shell (max-width:48rem){p{color:var(--ink)}}';
const html = (style = modern, body = "<main><p>Fixture</p></main>") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title><style>${style}</style></head><body>${body}</body></html>`;
async function fixture(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ghezelbaash-css-test-"));
  try {
    await mkdir(path.join(root, "src/styles"), { recursive: true });
    await mkdir(path.join(root, "dist/assets"), { recursive: true });
    await writeFile(path.join(root, "src/styles/global.css"), modern);
    await writeFile(path.join(root, "dist/index.html"), html());
    await writeFile(path.join(root, "dist/404.html"), html());
    await callback(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("modern CSS, descriptors, nested fallbacks and quoted delimiters are valid", () => {
  assert(audit(`${modern}@layer base;@font-face{font-family:test;src:url(/a.woff2) format("woff2");font-weight:100 900;font-display:optional}
    p::before{content:"[})";color:var(--ink,var(--unknown,red))}
    @media print{p{color:black}}@media(prefers-contrast:more){p{outline:4px solid green}}`).valid);
});

for (const [name, value, error] of [
  ["unknown property", "p{colr:red}", /Unknown property/],
  ["unknown property with var", ":root{--ink:red}p{colr:var(--ink)}", /Unknown property/],
  ["invalid value", "p{color:bleuu}", /Mismatch/],
  ["incorrect root token type", ":root{--radius:1rem}p{color:var(--radius)}", /Mismatch/],
  ["invalid suffix after variable", ":root{--ink:red}p{color:var(--ink) nonsense}", /Mismatch/],
  ["unresolved variable", "p{color:var(--missing)}", /Unresolved/],
  ["malformed variable", "p{color:var(ink)}", /Malformed var/],
  ["cyclic variables", ":root{--a:var(--b);--b:var(--a)}p{color:var(--a)}", /Cyclic/],
  ["bad fallback", ":root{--ink:red}p{color:var(--ink,1rem)}", /Mismatch/],
  ["ambiguous root token", ":root{--ink:red}:root{--ink:green}", /Ambiguous/],
  ["uncovered custom scope", "p{--ink:red}", /scope needs/],
  ["unclosed block", "p{color:red", /Unclosed/],
  ["unclosed comment", "p{color:red}/*", /Unclosed/],
  ["unclosed string", 'p{content:"red}', /Unclosed/],
  ["unclosed URL", "p{background:url(red", /Unclosed/],
  ["mismatched bracket", "p{color:red)]}", /Unbalanced/],
  ["recovered syntax", "p{color red}", /Colon|parse|expected/i],
  ["unknown at-rule", "@contaner x{p{color:red}}", /At-rule needs/],
  ["external import", '@import url("https://example.org/a.css");', /At-rule needs/],
  ["container feature typo", "@container x (max-wdth:48rem){p{color:red}}", /Query feature/],
  ["invalid container size", "@container x (max-width:banana){p{color:red}}", /Mismatch/],
  ["missing container body", "@container x (max-width:48rem);", /requires a block/],
  ["media feature typo", "@media(max-wdth:48rem){p{color:red}}", /Query feature/],
  ["invalid discrete feature", "@media(prefers-reduced-motion:banana){p{color:red}}", /Unsupported/],
  ["unknown media type", "@media screeen{p{color:red}}", /Media type/],
  ["invalid font descriptor", "@font-face{font-display:banana}", /Mismatch/],
  ["unknown font descriptor", "@font-face{font-disply:optional}", /Unknown/],
  ["font face inside a style rule", "p{@font-face{font-family:x;src:url(x)}}", /context/],
  ["style rule inside font face", "@font-face{p{color:red}}", /context|Colon is expected/],
  ["container-only feature in media", "@media(inline-size:100px){p{color:red}}", /Query feature/],
]) test(`rejects ${name}`, () => assert.throws(() => audit(value), error));

test("calibration values and every formula are independently checked", () => {
  const samples = "#rc1{" + Array.from({ length: 6 }, (_, i) => `--cis-${i}:${3000 + i}`).join(";") + "}";
  const formula = ".render-chunk{--cis:calc(var(--cis-0)*1px);contain-intrinsic-size:auto var(--cis,2800px)}";
  assert.equal(audit(samples + formula).calibrationCases, 1);
  assert.throws(() => audit(samples.replace("--cis-1:3001", "--cis-1:3001px") + formula), /unitless/);
  assert.throws(() => audit(samples.replace("--cis-1:3001;", "") + formula), /incomplete/);
  assert.throws(() => audit(samples + formula.replace("--cis-0)*", "--cis-6)*")), /Unresolved/);
  assert.throws(() => audit(samples + ".render-chunk{--cis:red}"), /Mismatch/);
  assert.throws(() => audit(formula), /no measured profiles/);
});

test("HTML projection changes only CSS ranges and preserves line positions", () => {
  const original = html("p{color:red}\n", '<main style="color: green"><p style=color:red>Fixture</p></main>');
  const result = extractHtmlCss(original, "fixture.html");
  assert.equal(result.units.length, 3);
  assert.equal(result.projection.length, original.length);
  assert.equal(result.projection.split("\n").length, original.split("\n").length);
  let cursor = 0;
  for (const range of result.ranges) {
    assert.equal(result.projection.slice(cursor, range.start), original.slice(cursor, range.start));
    cursor = range.end;
  }
  assert.equal(result.projection.slice(cursor), original.slice(cursor));
  assert.match(result.projection, /<main style=" +"><p style=;+>Fixture/);
});

test("HTML parser does not silently repair malformed markup", () => {
  assert.throws(() => extractHtmlCss(html().replace("</style>", ""), "broken.html"), /unclosed|parse error/);
  assert.throws(() => extractHtmlCss(html("p{color:red}", '<p id="x" id="y">X</p>'), "broken.html"), /duplicate-attribute/);
});

for (const kind of ["404", "attribute", "external", "noscript", "template"]) {
  test(`CSS errors are covered in ${kind}`, () => fixture(async (root) => {
    const index = path.join(root, "dist/index.html");
    if (kind === "404") await writeFile(path.join(root, "dist/404.html"), html("p{colr:red}"));
    if (kind === "attribute") await writeFile(index, html(modern, '<main style="colr:red"><p>X</p></main>'));
    if (kind === "template") await writeFile(index, html(modern, '<template><style>p{colr:red}</style></template>'));
    if (["external", "noscript"].includes(kind)) {
      await writeFile(path.join(root, "dist/assets/bad.css"), "p{colr:red}");
      let link = '<link rel="stylesheet" href="/assets/bad.css">';
      if (kind === "noscript") link = `<noscript>${link}</noscript>`;
      await writeFile(index, html().replace("</head>", `${link}</head>`));
    }
    await assert.rejects(validateCss(root), /Unknown property/);
  }));
}

test("orphan and remote CSS cannot evade the inventory", () => fixture(async (root) => {
  await writeFile(path.join(root, "dist/assets/orphan.css"), "p{color:red}");
  await assert.rejects(validateCss(root), /Unreferenced CSS/);
  await rm(path.join(root, "dist/assets/orphan.css"));
  await writeFile(path.join(root, "dist/index.html"), html().replace("</head>", '<link rel="stylesheet" href="https://example.org/a.css"></head>'));
  await assert.rejects(validateCss(root), /external CSS/);
}));

for (const attributes of ['rel="StyleSheet"', 'rel="preload" as="STYLE"'])
  test(`CSS discovery handles ASCII case: ${attributes}`, () => fixture(async (root) => {
    await writeFile(path.join(root, "dist/index.html"), html().replace("</head>", `<link ${attributes} href="https://example.org/a.css"></head>`));
    await assert.rejects(validateCss(root), /external CSS/);
  }));

for (const kind of ["source", "external", "html", "addition"])
  test(`snapshot detects concurrent ${kind} changes`, () => fixture(async (root) => {
    const file = path.join(root, "dist/assets/site.css");
    await writeFile(file, "p{color:red}");
    await writeFile(path.join(root, "dist/index.html"), html().replace("</head>", '<link rel="stylesheet" href="/assets/site.css"></head>'));
    const inputs = await validateCss(root);
    await assertCssInputsUnchanged(inputs);
    const target = kind === "source" ? "src/styles/global.css" : kind === "external" ? "dist/assets/site.css"
      : kind === "html" ? "dist/index.html" : "dist/assets/added.css";
    await writeFile(path.join(root, target), kind === "html" ? html() : "p{color:green}");
    await assert.rejects(assertCssInputsUnchanged(inputs), /changed|inventory/i);
  }));

test("the browser rejects incompatible calculation dimensions including calibration", async () => {
  const samples = "#rc1{" + Array.from({ length: 6 }, (_, i) => `--cis-${i}:${3000 + i}`).join(";") + "}";
  for (const value of ["p{width:calc(1px + 1s)}", samples + ".render-chunk{--cis:calc(var(--cis-0)*1deg);contain-intrinsic-size:auto var(--cis,2800px)}"])
    await assert.rejects(validateBrowserCss([], audit(value).browserValues), /Resolved CSS value rejected/);
});

test("existing iOS scrolling extension uses its exact documented grammar", async () => {
  await validateBrowserCss([], audit("p{-webkit-overflow-scrolling:touch}").browserValues);
  assert.throws(() => audit("p{-webkit-overflow-scrolling:banana}"), /Mismatch/);
  await assert.rejects(validateBrowserCss([], [{ property: "-webkit-overflow-scrolling", value: "banana", descriptor: null }]), /Resolved CSS value rejected/);
});

test("the pinned browser rejects selectors that the syntax parser accepts", async () => {
  await validateSelectors([":root", "p::before", ":where(p,a)", "summary::-webkit-details-marker"]);
  await assert.rejects(validateSelectors(["p:misspelled-pseudo"]), /selector rejected/);
  await assert.rejects(validateSelectors(["summary::-webkit-details-markre"]), /selector rejected/);
});

test("paired gate accepts modern CSS and leaves original bytes unchanged", () => fixture(async (root) => {
  const file = path.join(root, "dist/index.html"), before = await readFile(file);
  const report = await validateHtmlCss(root);
  assert(report.valid);
  assert.notEqual(report.documents[0].originalSha256, report.documents[0].projectionSha256);
  assert.deepEqual(await readFile(file), before);
}));

test("paired gate still rejects HTML conformance errors from Nu", () => fixture(async (root) => {
  await writeFile(path.join(root, "dist/index.html"), html(modern, '<main><img src="/x.png"></main>'));
  await assert.rejects(validateHtmlCss(root), /Nu HTML validation failed/);
}));

test("masking CSS cannot hide a style element in an invalid HTML position", () => fixture(async (root) => {
  await writeFile(path.join(root, "dist/index.html"), html(modern, '<main><style>p{color:red}</style></main>'));
  await assert.rejects(validateHtmlCss(root), /Nu HTML validation failed/);
}));
