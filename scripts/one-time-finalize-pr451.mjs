import { readFile, writeFile, unlink } from "node:fs/promises";

async function edit(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after === before) throw new Error(`${path}: expected change was not applied`);
  await writeFile(path, after, "utf8");
}
const replace = (source, oldText, newText, label = oldText.slice(0, 80)) => {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`Expected exactly one ${label}; found ${count}`);
  return source.replace(oldText, newText);
};
const replaceAllCount = (source, oldText, newText, expected) => {
  const count = source.split(oldText).length - 1;
  if (count !== expected) throw new Error(`Expected ${expected} occurrences of ${oldText}; found ${count}`);
  return source.replaceAll(oldText, newText);
};

// The Person is a fragment of the sole homepage Entity Home. Speakable uses a
// CSS selector, so it must point at the real H1 selector, not an HTTP pathname.
await edit("src/data/semantic/knowledge-graph.jsonld", (source) =>
  replace(source, '        "/saeed-ghezelbash",\n        ".section-answer",', '        "#saeed-ghezelbash",\n        ".section-answer",', "Speakable physician selector"));

for (const [path, expected] of [
  ["scripts/tests/independent-pages.test.mjs", 2],
  ["scripts/tests/page-discovery.test.mjs", 2],
  ["scripts/tests/rich-results-contract.test.mjs", 1],
  ["scripts/tests/route-discovery.test.mjs", 1],
]) {
  await edit(path, (source) => replaceAllCount(source,
    'inputs.lifecycle.canonicalUrl + "saeed-ghezelbash"',
    'inputs.lifecycle.canonicalUrl + "#saeed-ghezelbash"', expected));
}
await edit("scripts/validate-dist.mjs", (source) => replaceAllCount(source,
  'canonicalUrl + "saeed-ghezelbash"', 'canonicalUrl + "#saeed-ghezelbash"', 1));

await edit("scripts/validate-live.mjs", (source) => {
  let next = replaceAllCount(source,
    'const physicianId = canonicalOrigin + "/saeed-ghezelbash";',
    'const physicianId = canonicalOrigin + "/#saeed-ghezelbash";', 1);
  next = replace(next,
    '  const sampled = options.redirects === "sample" ? redirects.filter((row, index) => index % Math.max(1, Math.floor(redirects.length / 25)) === 0 || row.source === "/saeed-ghezelbash").slice(0, 30) : redirects;',
    '  const sampled = options.redirects === "sample" ? redirects.filter((row, index) => index % Math.max(1, Math.floor(redirects.length / 25)) === 0).slice(0, 30) : redirects;',
    "live redirect sampling");
  return next;
});

await edit("scripts/tests/live-validation.test.mjs", (source) => {
  let next = replaceAllCount(source,
    'const doctor = { "@id": origin + "/saeed-ghezelbash",',
    'const doctor = { "@id": origin + "/#saeed-ghezelbash",', 1);
  next = replace(next,
    '  rows: [{ source: "/old-answer", target: "/topic#answer", statusCode: 301 }, { source: "/saeed-ghezelbash", target: "/#saeed-ghezelbash", statusCode: 301 }, { source: "/entity", target: "/graph.jsonld", statusCode: 200 }],',
    '  rows: [{ source: "/old-answer", target: "/topic#answer", statusCode: 301 }, { source: "/old-profile", target: "/#saeed-ghezelbash", statusCode: 301 }, { source: "/entity", target: "/graph.jsonld", statusCode: 200 }],',
    "fixture redirect row");
  next = replace(next,
    '  assert.deepEqual(actual.rows.find((row) => row.source === "/saeed-ghezelbash"),\n    { source: "/saeed-ghezelbash", target: "/#saeed-ghezelbash", statusCode: 301 });\n  assert.deepEqual(fragments.find((row) => row.source === "/saeed-ghezelbash"),\n    { source: "/saeed-ghezelbash", target: "/#saeed-ghezelbash" });',
    '  assert(!actual.rows.some((row) => row.source === "/saeed-ghezelbash"));\n  assert(!fragments.some((row) => row.source === "/saeed-ghezelbash"));',
    "phantom path live-plan assertions");
  return next;
});

