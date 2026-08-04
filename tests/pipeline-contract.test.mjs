import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

test('development, validation and build commands never mutate semantic sources implicitly', async () => {
  const packageJson = await readJson('package.json');
  const scripts = packageJson.scripts ?? {};

  for (const hook of ['predev', 'precheck', 'pretest', 'prebuild']) {
    assert.equal(Object.hasOwn(scripts, hook), false, `${hook} must remain absent`);
  }

  assert.equal(scripts['generate:semantic'], 'node scripts/normalize-dataset-entity.mjs');
  assert.equal(Object.hasOwn(scripts, 'normalize:dataset'), false);
});

test('completed one-time Dataset migrations cannot return to the runtime pipeline', async () => {
  await assert.rejects(access('scripts/normalize-visible-dataset-copy.mjs'));
  await assert.rejects(access('scripts/retire-duplicate-datasets.mjs'));
});

test('CI verifies committed outputs without committing or pushing from automation', async () => {
  const qualityGate = await readFile('.github/workflows/quality-gate.yml', 'utf8');

  assert.ok(qualityGate.includes('permissions:\n  contents: read'));
  assert.ok(qualityGate.includes('npm run generate:semantic'));
  assert.ok(qualityGate.includes('git diff --exit-code'));
  assert.equal(/\bgit\s+(commit|push)\b/.test(qualityGate), false);
  await assert.rejects(access('.github/workflows/materialize-canonical-data.yml'));
});
