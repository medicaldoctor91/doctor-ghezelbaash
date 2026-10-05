import test from "node:test";
import assert from "node:assert/strict";
import { derivePublicRedirectPolicy } from "../lib/public-redirect-policy.mjs";

test("final public URL policy removes all development routes without resurrecting the phantom physician path", async () => {
  const policy = await derivePublicRedirectPolicy();
  assert.equal(policy.canonical.length, 72);
  assert.equal(policy.answerAliases.length, 125);
  assert.equal(policy.corpusAliases.length, 1056);
  assert.equal(policy.developmentAliases.length, 1181);
  assert.deepEqual(policy.neverPublishedDevelopmentPaths, ["/saeed-ghezelbash"]);
  assert.equal(policy.removedDevelopmentPaths.length, 1182);
  assert.equal(new Set(policy.removedDevelopmentPaths).size, 1182);
  assert(policy.removedDevelopmentPaths.includes("/saeed-ghezelbash"));
  assert(!policy.developmentAliases.some((row) => row.source === "/saeed-ghezelbash"));
  assert(!policy.legacyAliases.some((row) => row.source === "/saeed-ghezelbash"));
  assert(!policy.metadataAliases.some((row) => row.source === "/saeed-ghezelbash"));
  assert(!policy.prePruneRows.some((row) => row.source === "/saeed-ghezelbash"));
  assert(!policy.finalRows.some((row) => row.source === "/saeed-ghezelbash"));
});
