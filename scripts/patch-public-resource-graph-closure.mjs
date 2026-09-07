import { readFile, writeFile } from "node:fs/promises";

const files = [
  "scripts/validate-release-contract.mjs",
  "scripts/validate-source.mjs",
];
const oldImport = 'import { analyzeGraphClosure } from "./lib/graph-integrity.mjs";';
const newImport = `import {\n  analyzeGraphClosure,\n  collectPublicResourceIris,\n} from "./lib/graph-integrity.mjs";`;
const oldCall = `const graphClosure = analyzeGraphClosure(graph, {\n  baseUrl: release.canonicalUrl,\n});`;
const newCall = `const publicResourceIris = await collectPublicResourceIris({\n  root,\n  baseUrl: release.canonicalUrl,\n});\nconst graphClosure = analyzeGraphClosure(graph, {\n  baseUrl: release.canonicalUrl,\n  allowedSameSiteIds: publicResourceIris,\n});`;

for (const file of files) {
  let source = await readFile(file, "utf8");
  const importCount = source.split(oldImport).length - 1;
  const callCount = source.split(oldCall).length - 1;
  if (importCount !== 1 || callCount !== 1)
    throw new Error(`${file} graph-closure patch anchor drift: import=${importCount}, call=${callCount}`);
  source = source.replace(oldImport, newImport).replace(oldCall, newCall);
  if (source.includes(oldImport) || source.includes(oldCall))
    throw new Error(`${file} retained legacy graph closure wiring`);
  await writeFile(file, source);
}
console.log(JSON.stringify({ patched: files }, null, 2));
