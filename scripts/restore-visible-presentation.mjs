import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalLifecycle as release, canonicalGraph } from "../src/lib/canonical-inputs.mjs";
import { deriveSiteContactData } from "../src/lib/site-data.mjs";
import { restoreVisibleCss, restoreVisiblePresentation } from "./lib/visible-presentation.mjs";

const root = "dist";
const site = deriveSiteContactData(release, canonicalGraph);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

let htmlChanged = 0, cssChanged = 0;
for (const file of await walk(root)) {
  if (!file.endsWith(".html") && !file.endsWith(".css")) continue;
  const before = await readFile(file, "utf8");
  const after = file.endsWith(".html")
    ? restoreVisiblePresentation(before, { mapsUrl: site.mapsUrl })
    : restoreVisibleCss(before);
  if (after === before) continue;
  await writeFile(file, after);
  if (file.endsWith(".html")) htmlChanged++;
  else cssChanged++;
}
console.log(JSON.stringify({ visiblePresentation: "PASS", htmlChanged, cssChanged }));
