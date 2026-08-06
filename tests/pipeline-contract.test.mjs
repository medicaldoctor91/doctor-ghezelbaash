import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

async function isTracked(pathname) {
  try {
    await access(pathname);
    return true;
  } catch {
    return false;
  }
}

test('all entry points build semantic assets from one canonical full graph', async () => {
  const packageJson = await readJson('package.json');
  const scripts = packageJson.scripts ?? {};

  for (const hook of ['predev', 'precheck', 'pretest', 'prebuild']) {
    assert.equal(Object.hasOwn(scripts, hook), false, `${hook} must remain absent`);
  }

  assert.equal(scripts['generate:semantic'], 'node scripts/build-semantic-assets.mjs');
  for (const command of ['dev', 'build', 'check', 'test', 'validate']) {
    assert.match(scripts[command], /(?:npm run generate:semantic|scripts\/build-semantic-assets\.mjs)/, `${command} must materialize generated semantic assets`);
  }

  const builder = await readFile('scripts/build-semantic-assets.mjs', 'utf8');
  assert.match(builder, /public\/graph\.jsonld/);
  assert.match(builder, /src\/data\/semantic\/head-graph\.min\.jsonld/);
  assert.match(builder, /public\/graph\.ttl/);
  assert.equal(builder.includes('normalize-dataset-entity.mjs'), false);
});

test('generated projections are ignored and parallel semantic patchers are absent', async () => {
  const gitignore = await readFile('.gitignore', 'utf8');
  assert.match(gitignore, /^src\/data\/semantic\/head-graph\.min\.jsonld$/m);
  assert.match(gitignore, /^public\/graph\.ttl$/m);

  for (const retired of [
    'scripts/normalize-dataset-entity.mjs',
    'scripts/normalize-visible-dataset-copy.mjs',
    'scripts/retire-duplicate-datasets.mjs',
  ]) {
    assert.equal(await isTracked(retired), false, `${retired} must remain absent`);
  }
});

test('CI uses one read-only validation and deployment path', async () => {
  const qualityGate = await readFile('.github/workflows/quality-gate.yml', 'utf8');

  assert.ok(qualityGate.includes('permissions:\n  contents: read'));
  assert.ok(qualityGate.includes('run: npm run validate'));
  assert.ok(qualityGate.includes('run: node scripts/verify-live.mjs'));
  assert.equal(qualityGate.includes('git diff --exit-code'), false);
  assert.equal(/\bgit\s+(commit|push)\b/.test(qualityGate), false);
  assert.equal(qualityGate.includes('upload-artifact'), false);
  assert.equal(qualityGate.includes('download-artifact'), false);
  await assert.rejects(access('.github/workflows/materialize-canonical-data.yml'));
  await assert.rejects(access('.github/workflows/live-contract.yml'));
});
