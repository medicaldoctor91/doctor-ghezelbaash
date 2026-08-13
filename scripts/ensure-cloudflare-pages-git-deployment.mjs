import assert from 'node:assert/strict';

const API_ROOT = 'https://api.cloudflare.com/client/v4';
const EXPECTED_PROJECT = 'doctor-ghezelbaash';
const EXPECTED_BRANCH = 'main';
const EXPECTED_BUILD = Object.freeze({
  build_command: 'npm ci --ignore-scripts && npm run build',
  destination_dir: 'dist',
  root_dir: '',
});

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const statusOf = deployment => deployment?.latest_stage?.status
  ?? deployment?.stages?.at(-1)?.status
  ?? 'unknown';

export function projectPatch(sourceType = 'github') {
  return {
    production_branch: EXPECTED_BRANCH,
    build_config: {...EXPECTED_BUILD},
    source: {
      type: sourceType,
      config: {
        deployments_enabled: true,
        production_branch: EXPECTED_BRANCH,
        production_deployments_enabled: true,
        preview_deployment_setting: 'none',
      },
    },
  };
}

export function safeProjectState(project) {
  const source = project?.source ?? {};
  const config = source.config ?? {};
  const build = project?.build_config ?? {};
  return {
    name: project?.name ?? null,
    productionBranch: project?.production_branch ?? null,
    sourceType: source.type ?? null,
    repository: config.owner && config.repo_name ? `${config.owner}/${config.repo_name}` : null,
    deploymentsEnabled: config.deployments_enabled ?? null,
    productionDeploymentsEnabled: config.production_deployments_enabled ?? null,
    previewDeploymentSetting: config.preview_deployment_setting ?? null,
    buildCommand: build.build_command ?? null,
    destinationDir: build.destination_dir ?? null,
    rootDir: build.root_dir ?? null,
  };
}

export function projectIsExact(project, expectedRepository) {
  const state = safeProjectState(project);
  return state.name === EXPECTED_PROJECT
    && state.productionBranch === EXPECTED_BRANCH
    && state.sourceType === 'github'
    && state.repository === expectedRepository
    && state.deploymentsEnabled === true
    && state.productionDeploymentsEnabled === true
    && state.previewDeploymentSetting === 'none'
    && state.buildCommand === EXPECTED_BUILD.build_command
    && state.destinationDir === EXPECTED_BUILD.destination_dir
    && (state.rootDir === EXPECTED_BUILD.root_dir || state.rootDir === '/');
}

export function findGitDeployment(deployments, commitHash) {
  return deployments
    .filter(item => item?.deployment_trigger?.type === 'github:push')
    .filter(item => item?.deployment_trigger?.metadata?.commit_hash === commitHash)
    .sort((left, right) => String(right.created_on).localeCompare(String(left.created_on)))[0] ?? null;
}

async function selfTest() {
  const patch = projectPatch();
  assert.equal(patch.source.config.production_deployments_enabled, true);
  assert.equal(patch.source.config.deployments_enabled, true);
  assert.equal(patch.source.config.preview_deployment_setting, 'none');
  assert.equal(patch.build_config.destination_dir, 'dist');
  const project = {
    name: EXPECTED_PROJECT,
    production_branch: EXPECTED_BRANCH,
    source: {
      type: 'github',
      config: {
        owner: 'medicaldoctor91',
        repo_name: EXPECTED_PROJECT,
        ...patch.source.config,
      },
    },
    build_config: patch.build_config,
  };
  assert.equal(projectIsExact(project, 'medicaldoctor91/doctor-ghezelbaash'), true);
  const wanted = {created_on: '2026-08-13T02:00:00Z', deployment_trigger: {type: 'github:push', metadata: {commit_hash: 'abc'}}};
  assert.equal(findGitDeployment([
    {created_on: '2026-08-13T03:00:00Z', deployment_trigger: {type: 'ad_hoc', metadata: {commit_hash: 'abc'}}},
    wanted,
  ], 'abc'), wanted);
  console.log('CLOUDFLARE_PAGES_GIT_DEPLOYMENT_SELF_TEST_OK');
}

