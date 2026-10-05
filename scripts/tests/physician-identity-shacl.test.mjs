import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/data/semantic/shapes-supplement.ttl", "utf8");
const physicianIri = "<https://www.ghezelbaash.ir/#saeed-ghezelbash>";

test("supplemental SHACL targets the canonical physician fragment identity", () => {
  assert(!source.includes("ex:saeed-ghezelbash"));
  assert(!source.includes("<https://www.ghezelbaash.ir/saeed-ghezelbash>"));
  assert.equal(source.split(physicianIri).length - 1, 20);
});
