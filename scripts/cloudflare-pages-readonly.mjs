import assert from "node:assert/strict";
import { appendFile, readFile } from "node:fs/promises";

const platform = JSON.parse(
  await readFile(".release/policy/platform-contract.json", "utf8"),
);
const cf = platform.cloudflare;
const API_ROOT = "https://api.cloudflare.com/client/v4";
const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const projectName = process.env.CF_PROJECT?.trim() || cf.pagesProject;
const commitHash = (
  process.env.CF_EXPECTED_COMMIT || process.env.GITHUB_SHA || ""
).trim();
const expectedEnv = (process.env.CF_EXPECTED_ENVIRONMENT || "").trim();
assert(token, "CLOUDFLARE_API_TOKEN required");
assert(account, "CLOUDFLARE_ACCOUNT_ID required");
assert.equal(account, cf.accountId, "Cloudflare account drift");
assert.equal(projectName, cf.pagesProject, "Unexpected Cloudflare Pages project");
assert.match(commitHash, /^[0-9a-f]{40}$/, "CF_EXPECTED_COMMIT/GITHUB_SHA must be a full SHA");
assert.equal(expectedEnv, "production", "CF_EXPECTED_ENVIRONMENT must be production");
assert.equal(
  process.env.GITHUB_REPOSITORY || platform.repository,
  platform.repository,
  "Unexpected repository",
);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const statusOf = (deployment) =>
  deployment?.latest_stage?.status ?? deployment?.stages?.at(-1)?.status ?? "unknown";
const base = `/accounts/${encodeURIComponent(account)}/pages/projects/${encodeURIComponent(projectName)}`;
const get = async (path) => {
  const response = await fetch(API_ROOT + path, {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true)
    throw new Error(
      `Cloudflare read-only GET ${path} HTTP ${response.status}: ${JSON.stringify(payload?.errors || [])}`,
    );
  return payload.result;
};
const safeProjectState = (project) => {
  const source = project?.source ?? {};
  const config = source.config ?? {};
  const build = project?.build_config ?? {};
  return {
    name: project?.name ?? null,
    productionBranch: project?.production_branch ?? null,
    sourceType: source.type ?? null,
    repository:
      config.owner && config.repo_name ? `${config.owner}/${config.repo_name}` : null,
    deploymentsEnabled: config.deployments_enabled ?? null,
    productionDeploymentsEnabled: config.production_deployments_enabled ?? null,
    previewDeploymentSetting: config.preview_deployment_setting ?? null,
    previewBranchIncludes: config.preview_branch_includes ?? [],
    previewBranchExcludes: config.preview_branch_excludes ?? [],
    buildCommand: build.build_command ?? null,
    destinationDir: build.destination_dir ?? null,
    rootDir: build.root_dir ?? null,
  };
};
const exactProject = (project) => {
  const state = safeProjectState(project);
  return (
    state.name === cf.pagesProject &&
    state.productionBranch === cf.productionBranch &&
    state.sourceType === "github" &&
    state.repository === platform.repository &&
    state.deploymentsEnabled === true &&
    state.productionDeploymentsEnabled === true &&
    state.previewDeploymentSetting === cf.preview.deploymentSetting &&
    JSON.stringify(state.previewBranchIncludes) === JSON.stringify(cf.preview.branchIncludes) &&
    JSON.stringify(state.previewBranchExcludes) === JSON.stringify(cf.preview.branchExcludes) &&
    state.buildCommand === cf.build.command &&
    state.destinationDir === cf.build.destinationDir &&
    (state.rootDir === cf.build.rootDir || (cf.build.rootDir === "" && state.rootDir === "/"))
  );
};

const project = await get(base);
assert(exactProject(project), `Cloudflare Pages project contract drift: ${JSON.stringify(safeProjectState(project))}`);
console.log("CF_READ_ONLY_PROJECT_EXACT", JSON.stringify(safeProjectState(project)));

const matchDeployment = (items) =>
  items
    .filter((item) => item?.deployment_trigger?.type === "github:push")
    .filter((item) => item?.deployment_trigger?.metadata?.commit_hash === commitHash)
    .filter((item) => item?.environment === expectedEnv)
    .sort((left, right) => String(right.created_on).localeCompare(String(left.created_on)))[0] ?? null;

let deployment = null;
for (let attempt = 1; attempt <= 60 && !deployment; attempt++) {
  deployment = matchDeployment(await get(`${base}/deployments?per_page=25`));
  if (!deployment) {
    console.log(`CF_READ_ONLY_GIT_EVENT_WAIT attempt=${attempt} commit=${commitHash}`);
    if (attempt < 60) await sleep(5000);
  }
}
assert(deployment, `No production github:push deployment for exact commit ${commitHash}`);
if (deployment.is_skipped)
  throw new Error(
    `Cloudflare native Git deployment was skipped for ${commitHash}: ${String(deployment.skip_reason || "unknown")}; read-only verification refuses retry`,
  );
for (let attempt = 1; attempt <= 120; attempt++) {
  deployment = await get(`${base}/deployments/${encodeURIComponent(deployment.id)}`);
  const status = statusOf(deployment);
  console.log(`CF_READ_ONLY_DEPLOYMENT_STATUS id=${deployment.id} attempt=${attempt} status=${status}`);
  if (status === "success") break;
  if (["failure", "canceled"].includes(status))
    throw new Error(`Cloudflare deployment ${deployment.id} ended ${status}; read-only verification refuses repair`);
  if (attempt === 120) throw new Error(`Cloudflare deployment ${deployment.id} convergence timeout`);
  await sleep(10_000);
}
assert.equal(deployment.environment, expectedEnv, "Deployment environment drift");
assert.equal(
  deployment.deployment_trigger?.metadata?.commit_hash,
  commitHash,
  "Deployment commit drift",
);
assert.equal(statusOf(deployment), "success", "Deployment did not converge to success");
assert.equal(deployment.uses_functions, false, "Production deployment unexpectedly includes Pages Functions");
const deploymentUrl = String(deployment.url || "").replace(/\/+$/, "") + "/";
assert.match(deploymentUrl, /^https:\/\//, "Cloudflare deployment URL missing");
if (process.env.GITHUB_OUTPUT?.trim())
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `deployment_id=${deployment.id}\ndeployment_url=${deploymentUrl}\ndeployment_environment=${deployment.environment}\ndeployment_commit=${commitHash}\n`,
  );
console.log(
  JSON.stringify(
    {
      valid: true,
      readOnly: true,
      project: cf.pagesProject,
      productionBranch: cf.productionBranch,
      deploymentId: deployment.id,
      deploymentCommit: commitHash,
      deploymentUrl,
      usesFunctions: false,
    },
    null,
    2,
  ),
);
