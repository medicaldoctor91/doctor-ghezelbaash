import { canonicalizeRdfDocument } from "./rdf-measurement.mjs";

const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const shaclNamespace = "http://www.w3.org/ns/shacl#";

/** Export authored SHACL definitions without following their data targets. */
export function canonicalShapeDocument(graph) {
  if (!graph?.["@context"] || !Array.isArray(graph["@graph"]))
    throw new Error("SHACL projection requires the canonical JSON-LD graph");
  const nodes = graph["@graph"].filter((node) => Object.keys(node).some((key) => key.startsWith("sh:") || key.startsWith(shaclNamespace)) ||
    values(node["@type"]).some((type) => String(type).startsWith("sh:") || String(type).startsWith(shaclNamespace)));
  if (!nodes.length) throw new Error("Canonical graph has no authored SHACL definitions");
  return { "@context": structuredClone(graph["@context"]), "@graph": structuredClone(nodes) };
}

/** Supplemental application constraints extend the authored shape graph. */
export async function compileShacl(graph, supplement, { distributionIris } = {}) {
  if (typeof supplement !== "string" || !supplement.trim())
    throw new Error("SHACL supplemental constraints must be nonempty Turtle");
  const document = canonicalShapeDocument(graph);
  if (!Array.isArray(distributionIris) || !distributionIris.length ||
      distributionIris.some((iri) => typeof iri !== "string" || !/^https?:\/\/[^\s<>]+$/.test(iri)))
    throw new Error("SHACL requires the finite measured distribution registry");
  const definitions = new Set(graph["@graph"].map((node) => node["@id"]));
  if (distributionIris.some((iri) => !definitions.has(iri)))
    throw new Error("Measured SHACL distribution target is absent from the canonical graph");
  const measurement = await canonicalizeRdfDocument(document);
  const distributionTargets = [...new Set(distributionIris)].sort().map((iri) =>
    `<https://www.ghezelbaash.ir/DcatDistributionShape> <${shaclNamespace}targetNode> <${iri}> .`).join("\n");
  return {
    text: "# Generated from canonical graph SHACL definitions plus shapes-supplement.ttl.\n" + measurement.text + "\n# Supplemental application and publication contracts.\n" + supplement.trimEnd() + "\n\n# Finite locally measured distributions, derived from the shared registry.\n" + distributionTargets + "\n",
    sourceNodes: document["@graph"].length,
    sourceTriples: measurement.triples,
    measuredDistributions: new Set(distributionIris).size,
  };
}
