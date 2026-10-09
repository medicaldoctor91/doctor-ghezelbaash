import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const repository = 'medicaldoctor91/doctor-ghezelbaash';
const projectUrl = 'https://api.cloudflare.com/client/v4/accounts/884d1d90bd1fb6ecca14992c6c60d677/pages/projects/doctor-ghezelbaash';

export function assertVerifiedRelease(provenance, report, sourceCommit) {
  assert.equal(provenance.sourceCommit, sourceCommit, 'Published artifact source must match current main');
  assert.equal(report.sourceCommit, sourceCommit, 'Verification report source must match published artifact');
  assert.equal(report.status, 'PASS', 'A verified release is required');
  assert.equal(report.postSealReadOnly, true, 'Final verification must preserve read-only sealed bytes');
}

export async function configurePagesCi({ token, githubToken, sourceCommit, request = fetch }) {
  assert.ok(token, 'Cloudflare API token is required');
  assert.match(sourceCommit ?? '', /^[a-f0-9]{40}$/, 'source commit must be a Git SHA');
  async function json(url, init = {}) {
    const response = await request(url, { ...init, signal: AbortSignal.timeout(30_000) });
    assert.ok(response.ok, `Pages delivery API request failed: ${response.status ?? 'unknown'}`);
    const value = await response.json();
    assert.notEqual(value.success, false, 'Cloudflare rejected Pages delivery configuration');
    return value;
  }
  const main = await json(`https://api.github.com/repos/${repository}/git/ref/heads/main`, {
    headers: { Accept: 'application/vnd.github+json', ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}) },
  });
  assert.equal(main.object?.sha, sourceCommit, 'Only current main may publish to production');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const { result: project } = await json(projectUrl, { headers });
  assert.equal(project.production_branch, 'main', 'Unexpected production branch');
  assert.ok(project.domains?.includes('www.ghezelbaash.ir'), 'Missing canonical domain');
  assert.equal(project.source?.type, 'github', 'Unexpected source repository integration');
  const config = project.source.config;
  assert.equal(`${config.owner}/${config.repo_name}`, repository, 'Unexpected source repository');
  assert.equal(config.production_branch, 'main', 'Unexpected source production branch');
  if (config.production_deployments_enabled !== false) {
    const source = { ...project.source, config: { ...config, production_deployments_enabled: false } };
    const update = await json(projectUrl, { method: 'PATCH', headers, body: JSON.stringify({ source }) });
    assert.equal(update.result?.source?.config?.production_deployments_enabled, false, 'Git builds must be disabled before verified direct upload');
  }
  return { repository, project: 'doctor-ghezelbaash', productionBranch: 'main', productionDeploymentsEnabled: false, sourceCommit };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const provenance = JSON.parse(await fs.readFile(new URL('../dist/release-provenance.json', import.meta.url), 'utf8'));
  const report = JSON.parse(await fs.readFile(new URL('../release/verification-report.json', import.meta.url), 'utf8'));
  assertVerifiedRelease(provenance, report, process.env.GITHUB_SHA);
  console.log(JSON.stringify(await configurePagesCi({ token: process.env.CLOUDFLARE_API_TOKEN, githubToken: process.env.GITHUB_TOKEN, sourceCommit: process.env.GITHUB_SHA }), null, 2));
}