await edit("scripts/tests/url-architecture.test.mjs", (source) => {
  const oldBlock = `test("the homepage owns physician authority while the stable identity remains an addressable reading fragment", () => {\n  assert(!canonicalPaths().includes("/saeed-ghezelbash"));\n  assert.equal(urlForHtmlId("saeed-ghezelbash"), "/#saeed-ghezelbash");\n  assert.equal(resolveContentUrl("/saeed-ghezelbash"), "/#saeed-ghezelbash");\n  assert.equal(sourceNavigationUrl("/saeed-ghezelbash"), "/#saeed-ghezelbash");\n  assert.deepEqual(redirectRows().find((row) => row.source === "/saeed-ghezelbash"),\n    { source: "/saeed-ghezelbash", target: "/#saeed-ghezelbash", statusCode: 301 });\n  assert.equal(resolveContentUrl("/saeed-ghezelbash?from=profile"), "/?from=profile#saeed-ghezelbash");\n  assert.equal(sourceNavigationUrl("/saeed-ghezelbash?from=profile"), "/?from=profile#saeed-ghezelbash");\n  const doctor = inputs.graph["@graph"].find((node) => node["@id"] === inputs.lifecycle.primaryEntity.id);\n  assert.equal(doctor["@id"], inputs.lifecycle.canonicalUrl + "saeed-ghezelbash");\n  assert.equal(doctor.url, inputs.lifecycle.canonicalUrl);\n});`;
  const newBlock = `test("the homepage owns physician authority and the artificial physician pathname does not exist", () => {\n  const physicianId = inputs.lifecycle.canonicalUrl + "#saeed-ghezelbash";\n  const oldPhysicianId = inputs.lifecycle.canonicalUrl + "saeed-ghezelbash";\n  assert(!canonicalPaths().includes("/saeed-ghezelbash"));\n  assert.equal(urlForHtmlId("saeed-ghezelbash"), "/#saeed-ghezelbash");\n  assert(!URL_ARCHITECTURE.decisions.some((row) => row.path === "/saeed-ghezelbash"));\n  assert(!redirectRows().some((row) => row.source === "/saeed-ghezelbash"));\n  assert(!fragmentRows().some((row) => row.source === "/saeed-ghezelbash"));\n  const doctor = inputs.graph["@graph"].find((node) => node["@id"] === inputs.lifecycle.primaryEntity.id);\n  assert.equal(inputs.lifecycle.primaryEntity.id, physicianId);\n  assert.equal(doctor["@id"], physicianId);\n  assert.equal(doctor.url, inputs.lifecycle.canonicalUrl);\n  assert.equal(doctor.mainEntityOfPage?.["@id"], inputs.lifecycle.canonicalUrl + "webpage");\n  assert(!JSON.stringify(inputs.graph).includes(JSON.stringify(oldPhysicianId)));\n  assert(inspected.headings.some((node) => node.tagName === "h1" && node.attrs?.some((item) => item.name === "id" && item.value === "saeed-ghezelbash")));\n  assert(!inputs.pageBody.includes('href="/saeed-ghezelbash"'));\n  assert(!inputs.pageBody.includes('href="https://www.ghezelbaash.ir/saeed-ghezelbash"'));\n  assert(!inputs.pageBody.includes('href="/#saeed-ghezelbash"'));\n});`;
  return replace(source, oldBlock, newBlock, "physician URL architecture test block");
});

await edit("scripts/validate-live-public.mjs", (source) => {
  let next = replace(source,
    '    removedDevelopmentAliases: policy.developmentAliases.length,',
    '    removedDevelopmentPaths: policy.removedDevelopmentPaths.length,',
    "public live count");
  next = replace(next,
    'const removedChecks = [];\nlet next = 0;\nawait Promise.all(\n  Array.from(\n    { length: Math.min(options.concurrency, policy.developmentAliases.length) },\n    async () => {\n      while (next < policy.developmentAliases.length) {\n        const alias = policy.developmentAliases[next++];\n        const record = { path: alias.source, ok: false };',
    'const removedChecks = [];\nconst removedPaths = policy.removedDevelopmentPaths;\nlet next = 0;\nawait Promise.all(\n  Array.from(\n    { length: Math.min(options.concurrency, removedPaths.length) },\n    async () => {\n      while (next < removedPaths.length) {\n        const source = removedPaths[next++];\n        const record = { path: source, ok: false };',
    "removed path worker setup");
  next = replaceAllCount(next, 'new URL(alias.source, options.origin)', 'new URL(source, options.origin)', 1);
  next = replaceAllCount(next, '`Removed development URL is still publicly routable: ${alias.source} -> ${response.status}`', '`Removed development URL is still publicly routable: ${source} -> ${response.status}`', 1);
  next = replaceAllCount(next, '`Removed development URL still redirects: ${alias.source}`', '`Removed development URL still redirects: ${source}`', 1);
  next = replace(next,
    '  expectedAbsent: policy.developmentAliases.length,',
    '  expectedAbsent: removedPaths.length,',
    "removed path report count");
  return next;
});

