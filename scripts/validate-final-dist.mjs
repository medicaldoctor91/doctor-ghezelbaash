import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { renderStaticRewrites } from "./lib/redirect-registry.mjs";
import { derivePublicRedirectPolicy } from "./lib/public-redirect-policy.mjs";

const root = process.cwd();
const dist = path.resolve(root, process.argv[2] || "dist");
const policy = await derivePublicRedirectPolicy(root);
const redirectsPath = path.join(dist, "_redirects");
const actual = await readFile(redirectsPath, "utf8");
const expectedFinal = renderStaticRewrites(policy.finalRows);

assert.equal(
  actual,
  expectedFinal,
  "Final deployable _redirects differs from the reviewed public redirect policy",
);
for (const source of policy.removedDevelopmentPaths) {
  assert(
    !actual.split(/\r?\n/).some((line) => line.startsWith(source + " ")),
    `Development-only URL survived final distribution validation: ${source}`,
  );
}

// validate-dist.mjs is the comprehensive source/distribution contract and was
// authored while generated development aliases were still materialized. Rehydrate
// only those generated aliases in a temporary copy, run that complete validator
// unchanged, and keep the actual deployable dist pruned. Never-published paths
// such as /saeed-ghezelbash are intentionally absent from both forms.
const tempRoot = await mkdtemp(path.join(os.tmpdir(), "ghezelbaash-final-dist-"));
const validationDist = path.join(tempRoot, "dist");
try {
  await cp(dist, validationDist, { recursive: true });
  await writeFile(
    path.join(validationDist, "_redirects"),
    renderStaticRewrites(policy.prePruneRows),
    "utf8",
  );
  const result = spawnSync(
    process.execPath,
    [path.join(root, "scripts/validate-dist.mjs"), validationDist],
    {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
    },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, "Comprehensive dist validation failed");
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

assert.equal(
  await readFile(redirectsPath, "utf8"),
  expectedFinal,
  "Final validation must not mutate the deployable redirect policy",
);
console.log(
  JSON.stringify(
    {
      finalDistributionValidation: "PASS",
      canonicalPages: policy.canonical.length,
      removedDevelopmentPaths: policy.removedDevelopmentPaths.length,
      prunedGeneratedDevelopmentAliases: policy.developmentAliases.length,
      neverPublishedDevelopmentPaths: policy.neverPublishedDevelopmentPaths.length,
      retainedLegacyAliases: policy.legacyAliases.length,
      retainedMetadataAliases: policy.metadataAliases.length,
      retainedMachineNamespaces: policy.namespaceAliases.length,
      finalRules: policy.finalRows.length,
      comprehensiveValidation: "PASS",
    },
    null,
    2,
  ),
);
