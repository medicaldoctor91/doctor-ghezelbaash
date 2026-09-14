import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { loadPublicationData } from "./lib/publication-context.mjs";

const root = process.cwd();
const text = (file) => readFile(path.join(root, file), "utf8");
const publication = await loadPublicationData(root);

const cliPlaceId = execFileSync(
  process.execPath,
  ["scripts/publication-context.mjs", "get", "clinic.placeId"],
  { cwd: root, encoding: "utf8" },
).trim();
assert.equal(
  cliPlaceId,
  publication.clinic.placeId,
  "Publication CLI clinic Place ID drift",
);
assert.match(
  cliPlaceId,
  /^ChIJ[\w-]+$/,
  "Publication CLI clinic Place ID is invalid",
);

const zenodoProof = JSON.parse(
  execFileSync(
    "python",
    ["scripts/zenodo_release.py", "self-test-publication-context"],
    { cwd: root, encoding: "utf8" },
  ),
);
assert.equal(zenodoProof.publicationContext, "PASS");
assert.equal(zenodoProof.release, publication.release);
assert.equal(zenodoProof.primaryEntity, publication.primaryEntity.wikidata);
assert.equal(zenodoProof.orcid, publication.primaryEntity.orcid);
assert.equal(zenodoProof.dataset, publication.dataset.id);

const reputationWorkflow = await text(".github/workflows/reputation-refresh.yml");
assert.match(
  reputationWorkflow,
  /node scripts\/publication-context\.mjs get clinic\.placeId/,
  "Reputation refresh must consume the canonical publication context",
);
assert.doesNotMatch(
  reputationWorkflow,
  /require\([^\n]*release\.json[^\n]*\)\.clinic\.placeId/,
  "Reputation refresh must not read clinic.placeId from raw release lifecycle JSON",
);

const zenodoScript = await text("scripts/zenodo_release.py");
assert.match(
  zenodoScript,
  /scripts\/publication-context\.mjs/,
  "Zenodo script must consume the canonical publication-context bridge",
);
assert.doesNotMatch(
  zenodoScript,
  /src\/data\/release\.json/,
  "Zenodo public entry point must not read raw release lifecycle JSON",
);

const forbiddenChainedRawAccess = [
  /require\([^\n]*release\.json[^\n]*\)\.primaryEntity\.(?!id\b)[A-Za-z_$][\w$]*/g,
  /require\([^\n]*release\.json[^\n]*\)\.clinic\.(?!id\b)[A-Za-z_$][\w$]*/g,
  /require\([^\n]*release\.json[^\n]*\)\.(?:medicalReviewedAt|reviewedBy|schemaVersion)\b/g,
];
const workflowDir = path.join(root, ".github/workflows");
for (const name of await readdir(workflowDir)) {
  if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
  const source = await readFile(path.join(workflowDir, name), "utf8");
  for (const pattern of forbiddenChainedRawAccess) {
    pattern.lastIndex = 0;
    const match = pattern.exec(source);
    if (match)
      throw new Error(
        `Workflow ${name} reads semantic authority directly from raw release.json: ${match[0]}`,
      );
  }
}

console.log(
  JSON.stringify({
    publicationConsumers: "PASS",
    clinicPlaceId: cliPlaceId,
    zenodoPublicationContext: zenodoProof.publicationContext,
    rawWorkflowSemanticReads: 0,
  }),
);
