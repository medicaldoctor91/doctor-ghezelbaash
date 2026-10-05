import { readFile, writeFile, unlink } from "node:fs/promises";

const path = "src/data/semantic/shapes-supplement.ttl";
const oldTerm = "ex:saeed-ghezelbash";
const newTerm = "<https://www.ghezelbaash.ir/#saeed-ghezelbash>";
const source = await readFile(path, "utf8");
const count = source.split(oldTerm).length - 1;
if (count !== 20) throw new Error(`Expected 20 physician SHACL terms, found ${count}`);
const next = source.replaceAll(oldTerm, newTerm);
if (next.includes(oldTerm)) throw new Error("Stale physician SHACL term survived migration");
await writeFile(path, next, "utf8");

console.log(JSON.stringify({ migratedPhysicianShaclReferences: count }, null, 2));
await unlink("scripts/one-time-shacl-identity-migration.mjs");
await unlink(".github/workflows/one-time-shacl-identity-migration.yml");
