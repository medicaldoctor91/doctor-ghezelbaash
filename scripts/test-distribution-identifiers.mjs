import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FORBIDDEN_QIDS } from "./lib/active-identifier-contract.mjs";
import { assertNoForbiddenDistributionIdentifiers } from "./lib/distribution-identifier-contract.mjs";

test("distribution gate rejects raw and escaped retired identifiers", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "distribution-identifiers-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dist = path.join(root, "dist");
  await mkdir(dist, { recursive: true });
  await writeFile(path.join(dist, "safe.txt"), "canonical physician distribution\n");
  await assert.doesNotReject(() =>
    assertNoForbiddenDistributionIdentifiers(["dist"], { cwd: root }),
  );

  for (const qid of FORBIDDEN_QIDS) {
    await writeFile(path.join(dist, "raw.bin"), Buffer.from(`prefix-${qid}-suffix`));
    await assert.rejects(
      () => assertNoForbiddenDistributionIdentifiers(["dist"], { cwd: root }),
      new RegExp(qid),
    );
    await rm(path.join(dist, "raw.bin"));

    const escaped = `\\u0051${qid.slice(1)}`;
    await writeFile(path.join(dist, "escaped.json"), JSON.stringify({ id: escaped }));
    await assert.rejects(
      () => assertNoForbiddenDistributionIdentifiers(["dist"], { cwd: root }),
      new RegExp(qid),
    );
    await rm(path.join(dist, "escaped.json"));
  }
});

test("distribution gate fails closed when an expected root is missing", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "distribution-identifiers-missing-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(
    () => assertNoForbiddenDistributionIdentifiers(["dist"], { cwd: root }),
    /root missing/,
  );
});