await edit("README.md", (source) => {
  let next = replace(source,
    "The homepage is the primary `ProfilePage` and also a `MedicalWebPage` containing the physician's authored clinical portfolio. Its page IRI is `https://www.ghezelbaash.ir/webpage`; its main entity is the persistent `https://www.ghezelbaash.ir/saeed-ghezelbash` (`Person` and `IndividualPhysician`). The physician's `url` is the homepage and `mainEntityOfPage` points to that homepage page IRI. The entity IRI stays stable when document URLs change. `/saeed-ghezelbash` permanently redirects to `/#saeed-ghezelbash`; it is not a second physician ProfilePage.",
    "The homepage is the primary `ProfilePage` and also a `MedicalWebPage` containing the physician's authored clinical portfolio. Its page IRI is `https://www.ghezelbaash.ir/webpage`; its main entity is the persistent `https://www.ghezelbaash.ir/#saeed-ghezelbash` (`Person` and `IndividualPhysician`). The physician's `url` is the homepage and `mainEntityOfPage` points to that homepage page IRI. The H1 owns the `saeed-ghezelbash` fragment. The development-only HTTP pathname `/saeed-ghezelbash` is intentionally nonexistent: it is not a page, redirect, legacy alias or machine representation.",
    "README physician identity paragraph");
  next = replace(next,
    "The URL policy currently declares 72 KEEP decisions and 1,057 permanent redirects, with final owners for all 1,455 compiled HTML IDs (1,454 authored IDs plus the main wrapper), including preserved aliases and the medical-review note. A kept path has physical HTML, a self canonical, a distinct initial content scope and contextual native links. A merged path redirects directly to its retained owner's actual fragment. `url-architecture.mjs` validates coverage, resource uniqueness, retired paths and fragments, and resolves content references for all consumers. Adding a heading does not grant it an independent page.",
    "The source URL architecture declares 72 KEEP decisions and 1,056 consolidation decisions, with final owners for all 1,455 compiled HTML IDs (1,454 authored IDs plus the main wrapper), including the medical-review note. Those 1,056 consolidation rows are internal source topology, not a promise to publish permanent HTTP redirects. Together with 125 generated `answer-*` aliases, 1,181 generated development aliases are pruned from deployable `_redirects`; the separately forbidden `/saeed-ghezelbash` phantom path is never generated, bringing the reviewed development-created public paths removed from the base state to 1,182. A kept path has physical HTML, a self canonical and a distinct initial content scope. `url-architecture.mjs` validates coverage, resource uniqueness, retired paths and fragments. Adding a heading does not grant it an independent page or public redirect.",
    "README URL policy paragraph");
  next = replace(next,
    "Authored browser links to subordinate sections use `/#id` to retain the continuous reader. Historical requests to their former `/id` paths still receive the reviewed 301 to the canonical owner and fragment. These are separate consumers of one publication policy: changing internal navigation to root fragments must not erase HTTP redirects for existing external links or the persistent physician IRI.",
    "Authored same-document browser links use `#id`, including `#saeed-ghezelbash`; generated reader navigation may use `/#id` when it needs an explicit root document. Development-only consolidation paths are not public aliases after pruning. Only explicitly retained historical aliases in `src/data/redirects.json` receive public redirects to reviewed final destinations. Entity IRIs are independent of HTTP alias policy.",
    "README internal navigation paragraph");
  next = replace(next,
    '`node scripts/validate-live.mjs --expected-commit <full-deployed-SHA>` checks every canonical document\'s commit, release, branch and provider against the deployment fingerprint as well as its robots directives, graph and canonical. It also checks every registered historical redirect and machine representation.',
    '`npm run validate:live -- --expected-commit <full-deployed-SHA>` checks every canonical document\'s commit, release, branch and provider against the deployment fingerprint as well as its robots directives, graph and canonical. It also checks every retained historical redirect and machine representation, and requires all 1,182 development-created paths removed by this cleanup—including the never-published `/saeed-ghezelbash` pathname—to return 404/410 with no redirect.',
    "README live validation command");
  return next;
});

