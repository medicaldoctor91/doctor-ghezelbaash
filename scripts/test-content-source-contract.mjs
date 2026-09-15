import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  CONTENT_SOURCE_CONTRACT_PATH,
  CANONICAL_PAGE_SOURCE,
  inspectCanonicalPageSource,
} from "./validate-content-source.mjs";

const contract = JSON.parse(await readFile(CONTENT_SOURCE_CONTRACT_PATH, "utf8"));
const source = await readFile(CANONICAL_PAGE_SOURCE);

test("the reviewed canonical page source matches its exact byte contract", () => {
  const result = inspectCanonicalPageSource(source, contract);
  assert.equal(result.integrity, "PASS");
  assert.equal(result.path, CANONICAL_PAGE_SOURCE);
});

test("a same-length source mutation fails closed", () => {
  const changed = Buffer.from(source);
  changed[changed.length - 1] ^= 1;
  assert.throws(
    () => inspectCanonicalPageSource(changed, contract),
    /SHA-256 drift/u,
  );
});

test("source path, byte count and Git blob identity cannot drift independently", () => {
  assert.throws(
    () => inspectCanonicalPageSource(source, {
      ...contract,
      source: { ...contract.source, path: "src/content-source/other.md" },
    }),
    /path drift/u,
  );
  assert.throws(
    () => inspectCanonicalPageSource(source, {
      ...contract,
      source: { ...contract.source, bytes: contract.source.bytes + 1 },
    }),
    /byte drift/u,
  );
  assert.throws(
    () => inspectCanonicalPageSource(source, {
      ...contract,
      source: { ...contract.source, gitBlobSha1: "0".repeat(40) },
    }),
    /Git blob drift/u,
  );
});

test("contract shape and provenance are fail-closed", () => {
  assert.throws(
    () => inspectCanonicalPageSource(source, { ...contract, legacyBaseline: true }),
    /fields are not canonical/u,
  );
  assert.throws(
    () => inspectCanonicalPageSource(source, {
      ...contract,
      source: { ...contract.source, approvedCommit: "not-a-commit" },
    }),
    /Approved source commit/u,
  );
});
