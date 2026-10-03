import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, access } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import * as policy from "../../src/config/site-policy.mjs";
import { machineResourcePolicy } from "../../src/config/machine-resources.mjs";
import { MACHINE_RESOURCES } from "../../src/lib/resources.mjs";
import { loadProjectionContext } from "../lib/projection-context.mjs";

const root = process.cwd();

test("canonical loader reads only body and graph, rejecting metadata in the content file", async () => {
  const inputs = readCanonicalInputs();
  const source = await readFile(path.join(root, "src/content-source/page.md"), "utf8");
  assert(/^\s*</u.test(source), "Canonical page is authored HTML");
  assert.equal(inputs.pageBody, source);
  assert.deepEqual(Object.keys(inputs).sort(), ["evidenceRegistry", "graph", "lifecycle", "pageBody", "pageJsonLd"]);
  const fixture = await mkdtemp(path.join(os.tmpdir(), "body-only-source-"));
  try {
    await mkdir(path.join(fixture, "src/content-source"), { recursive: true });
    await writeFile(path.join(fixture, "src/content-source/page.md"), '---\ntitle: hidden configuration\n---\n<header>Body</header>');
    assert.throws(() => readCanonicalInputs(fixture), /only authored HTML/);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});

test("additional historical Datasets cannot replace the explicit current Dataset bootstrap", async () => {
  const inputs = readCanonicalInputs();
  const dataset = inputs.graph["@graph"].find((node) => node["@id"] === policy.datasetId);
  const alternate = { ...dataset, "@id": "https://example.test/historical-dataset", version: "999.0", url: "https://example.test/" };
  const graph = { ...inputs.graph, "@graph": [alternate, ...inputs.graph["@graph"]] };
  const fixture = await mkdtemp(path.join(os.tmpdir(), "dataset-bootstrap-"));
  try {
    await mkdir(path.join(fixture, "src/content-source"), { recursive: true });
    await mkdir(path.join(fixture, "src/data/semantic"), { recursive: true });
    await writeFile(path.join(fixture, "src/content-source/page.md"), inputs.pageBody);
    const graphFile = path.join(fixture, "src/data/semantic/knowledge-graph.jsonld");
    await writeFile(graphFile, JSON.stringify(graph));
    assert.deepEqual(readCanonicalInputs(fixture).lifecycle, inputs.lifecycle);
    graph["@graph"] = graph["@graph"].filter((node) => node["@id"] !== policy.datasetId);
    await writeFile(graphFile, JSON.stringify(graph));
    assert.throws(() => readCanonicalInputs(fixture), /Dataset pointer is missing/);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});

test("production consumers and direct dependencies cannot restore legacy metadata or graph wrappers", async () => {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert(!packageJson.dependencies?.["js-yaml"] && !packageJson.devDependencies?.["js-yaml"]);
  for (const file of ["src/lib/knowledge-graph.ts", "src/lib/semantic-projection.mjs"])
    await assert.rejects(access(path.join(root, file)), { code: "ENOENT" });
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "tests") await visit(file); }
      else if (/\.(mjs|js|ts|astro)$/u.test(entry.name)) {
        const source = await readFile(file, "utf8");
        assert(!/\bpageFrontmatter\b/u.test(source), "Legacy metadata object: " + file);
        assert(!/semantic-projection/u.test(source), "Legacy semantic wrapper: " + file);
        assert(!/(?:from\s*|import\s*\()\s*["'][^"']*\/(?:knowledge-graph(?:\.ts)?|js-yaml)["']/u.test(source), "Legacy dependency import: " + file);
        assert(!/(?:from\s*|import\s*\()\s*["']js-yaml["']/u.test(source), "Direct YAML dependency: " + file);
      }
    }
  };
  await visit(path.join(root, "src"));
  await visit(path.join(root, "scripts"));
});

test("policy contains no duplicated page facts and projections read separate editorial prose", async () => {
  for (const field of ["description", "canonical", "author", "authorId", "publisher", "publisherId", "dateModified", "lastReviewed", "schemaVersion", "socialImage", "pageMicrodata", "knowledgeGraph"])
    assert(!Object.hasOwn(policy.documentPolicy, field) && !Object.hasOwn(policy, field), "Graph fact duplicated in policy: " + field);
  const inputs = readCanonicalInputs(), byId = new Map(inputs.graph["@graph"].map((node) => [node["@id"], node]));
  for (const resource of machineResourcePolicy.filter((node) => node.distributionIri)) {
    assert.equal(resource.mediaType, undefined);
    assert.equal(MACHINE_RESOURCES.find((node) => node.path === resource.path).mediaType, byId.get(resource.distributionIri).encodingFormat);
  }
  const context = await loadProjectionContext();
  assert.equal(context.llmsGuide, await readFile(path.join(root, "src/content-source/llms-guide.md"), "utf8"));
  assert.deepEqual(context.retrievalPolicy.languages, byId.get(policy.datasetId).inLanguage);
  assert(!Object.hasOwn(context, "pageFrontmatter"));
});
