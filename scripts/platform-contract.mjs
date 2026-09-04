import { readFile } from "node:fs/promises";

const readJson = (file) => readFile(file, "utf8").then(JSON.parse);

async function exportContract() {
  const contract = await readJson(".release/policy/platform-contract.json");
  const cf = contract.cloudflare;
  const env = {
    CF_PROJECT: cf.pagesProject,
    CLOUDFLARE_ACCOUNT_ID: cf.accountId,
    CF_PRODUCTION_BRANCH: cf.productionBranch,
    CF_EXPECTED_ENVIRONMENT: cf.expectedEnvironment,
    ZONE_NAME: contract.zoneName,
    CANONICAL_HOST: contract.canonicalHost,
  };
  for (const [key, value] of Object.entries(env)) {
    if (!String(value || "").trim())
      throw new Error(`Platform contract missing ${key}`);
    console.log(`${key}=${value}`);
  }
}

async function validateContract() {
  const [contract, release, pkg, lock, codemeta, observation, refreshWorkflow] =
    await Promise.all([
      readJson(".release/policy/platform-contract.json"),
      readJson("src/data/release.json"),
      readJson("package.json"),
      readJson("package-lock.json"),
      readJson("codemeta.json"),
      readJson("src/data/reputation-observation.json"),
      readFile(".github/workflows/reputation-refresh.yml", "utf8"),
    ]);
  const cf = contract.cloudflare;
  const runtime = contract.runtime;
  const refresh = contract.automation?.reputationRefresh;
  const fail = (message) => {
    throw new Error(message);
  };

  if (contract.schemaVersion !== "1.0")
    fail("Unsupported platform contract schema");
  if (
    contract.canonicalUrl !== release.canonicalUrl ||
    contract.canonicalHost !== new URL(release.canonicalUrl).hostname
  )
    fail("Platform canonical URL drift");
  if (
    contract.repository !==
    release.dataset.github.repository.replace(/^https:\/\/github\.com\//, "")
  )
    fail("Platform repository drift");
  if (
    cf.productionBranch !== "main" ||
    cf.expectedEnvironment !== "production" ||
    cf.preview?.deploymentSetting !== "none" ||
    cf.preview?.branchIncludes?.length ||
    cf.preview?.branchExcludes?.length
  )
    fail("Platform main-only/no-preview contract drift");
  if (
    cf.build?.command !== "npm run build" ||
    cf.build?.destinationDir !== "dist" ||
    cf.build?.rootDir !== ""
  )
    fail("Platform build contract drift");
  if (
    cf.delivery?.mode !== "static-assets" ||
    cf.delivery?.serverRuntime !== "none" ||
    JSON.stringify(cf.delivery?.dynamicRoutes) !== JSON.stringify([]) ||
    JSON.stringify(cf.delivery?.requiredProductionBindings) !==
      JSON.stringify([])
  )
    fail("Cloudflare static-delivery contract drift");
  if (cf.planTier !== "free") fail("Cloudflare plan contract drift");
  if (
    !Array.isArray(cf.requiredCustomDomains) ||
    !cf.requiredCustomDomains.includes(contract.canonicalHost)
  )
    fail("Required custom domains contract incomplete");
  if (
    refresh?.workflow !== ".github/workflows/reputation-refresh.yml" ||
    refresh?.schedule !== "23 */6 * * *" ||
    refresh?.sourceFile !== "src/data/reputation-observation.json" ||
    refresh?.source !== "Google Places API (New)" ||
    JSON.stringify(refresh?.fieldMask) !==
      JSON.stringify([
        "id",
        "rating",
        "userRatingCount",
        "businessStatus",
        "movedPlace",
        "movedPlaceId",
      ]) ||
    JSON.stringify(refresh?.requiredGitHubSecrets) !==
      JSON.stringify(["GOOGLE_PLACES_API_KEY"]) ||
    refresh?.upstreamCallsPerRun !== 1 ||
    refresh?.publishOnChangeOnly !== true
  )
    fail("Static reputation refresh contract drift");
  if (
    observation.entity !== release.clinic.id ||
    observation.placeId !== release.clinic.placeId ||
    observation.source !== refresh.source
  )
    fail("Static reputation observation identity drift");
  if (
    !refreshWorkflow.includes(`cron: "${refresh.schedule}"`) ||
    !refreshWorkflow.includes("GOOGLE_PLACES_API_KEY") ||
    !refreshWorkflow.includes("node scripts/reputation.mjs google") ||
    !refreshWorkflow.includes(refresh.sourceFile) ||
    refreshWorkflow.split("places.googleapis.com/v1/places/").length - 1 !== 1 ||
    refreshWorkflow.includes("--retry") ||
    refreshWorkflow.includes("wrangler") ||
    refreshWorkflow.includes("zenodo") ||
    refreshWorkflow.includes("huggingface")
  )
    fail("Static reputation workflow contract drift");
  if (
    !runtime?.node ||
    !runtime?.nodeEngine ||
    !runtime?.npm ||
    !runtime?.npmEngine
  )
    fail("Canonical runtime contract incomplete");
  const nvmrc = (await readFile(".nvmrc", "utf8")).trim();
  if (
    nvmrc !== runtime.node ||
    pkg.engines?.node !== runtime.nodeEngine ||
    pkg.engines?.npm !== runtime.npmEngine ||
    pkg.packageManager !== `npm@${runtime.npm}`
  )
    fail("Runtime pin drift");

  const packageName = (location) => {
    const remainder = location.slice(
      location.lastIndexOf("node_modules/") + "node_modules/".length,
    );
    const parts = remainder.split("/");
    return remainder.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  };
  const requiredScriptApprovals = Object.entries(lock.packages ?? {})
      .filter(
        ([location, metadata]) =>
          location.includes("node_modules/") && metadata?.hasInstallScript,
      )
      .map(
        ([location, metadata]) =>
          `${packageName(location)}@${metadata.version}`,
      )
      .sort(),
    approvedScripts = Object.entries(pkg.allowScripts ?? {})
      .filter(([, allowed]) => allowed === true)
      .map(([name]) => name)
      .sort(),
    npmrc = await readFile(".npmrc", "utf8");
  if (
    JSON.stringify(approvedScripts) !==
      JSON.stringify(requiredScriptApprovals) ||
    /^ignore-scripts=true$/m.test(npmrc) ||
    /^dangerously-allow-all-scripts=true$/m.test(npmrc)
  )
    fail("Dependency install-script policy drift");
  if (codemeta.runtimePlatform !== `Node.js ${runtime.node}`)
    fail("CodeMeta runtimePlatform drift");

  console.log(
    JSON.stringify(
      {
        platformContract: "PASS",
        repository: contract.repository,
        productionBranch: cf.productionBranch,
        pagesProject: cf.pagesProject,
        canonicalHost: contract.canonicalHost,
        planTier: cf.planTier,
        delivery: cf.delivery,
        reputationRefresh: {
          schedule: refresh.schedule,
          upstreamCallsPerRun: refresh.upstreamCallsPerRun,
          publishOnChangeOnly: refresh.publishOnChangeOnly,
        },
        runtime,
        approvedInstallScripts: approvedScripts,
        codemetaRuntime: codemeta.runtimePlatform,
      },
      null,
      2,
    ),
  );
}

const command = process.argv[2] || "validate";
if (command === "export") await exportContract();
else if (command === "validate") await validateContract();
else
  throw new Error(
    "Usage: node scripts/platform-contract.mjs <export|validate>",
  );
