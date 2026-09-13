import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const script = path.resolve("scripts/reconcile-zenodo-history.mjs");
const root = await mkdtemp(path.join(os.tmpdir(), "reconcile-zenodo-history-"));
const releasePath = path.join(root, "src/data/release.json");
const graphPath = path.join(root, "src/data/semantic/knowledge-graph.jsonld");
const release = {
  release: "1.2.5",
  canonicalUrl: "https://www.ghezelbaash.ir/",
  dataset: {
    id: "https://www.ghezelbaash.ir/graph.jsonld#dataset",
    zenodo: {
      conceptDoi: "10.5281/zenodo.18765168",
      versionDoi: "10.5281/zenodo.22216583",
      recordId: "22216583",
      releaseHistory: [
        {
          release: "1.2.5",
          recordId: "22216583",
          versionDoi: "10.5281/zenodo.22216583",
          publicationDate: "2026-08-31",
        },
      ],
    },
  },
};
const graph = {
  "@graph": [
    {
      "@id": release.dataset.id,
      "@type": "Dataset",
      citation: [
        { "@id": "https://www.ghezelbaash.ir/#release-1-2-5" },
      ],
    },
  ],
};
const args = [
  script,
  "--release=1.2.6",
  "--record=22651268",
  "--doi=10.5281/zenodo.22651268",
  "--date=2026-09-08",
  "--target-release=1.3.0",
];
try {
  await mkdir(path.dirname(releasePath), { recursive: true });
  await mkdir(path.dirname(graphPath), { recursive: true });
  await writeFile(releasePath, `${JSON.stringify(release, null, 2)}\n`);
  await writeFile(graphPath, `${JSON.stringify(graph, null, 2)}\n`);

  execFileSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  const firstRelease = JSON.parse(await readFile(releasePath, "utf8"));
  const firstGraph = JSON.parse(await readFile(graphPath, "utf8"));
  assert.equal(firstRelease.release, "1.2.5", "History repair must not relabel current source");
  assert.equal(firstRelease.dataset.zenodo.versionDoi, "10.5281/zenodo.22216583");
  assert.equal(firstRelease.dataset.zenodo.recordId, "22216583");
  const predecessor = firstRelease.dataset.zenodo.releaseHistory.find(
    (entry) => entry.release === "1.2.6",
  );
  assert.deepEqual(predecessor, {
    release: "1.2.6",
    recordId: "22651268",
    versionDoi: "10.5281/zenodo.22651268",
    publicationDate: "2026-09-08",
  });
  const historicalNode = firstGraph["@graph"].find(
    (node) => node.version === "1.2.6",
  );
  assert.equal(historicalNode.identifier[0].value, "10.5281/zenodo.22651268");
  assert.equal(historicalNode.identifier[1].value, "22651268");

  const beforeSecond = await Promise.all([
    readFile(releasePath, "utf8"),
    readFile(graphPath, "utf8"),
  ]);
  execFileSync(process.execPath, args, { cwd: root, encoding: "utf8" });
  const afterSecond = await Promise.all([
    readFile(releasePath, "utf8"),
    readFile(graphPath, "utf8"),
  ]);
  assert.deepEqual(afterSecond, beforeSecond, "Verified predecessor reconciliation must be idempotent");

  const conflict = spawnSync(
    process.execPath,
    [
      script,
      "--release=1.2.6",
      "--record=22651268",
      "--doi=10.5281/zenodo.99999999",
      "--date=2026-09-08",
      "--target-release=1.3.0",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.notEqual(conflict.status, 0);
  assert.match(`${conflict.stdout}\n${conflict.stderr}`, /conflicting immutable identity/);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log("ZENODO_HISTORY_RECONCILIATION_PASS");
