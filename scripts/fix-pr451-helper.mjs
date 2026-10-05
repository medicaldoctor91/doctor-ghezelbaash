import { readFile, writeFile, unlink } from "node:fs/promises";
const path = "scripts/one-time-finalize-pr451.mjs";
let source = await readFile(path, "utf8");
const oldBlock = `for (const [path, expected] of [\n  ["scripts/tests/independent-pages.test.mjs", 2],\n  ["scripts/tests/page-discovery.test.mjs", 2],\n  ["scripts/tests/rich-results-contract.test.mjs", 1],\n  ["scripts/tests/route-discovery.test.mjs", 1],\n]) {\n  await edit(path, (source) => replaceAllCount(source,\n    'inputs.lifecycle.canonicalUrl + "saeed-ghezelbash"',\n    'inputs.lifecycle.canonicalUrl + "#saeed-ghezelbash"', expected));\n}\n`;
const newBlock = `for (const [path, expected] of [\n  ["scripts/tests/independent-pages.test.mjs", 2],\n  ["scripts/tests/page-discovery.test.mjs", 2],\n]) {\n  await edit(path, (source) => replaceAllCount(source,\n    'inputs.lifecycle.canonicalUrl + "saeed-ghezelbash"',\n    'inputs.lifecycle.canonicalUrl + "#saeed-ghezelbash"', expected));\n}\nawait edit("scripts/tests/route-discovery.test.mjs", (source) => replaceAllCount(source,\n  'canonicalUrl + "saeed-ghezelbash"', 'canonicalUrl + "#saeed-ghezelbash"', 1));\nawait edit("scripts/tests/rich-results-contract.test.mjs", (source) => {\n  let next = replaceAllCount(source,\n    'inputs.lifecycle.canonicalUrl + "saeed-ghezelbash#webpage"',\n    'inputs.lifecycle.canonicalUrl + "test-profile#webpage"', 1);\n  next = replaceAllCount(next,\n    'inputs.lifecycle.canonicalUrl + "saeed-ghezelbash"',\n    'inputs.lifecycle.canonicalUrl + "test-profile"', 1);\n  return next;\n});\n`;
const count = source.split(oldBlock).length - 1;
if (count !== 1) throw new Error(`Expected one faulty helper block, found ${count}`);
source = source.replace(oldBlock, newBlock);
await writeFile(path, source, "utf8");

// The target test gained four additional assertions after the finalizer helper
// was authored. Remove only those redundant lines in this transient workspace so
// the finalizer can replace the whole old physician-route block atomically. The
// replacement block retains the mainEntityOfPage assertion and other suites
// retain ProfilePage type/mainEntity coverage.
const testPath = "scripts/tests/url-architecture.test.mjs";
let testSource = await readFile(testPath, "utf8");
const extra = `  assert.deepEqual(doctor.mainEntityOfPage, { "@id": inputs.lifecycle.canonicalUrl + "webpage" });\n  const page = inputs.graph["@graph"].find((node) => node["@id"] === inputs.lifecycle.canonicalUrl + "webpage");\n  assert.deepEqual(new Set([page["@type"]].flat()), new Set(["ProfilePage", "MedicalWebPage"]));\n  assert.deepEqual(page.mainEntity, { "@id": doctor["@id"] });\n`;
const extraCount = testSource.split(extra).length - 1;
if (extraCount !== 1) throw new Error(`Expected one redundant physician assertion block, found ${extraCount}`);
testSource = testSource.replace(extra, "");
await writeFile(testPath, testSource, "utf8");

await unlink("scripts/fix-pr451-helper.mjs");