async function main() {
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const projectName = process.env.CF_PROJECT?.trim();
  const commitHash = process.env.GITHUB_SHA?.trim();
  const expectedRepository = process.env.GITHUB_REPOSITORY?.trim();
  assert(token, 'CLOUDFLARE_API_TOKEN is required');
  assert(accountId, 'CLOUDFLARE_ACCOUNT_ID is required');
  assert.equal(projectName, EXPECTED_PROJECT, 'Unexpected Cloudflare Pages project');
  assert(/^[0-9a-f]{40}$/.test(commitHash ?? ''), 'GITHUB_SHA must be a full commit SHA');
  assert.equal(expectedRepository, 'medicaldoctor91/doctor-ghezelbaash', 'Unexpected GitHub repository');

  const base = `/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}`;
  const request = async (path, {method = 'GET', body} = {}) => {
    const response = await fetch(`${API_ROOT}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? {'content-type': 'application/json'} : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(45_000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success !== true) {
      const errors = (payload?.errors ?? []).map(error => `${error.code ?? 'unknown'}:${error.message ?? 'unknown'}`).join(', ');
      throw new Error(`Cloudflare API ${method} ${path} failed: HTTP ${response.status}${errors ? ` (${errors})` : ''}`);
    }
    return payload.result;
  };

  let project = await request(base);
  const before = safeProjectState(project);
  const resumedDuringThisRun = before.deploymentsEnabled === false || before.productionDeploymentsEnabled === false;
  console.log(`CLOUDFLARE_PAGES_PROJECT_BEFORE ${JSON.stringify(before)}`);
  assert.equal(before.name, EXPECTED_PROJECT, 'Cloudflare Pages project name drift');
  assert.equal(before.sourceType, 'github', 'Cloudflare Pages project is not connected to GitHub');
  assert.equal(before.repository, expectedRepository, 'Cloudflare Pages repository link drift');

  if (!projectIsExact(project, expectedRepository)) {
    await request(base, {method: 'PATCH', body: projectPatch(before.sourceType)});
    project = await request(base);
  }
  const after = safeProjectState(project);
  console.log(`CLOUDFLARE_PAGES_PROJECT_AFTER ${JSON.stringify(after)}`);
  assert(projectIsExact(project, expectedRepository), 'Cloudflare Pages production deployment settings did not converge');

  let deployment = null;
  const gitEventAttempts = resumedDuringThisRun ? 3 : 30;
  for (let attempt = 1; attempt <= gitEventAttempts && !deployment; attempt += 1) {
    const deployments = await request(`${base}/deployments?per_page=25`);
    deployment = findGitDeployment(deployments, commitHash);
    if (!deployment) {
      console.log(`CLOUDFLARE_GIT_EVENT_WAIT attempt=${attempt}`);
      await sleep(3_000);
    }
  }
  assert(deployment, resumedDuringThisRun
    ? `Cloudflare Pages was resumed after this push; a fresh push is required to create a github:push deployment for ${commitHash}`
    : `No github:push Pages deployment recorded for ${commitHash}`);

  if (deployment.is_skipped === true && deployment.skip_reason === 'production_deployments_disabled') {
    console.log(`CLOUDFLARE_GIT_DEPLOYMENT_RETRY id=${deployment.id} reason=${deployment.skip_reason}`);
    deployment = await request(`${base}/deployments/${encodeURIComponent(deployment.id)}/retry`, {method: 'POST'});
  }
  assert.equal(deployment.is_skipped, false, `Git deployment remained skipped: ${deployment.skip_reason ?? 'unknown'}`);

  for (let attempt = 1; attempt <= 120; attempt += 1) {
    deployment = await request(`${base}/deployments/${encodeURIComponent(deployment.id)}`);
    const status = statusOf(deployment);
    console.log(`CLOUDFLARE_GIT_DEPLOYMENT_STATUS id=${deployment.id} attempt=${attempt} status=${status}`);
    if (status === 'success') break;
    if (status === 'failure' || status === 'canceled') {
      const stages = (deployment.stages ?? []).map(stage => `${stage.name}:${stage.status}`).join(',');
      throw new Error(`Cloudflare Git deployment ${deployment.id} ${status}; stages=${stages}`);
    }
    if (attempt === 120) throw new Error(`Cloudflare Git deployment ${deployment.id} did not finish in 20 minutes`);
    await sleep(10_000);
  }

  assert.equal(deployment.environment, 'production', 'Git deployment did not target production');
  assert.equal(deployment.deployment_trigger?.type, 'github:push', 'Deployment was not triggered by GitHub integration');
  assert.equal(deployment.deployment_trigger?.metadata?.commit_hash, commitHash, 'Deployed commit drift');
  assert.equal(statusOf(deployment), 'success', 'Cloudflare Git deployment did not succeed');
  console.log(`CLOUDFLARE_GIT_DEPLOYMENT_PROVEN id=${deployment.id} commit=${commitHash} url=${deployment.url}`);
}

if (process.argv.includes('--self-test')) {
  await selfTest();
} else {
  await main();
}
