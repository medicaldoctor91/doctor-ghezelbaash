import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { MACHINE_RESOURCES } from "../../src/lib/resources.mjs";
import { canonicalShapeDocument, compileShacl } from "../lib/shacl-projection.mjs";

const { graph } = readCanonicalInputs();
const supplement = await readFile("src/data/semantic/shapes-supplement.ttl", "utf8");
const distributionIris = MACHINE_RESOURCES.filter((resource) => resource.descriptorRoles.includes("dcat")).map((resource) => resource.distributionIri);
const byId = new Map(graph["@graph"].map((node) => [node["@id"], node]));
const origin = "https://www.ghezelbaash.ir/";

test("SHACL projection preserves every authored constraint without copying target facts", () => {
  const before = JSON.stringify(graph);
  const document = canonicalShapeDocument(graph);
  const authored = graph["@graph"].filter((node) => Object.keys(node).some((key) => key.startsWith("sh:")) || [node["@type"]].flat().some((type) => String(type).startsWith("sh:")));
  assert.deepEqual(document["@graph"], authored);
  assert(document["@graph"].some((node) => node["@id"].includes("date-normalization-dateModified")), "SPARQL constraints must survive compilation");
  assert(!document["@graph"].some((node) => node["@id"] === origin + "saeed-ghezelbash"), "Shape targets are references, not a second data graph");
  assert.deepEqual(document["@context"], graph["@context"]);
  document["@graph"][0]["sh:minCount"] = 99;
  assert.equal(JSON.stringify(graph), before, "Compiler must not mutate authored SHACL policy");
});

test("compiled shapes include source constraints, supplements and every measured distribution even if its checksum disappears", async () => {
  const compiled = await compileShacl(graph, supplement, { distributionIris });
  assert(compiled.sourceNodes > 100 && compiled.sourceTriples > 500);
  assert(compiled.text.includes(origin + "shapes/CanonicalPersonShape/skills"));
  assert(compiled.text.includes(supplement.trimEnd()));
  for (const iri of distributionIris)
    assert(compiled.text.includes(`<${origin}DcatDistributionShape> <http://www.w3.org/ns/shacl#targetNode> <${iri}> .`));
  assert.equal(compiled.measuredDistributions, distributionIris.length);
  assert.equal(MACHINE_RESOURCES.find((resource) => resource.path === "shapes.ttl").source, ".generated/semantic/shapes.ttl");
  await assert.rejects(compileShacl(graph, supplement), /finite measured distribution registry/);
  await assert.rejects(compileShacl(graph, supplement, { distributionIris: [origin + "invented-distribution"] }), /absent from the canonical graph/);
});

test("all explicit supplemental and source targets resolve to current canonical entities", () => {
  for (const node of canonicalShapeDocument(graph)["@graph"])
    for (const ref of [node["sh:targetNode"]].flat().filter(Boolean)) assert(byId.has(ref["@id"]), "Stale source SHACL target: " + ref["@id"]);
  for (const match of supplement.matchAll(/sh:targetNode\s+([\s\S]*?)\s*;/g))
    for (const term of match[1].matchAll(/<([^>]+)>|ex:([A-Za-z0-9._-]+)/g)) {
      const iri = term[1] ?? origin + term[2];
      assert(byId.has(iri), "Stale supplemental SHACL target: " + iri);
    }
  assert(!supplement.includes("ex:question-melasma-recurrence-and-multimodal-treatment"));
  assert(supplement.includes(origin + "acne-pigmentation-and-scars#question-melasma-recurrence-and-multimodal-treatment"));
  for (const name of ["profile-facebook-ghezelbaash", "profile-facebook-doctor-ghezelbaash", "profile-instagram-doctor-ghezelbaash", "evidence-instagram"])
    assert([byId.get(origin + name)["@type"]].flat().includes("WebPage"));
});

test("build compiles shapes before measuring descriptors and guards its supplemental authored input", async () => {
  const build = await readFile("scripts/build.mjs", "utf8");
  assert(build.indexOf('["scripts/generate-shapes.mjs"]') > build.indexOf('["scripts/generate-rdf.mjs"]'));
  assert(build.indexOf('["scripts/generate-shapes.mjs"]') < build.indexOf('["scripts/generate-descriptors.mjs"]'));
  assert(build.slice(0, build.indexOf("const before")).includes('"src/data/semantic/shapes-supplement.ttl"'));
});
