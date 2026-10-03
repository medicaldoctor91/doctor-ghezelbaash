import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { datasetId } from "../../src/config/site-policy.mjs";

const inputs = readCanonicalInputs();
const graphFixture = async (run) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "canonical-graph-"));
  const graph = structuredClone(inputs.graph);
  const byId = new Map(graph["@graph"].map((node) => [node["@id"], node]));
  const dataset = byId.get(datasetId);
  const graphFile = path.join(root, "src/data/semantic/knowledge-graph.jsonld");
  const save = () => writeFile(graphFile, JSON.stringify(graph));
  try {
    await mkdir(path.join(root, "src/content-source"), { recursive: true });
    await mkdir(path.join(root, "src/data/semantic"), { recursive: true });
    await writeFile(path.join(root, "src/content-source/page.md"), inputs.pageBody);
    await run({ root, graph, byId, dataset, save });
  } finally { await rm(root, { recursive: true, force: true }); }
};

test("evidence assessment loader follows the Dataset pointer despite other assessment collections", async () => {
  await graphFixture(async ({ root, graph, byId, dataset, save }) => {
    const registry = byId.get(dataset.evidenceAssessmentRegistry["@id"]);
    graph["@graph"].unshift({
      ...registry, "@id": "https://example.test/unrelated-assessment-collection", dateModified: "1900-01-01",
    });
    await save();
    const loaded = readCanonicalInputs(root);
    assert.equal(loaded.evidenceRegistry.registryNode["@id"], registry["@id"]);
    assert.deepEqual(loaded.evidenceRegistry.evidence, inputs.evidenceRegistry.evidence);
    assert.equal(loaded.evidenceRegistry.verifiedAt, inputs.evidenceRegistry.verifiedAt);
  });
});

test("missing, unresolved and ambiguous Dataset evidence registry pointers fail without heuristic fallback", async () => {
  await graphFixture(async ({ root, graph, byId, dataset, save }) => {
    const pointer = dataset.evidenceAssessmentRegistry;
    delete dataset.evidenceAssessmentRegistry;
    await save();
    assert.throws(() => readCanonicalInputs(root), /one linked evidence assessment collection/);
    dataset.evidenceAssessmentRegistry = { "@id": "https://example.test/missing-registry" };
    await save();
    assert.throws(() => readCanonicalInputs(root), /registry reference is missing/);
    dataset.evidenceAssessmentRegistry = [pointer, { "@id": "https://example.test/missing-registry" }];
    await save();
    assert.throws(() => readCanonicalInputs(root), /registry reference is missing/);
    graph["@graph"].push({ ...byId.get(pointer["@id"]), "@id": "https://example.test/second-registry" });
    dataset.evidenceAssessmentRegistry = [pointer, { "@id": "https://example.test/second-registry" }];
    await save();
    assert.throws(() => readCanonicalInputs(root), /one linked evidence assessment collection/);
  });
});

test("the linked evidence registry must be a collection with assessments", async () => {
  await graphFixture(async ({ root, byId, dataset, save }) => {
    const registry = byId.get(dataset.evidenceAssessmentRegistry["@id"]);
    const originalType = registry["@type"];
    registry["@type"] = "CreativeWork";
    await save();
    assert.throws(() => readCanonicalInputs(root), /registry must be a collection/);
    registry["@type"] = originalType;
    registry.hasPart = [{ "@id": "https://example.test/missing-assessment" }];
    await save();
    assert.throws(() => readCanonicalInputs(root), /registry member is missing/);
    registry.hasPart = [{ "@id": dataset["@id"] }];
    await save();
    assert.throws(() => readCanonicalInputs(root), /registry has no assessments/);
  });
});

test("typed graph dates and plain dates yield the same scalar lifecycle without changing graph values", async () => {
  await graphFixture(async ({ root, graph, save }) => {
    const date = { "@value": "2026-10-03", "@type": "http://www.w3.org/2001/XMLSchema#date" };
    for (const node of graph["@graph"]) for (const key of ["dateModified", "datePublished"])
      if (Object.hasOwn(node, key)) node[key] = { ...date };
    await save();
    const typed = readCanonicalInputs(root);
    for (const value of [typed.lifecycle.dateModified, typed.lifecycle.datasetRevisionDate,
      typed.lifecycle.currentSource.dateModified, typed.evidenceRegistry.verifiedAt,
      ...typed.lifecycle.dataset.zenodo.releaseHistory.map((entry) => entry.publicationDate)])
      assert.equal(value, date["@value"]);
    assert.deepEqual(typed.graph["@graph"].find((node) => node["@id"] === datasetId).dateModified, date);
    for (const node of graph["@graph"]) for (const key of ["dateModified", "datePublished"])
      if (Object.hasOwn(node, key)) node[key] = date["@value"];
    await save();
    const plain = readCanonicalInputs(root);
    assert.deepEqual(plain.lifecycle, typed.lifecycle);
    assert.equal(plain.evidenceRegistry.verifiedAt, typed.evidenceRegistry.verifiedAt);
  });
});