await edit("docs/architecture-2026.md", (source) => {
  let next = replace(source,
    "The reviewed URL policy retains **72 canonical HTML resources**: home plus 71 focused resources. It merges 1,057 old heading/document paths into direct 301 destinations with their original fragments. All 1,455 compiled HTML IDs (1,454 authored IDs plus the main wrapper) have final owners. The policy is explicit in `src/data/url-architecture.json`, validated by `src/lib/url-architecture.mjs`, and consumed by page discovery, reader navigation, redirects and machine citations. A new ID never automatically grants a new indexable URL.",
    "The reviewed URL policy retains **72 canonical HTML resources**: home plus 71 focused resources. Source topology contains 1,056 consolidation decisions for subordinate authored paths; those are not published as permanent redirects. Together with 125 generated Answer aliases, 1,181 generated development aliases are pruned from deployable `_redirects`, while the separately forbidden `/saeed-ghezelbash` phantom pathname is never generated. All 1,455 compiled HTML IDs (1,454 authored IDs plus the main wrapper) still have final owners. The policy is explicit in `src/data/url-architecture.json`, validated by `src/lib/url-architecture.mjs`, and consumed by page discovery, reader navigation and machine citations. A new ID never automatically grants a new indexable URL or redirect.",
    "architecture URL policy paragraph");
  next = replace(next,
    "The homepage is both `ProfilePage` and `MedicalWebPage`: it is the primary public physician profile and the entry to his authored clinical portfolio. `/saeed-ghezelbash` redirects to `/#saeed-ghezelbash`. The physician entity keeps the persistent IRI `https://www.ghezelbaash.ir/saeed-ghezelbash`; its navigable `url` is home and `mainEntityOfPage` is `https://www.ghezelbaash.ir/webpage`. Document relocation does not replace the entity's identity.",
    "The homepage is both `ProfilePage` and `MedicalWebPage`: it is the primary public physician profile and Entity Home for the authored clinical portfolio. The physician entity IRI is `https://www.ghezelbaash.ir/#saeed-ghezelbash`; its navigable `url` is home and `mainEntityOfPage` is `https://www.ghezelbaash.ir/webpage`. The H1 owns that fragment. The HTTP pathname `/saeed-ghezelbash` is intentionally nonexistent and has no redirect or alternate representation.",
    "architecture identity paragraph");
  next = replace(next,
    "Browser section navigation retains `/#id` links in the comprehensive reader. Incoming historical `/id` requests independently follow their reviewed 301 decisions to the retained owner and exact fragment. All 1,057 decisions are compiled into HTTP rules; a source-navigation preference cannot silently turn a former public path or the physician IRI into a 404. Live checks compare the build identity in every canonical HTML response, since a fresh deployment manifest cannot detect an older document cached at another URL.",
    "Same-document authored links use `#id`; reader navigation may use `/#id` when it explicitly targets the root document. Development-only consolidation and Answer paths are removed from the public redirect table, while explicitly retained historical aliases continue to resolve to reviewed final destinations. The physician fragment IRI remains valid because it identifies an element on the homepage; the unrelated HTTP pathname `/saeed-ghezelbash` must remain 404/410. Live checks compare the build identity in every canonical HTML response and verify removed development paths stay absent.",
    "architecture delivery paragraph");
  return next;
});

await edit("docs/final-audit-2026-10-04.md", (source) => replace(source,
  "- هوم پروفایل اصلی پزشک با `ProfilePage` و `MedicalWebPage` است. هویت پایدار پزشک `/saeed-ghezelbash`، URL عمومی او `/` و IRI سند اصلی `/webpage` باقی مانده‌اند. تغییر مسیر سند، هویت پزشک را عوض نمی‌کند.",
  "- هوم پروفایل اصلی و Entity Home پزشک با `ProfilePage` و `MedicalWebPage` است. هویت پایدار پزشک `/#saeed-ghezelbash`، URL عمومی او `/` و IRI سند اصلی `/webpage` است. مسیر توسعه‌ای `/saeed-ghezelbash` صفحه یا alias تاریخی نبوده و بدون ریدایرکت از سطح عمومی حذف شده است.",
  "final audit identity line"));

console.log("PR #451 source/test/documentation finalization applied");
await unlink("scripts/one-time-finalize-pr451.mjs");
await unlink(".github/workflows/one-time-finalize-pr451.yml");
