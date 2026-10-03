import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generatedWorkspace } from "./generated-workspace.mjs";
import { compileShacl } from "./lib/shacl-projection.mjs";
import { MACHINE_RESOURCES } from "../src/lib/resources.mjs";

const root = process.cwd();
const graph = JSON.parse(await readFile(path.join(root, "src/data/semantic/knowledge-graph.jsonld"), "utf8"));
const supplement = await readFile(path.join(root, "src/data/semantic/shapes-supplement.ttl"), "utf8");
const distributionIris = MACHINE_RESOURCES.filter((resource) => resource.descriptorRoles.includes("dcat")).map((resource) => resource.distributionIri);
const output = await compileShacl(graph, supplement, { distributionIris });
const directory = generatedWorkspace(root).semantic;
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, "shapes.ttl"), output.text);
console.log(JSON.stringify({ stage: "SHACL_PROJECTION", sourceNodes: output.sourceNodes, sourceTriples: output.sourceTriples, measuredDistributions: output.measuredDistributions, supplement: "src/data/semantic/shapes-supplement.ttl" }));
