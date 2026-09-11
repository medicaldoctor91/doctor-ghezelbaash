import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/promote-release.mjs";
let source = await readFile(path, "utf8");
const before = `codemeta.softwareVersion = next.release;
codemeta.dateModified = next.date;
must(
  codemeta.subjectOf && typeof codemeta.subjectOf === "object",
  "CodeMeta subjectOf is required for release promotion",
);
codemeta.subjectOf.version = next.release;
codemeta.subjectOf.identifier = \`https://doi.org/\${next.versionDoi}\`;
codemeta.subjectOf.name = "Dr. Saeed Ghezelbash Public Knowledge Graph";`;
const after = `const codemetaContexts = Array.isArray(codemeta["@context"])
  ? codemeta["@context"]
  : [codemeta["@context"]].filter(Boolean);
const codemetaSchemaExtension = codemetaContexts.find(
  (entry) => entry && typeof entry === "object" && !Array.isArray(entry),
);
const codemetaSubject = codemeta["schema:subjectOf"];
must(
  codemetaContexts.includes("https://w3id.org/codemeta/3.1") &&
    codemetaSchemaExtension?.schema === "http://schema.org/" &&
    !Object.hasOwn(codemeta, "subjectOf") &&
    codemetaSubject &&
    typeof codemetaSubject === "object" &&
    !Array.isArray(codemetaSubject),
  "CodeMeta 3.1 schema:subjectOf contract is required for release promotion",
);
codemeta.softwareVersion = next.release;
codemeta.dateModified = next.date;
codemetaSubject.version = next.release;
codemetaSubject.identifier = \`https://doi.org/\${next.versionDoi}\`;
codemetaSubject.name = "Dr. Saeed Ghezelbash Public Knowledge Graph";`;
const count = source.split(before).length - 1;
if (count !== 1)
  throw new Error(`CodeMeta promotion patch cardinality drift: ${count}`);
source = source.replace(before, after);
if (source.includes("codemeta.subjectOf"))
  throw new Error("Legacy raw CodeMeta subjectOf promotion path remains");
await writeFile(path, source);
console.log(JSON.stringify({ patched: true, promotionContract: "codemeta-3.1-qualified-subject" }));
