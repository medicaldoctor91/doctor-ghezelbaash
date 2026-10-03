import assert from "node:assert/strict";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { canonicalLifecycle } from "../src/lib/canonical-inputs.mjs";
import { routeDocumentFile } from "./lib/independent-pages.mjs";
import { renderStaticRewrites } from "./lib/redirect-registry.mjs";

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] || "dist");
const records = JSON.parse(await readFile(path.join(root, ".generated/independent-pages.json"), "utf8"));
const byPath = new Map(records.map((record) => [record.path, record]));
assert.equal(byPath.size, records.length, "Final redirect validation requires unique route records");
const source = await readFile(path.join(dist, "_redirects"), "utf8");
const rows = source.split(/\r?\n/u).filter(Boolean).map((line, index) => {
  const parts = line.trim().split(/\s+/u);
  assert.equal(parts.length, 3, `Invalid final _redirects line ${index + 1}`);
  const statusCode = Number(parts[2]);
  assert(Number.isInteger(statusCode), `Invalid final redirect status at line ${index + 1}`);
  return { source: parts[0], target: parts[1], statusCode };
});
assert.equal(renderStaticRewrites(rows), source.endsWith("\n") ? source : source + "\n",
  "Final _redirects must be canonical and duplicate-free");

let permanent = 0, promotedContentTargets = 0;
for (const row of rows) {
  const targetUrl = new URL(row.target, canonicalLifecycle.canonicalUrl);
  if ([301, 308].includes(row.statusCode)) {
    permanent++;
    const record = byPath.get(targetUrl.pathname);
    if (record) {
      promotedContentTargets++;
      assert.equal(record.indexable, true,
        `Permanent redirect must terminate on the promoted surface: ${row.source} -> ${row.target}`);
    }
  }
  const file = targetUrl.pathname === "/" ? "index.html"
    : byPath.has(targetUrl.pathname) ? routeDocumentFile(targetUrl.pathname)
    : targetUrl.pathname.slice(1);
  assert((await stat(path.join(dist, file)).catch(() => null))?.isFile(),
    `Final redirect target must be deployed: ${row.source} -> ${row.target}`);
}
console.log(JSON.stringify({
  finalRedirectValidation: "PASS",
  rules: rows.length,
  permanent,
  promotedContentTargets,
  noindexPermanentTargets: 0,
}, null, 2));
