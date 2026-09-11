import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/validate-release-contract.mjs";
let source = await readFile(path, "utf8");
const before = `if (
  codemeta.softwareVersion !== R ||
  codemeta.subjectOf?.version !== R ||
  codemeta.subjectOf?.identifier !== \`https://doi.org/\${Z.versionDoi}\` ||
  codemeta.subjectOf?.name !== release.dataset.name
)
  fail("CodeMeta release convergence failure");`;
const after = `const codemetaContexts = arr(codemeta["@context"]);
const codemetaSchemaExtension = codemetaContexts.find(
  (entry) => entry && typeof entry === "object" && !Array.isArray(entry),
);
const codemetaSubject = codemeta["schema:subjectOf"];
if (
  !codemetaContexts.includes("https://w3id.org/codemeta/3.1") ||
  codemetaSchemaExtension?.schema !== "http://schema.org/" ||
  Object.hasOwn(codemeta, "subjectOf") ||
  codemeta.softwareVersion !== R ||
  codemetaSubject?.version !== R ||
  codemetaSubject?.identifier !== \`https://doi.org/\${Z.versionDoi}\` ||
  codemetaSubject?.name !== release.dataset.name
)
  fail("CodeMeta release convergence failure");`;
const count = source.split(before).length - 1;
if (count !== 1)
  throw new Error(`CodeMeta release convergence patch cardinality drift: ${count}`);
source = source.replace(before, after);
if (source.includes("codemeta.subjectOf"))
  throw new Error("Legacy raw CodeMeta subjectOf reference remains in release contract");
await writeFile(path, source);
console.log(JSON.stringify({ patched: true, contract: "codemeta-3.1-qualified-subject" }));
