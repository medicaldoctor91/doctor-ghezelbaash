import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const FORBIDDEN_QIDS = Object.freeze(["Q700236", "Q256688", "Q140288589", "Q140304972"]);
// Only these canonical authored input families are inspected. No repository-wide grep,
// generated output, dependencies, git history, or binary-media reads.
const ROOTS = ["src", "scripts", "public", ".release/policy", ".release/evidence", ".github/workflows"];
const FILES = ["README.md", "CITATION.cff", "codemeta.json", "package.json", "astro.config.mjs", "tsconfig.json"];
const TEXT = new Set([".astro", ".cff", ".css", ".csv", ".html", ".js", ".json", ".jsonld", ".md", ".mjs", ".py", ".svg", ".toml", ".ts", ".tsv", ".ttl", ".txt", ".vtt", ".webmanifest", ".xml", ".yaml", ".yml", ".template"]);
// Exact paths only: an active source named test/validator/archive is not exempt.
export const IDENTIFIER_LITERAL_ALLOWLIST = Object.freeze({
  "scripts/lib/active-identifier-contract.mjs": "Validator's forbidden identifier vocabulary",
  "scripts/test-final-entity-contract.mjs": "Negative regression fixtures exercising the forbidden identifiers",
  "src/data/semantic/shapes.ttl": "SHACL exclusion constraints must name retired identifiers",
});
// Reserved non-active historical families. New exceptions inside src require an exact path above.
const HISTORICAL_ROOTS = Object.freeze({
  "scripts/migrations/": "Non-active migration history",
  ".release/history/": "Archived release metadata",
  "archive/": "Non-active archived sources",
});
const forbidden = new RegExp(`(?<![A-Za-z0-9])(?:${FORBIDDEN_QIDS.join("|")})(?![A-Za-z0-9])`, "u");
export function assertActiveIdentifierText(name, content) {
  if (Object.hasOwn(IDENTIFIER_LITERAL_ALLOWLIST, name) ||
      Object.keys(HISTORICAL_ROOTS).some((prefix) => name.startsWith(prefix))) return;
  const active = FILES.includes(name) || ROOTS.some((root) => name.startsWith(`${root}/`));
  if (!active || !TEXT.has(path.posix.extname(name))) return;
  // JSON parsing also detects escaped QIDs; the raw representation is checked as well.
  const decoded = /\.(?:json|jsonld|webmanifest)$/.test(name) ? JSON.stringify(JSON.parse(content)) : "";
  const match = forbidden.exec(`${content}\n${decoded}`);
  if (match) throw new Error(`Forbidden active authored identifier ${match[0]} in ${name}`);
}
export async function assertActiveAuthoredIdentifiers(root = process.cwd()) {
  const names = [...FILES];
  const walk = async (relative) => {
    if (Object.keys(HISTORICAL_ROOTS).some((prefix) => `${relative}/`.startsWith(prefix))) return;
    let entries;
    try { entries = await readdir(path.join(root, relative), { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT" && relative === ".release/evidence") return; throw error; }
    for (const entry of entries) {
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile() && TEXT.has(path.posix.extname(name))) names.push(name);
    }
  };
  for (const relative of ROOTS) await walk(relative);
  for (const name of names.sort()) assertActiveIdentifierText(name, await readFile(path.join(root, name), "utf8"));
  return names.length;
}
