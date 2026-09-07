import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/validate-dist.mjs";
let source = await readFile(path, "utf8");

const oldImport = `import {\n  analyzeGraphClosure,\n  assertSameDocumentGraphUrlTargets,\n} from "./lib/graph-integrity.mjs";`;
const newImport = `import {\n  analyzeGraphClosure,\n  assertSameDocumentGraphUrlTargets,\n  collectPublicResourceIris,\n} from "./lib/graph-integrity.mjs";`;
if (source.split(oldImport).length - 1 !== 1)
  throw new Error("validate-dist graph-integrity import anchor drift");
source = source.replace(oldImport, newImport);

const oldClosure = `const graphClosure = analyzeGraphClosure(graph, {\n  baseUrl: release.canonicalUrl,\n});`;
const newClosure = `const publicResourceIris = await collectPublicResourceIris({\n  root,\n  baseUrl: release.canonicalUrl,\n});\nconst graphClosure = analyzeGraphClosure(graph, {\n  baseUrl: release.canonicalUrl,\n  allowedSameSiteIds: publicResourceIris,\n});`;
if (source.split(oldClosure).length - 1 !== 1)
  throw new Error("validate-dist graph closure anchor drift");
source = source.replace(oldClosure, newClosure);

await writeFile(path, source);
console.log(JSON.stringify({ patched: path, closure: "graph-node-or-materialized-public-resource" }, null, 2));
