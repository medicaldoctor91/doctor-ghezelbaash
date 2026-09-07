import { readFile, writeFile } from "node:fs/promises";

const path = "package.json";
const pkg = JSON.parse(await readFile(path, "utf8"));
const command = "node --test scripts/test-canonical-media-semantics.mjs";
if (Object.hasOwn(pkg.scripts, "test:canonical-media-semantics"))
  throw new Error("test:canonical-media-semantics already exists");
const anchor = "npm run test:media-inventory && npm run validate:language-contract";
if (typeof pkg.scripts?.["validate:source"] !== "string" || !pkg.scripts["validate:source"].includes(anchor))
  throw new Error("validate:source media-inventory anchor drift");
pkg.scripts["test:canonical-media-semantics"] = command;
pkg.scripts["validate:source"] = pkg.scripts["validate:source"].replace(
  anchor,
  "npm run test:media-inventory && npm run test:canonical-media-semantics && npm run validate:language-contract",
);
await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(JSON.stringify({ registered: true, command }, null, 2));
