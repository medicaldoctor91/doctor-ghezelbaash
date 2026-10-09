import assert from 'node:assert/strict';
import { configurePagesCi } from './configure-pages-ci.mjs';

const sha = 'a'.repeat(40);
const project = {
  production_branch: 'main', domains: ['doctor-ghezelbaash.pages.dev', 'www.ghezelbaash.ir'],
  source: { type: 'github', config: { owner: 'medicaldoctor91', repo_name: 'doctor-ghezelbaash', production_branch: 'main', production_deployments_enabled: true, preview_deployment_setting: 'none' } },
};
async function exercise(overrides = {}) {
  const requests = [];
  const data = structuredClone(overrides.project ?? project);
  const request = async (url, init = {}) => {
    requests.push({ url, method: init.method ?? 'GET', body: init.body });
    if (url.includes('api.github.com')) return { ok: true, json: async () => ({ object: { sha: overrides.mainSha ?? sha } }) };
    if (init.method === 'PATCH') {
      data.source = JSON.parse(init.body).source;
      return { ok: true, json: async () => ({ success: true, result: data }) };
    }
    return { ok: true, json: async () => ({ success: true, result: data }) };
  };
  const result = await configurePagesCi({ token: 'test-only', githubToken: 'test-only', sourceCommit: sha, request });
  return { result, requests, data };
}

const valid = await exercise();
assert.equal(valid.result.productionDeploymentsEnabled, false);
const changes = valid.requests.filter(r => r.method === 'PATCH');
assert.equal(changes.length, 1);
assert.equal(JSON.parse(changes[0].body).source.config.preview_deployment_setting, 'none');
assert.equal(JSON.parse(changes[0].body).source.config.production_deployments_enabled, false);
assert.deepEqual(Object.keys(JSON.parse(changes[0].body)), ['source']);

const configured = structuredClone(project);
configured.source.config.production_deployments_enabled = false;
assert.equal((await exercise({ project: configured })).requests.some(r => r.method === 'PATCH'), false, 'idempotent configuration');
await assert.rejects(exercise({ mainSha: 'b'.repeat(40) }), /current main/, 'superseded source cannot publish');
const foreign = structuredClone(project);
foreign.source.config.owner = 'someone-else';
await assert.rejects(exercise({ project: foreign }), /repository/, 'must not configure another repository');
const branch = structuredClone(project);
branch.production_branch = 'preview';
await assert.rejects(exercise({ project: branch }), /production branch/, 'must preserve production branch');
const domain = structuredClone(project);
domain.domains = ['another-site.pages.dev'];
await assert.rejects(exercise({ project: domain }), /canonical domain/, 'must preserve website identity');
console.log('PASS Pages delivery: main freshness, repository/domain guards, minimal idempotent settings update');
