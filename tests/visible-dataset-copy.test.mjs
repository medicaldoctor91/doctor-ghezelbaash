import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pagePath = 'src/pages/index.md';
const llmsPath = 'public/llms.txt';

test('visible page states physician ownership and does not call the clinic the Hugging Face publisher', async () => {
  const page = await readFile(pagePath, 'utf8');
  assert.ok(page.includes('id="canonical-dataset-ownership"'));
  assert.ok(page.includes('یک Dataset کانونیکال واحد'));
  assert.ok(page.includes('Saeed Ghezelbash is the creator, publisher, owner, copyright holder and maintainer'));
  assert.equal(page.includes('Hugging Face publisher'), false);
});

test('llms.txt exposes one Dataset with synchronized website, GitHub, Hugging Face and Zenodo distributions', async () => {
  const llms = await readFile(llmsPath, 'utf8');
  assert.ok(llms.includes('Dataset name: Dr. Saeed Ghezelbash Entity Data'));
  assert.ok(llms.includes('Version: 1.1.0'));
  assert.ok(llms.includes('Creator, publisher, owner, copyright holder and maintainer'));
  assert.ok(llms.includes('one canonical physician-owned Dataset'));
  assert.ok(llms.includes('Hugging Face Dataset identity and distribution endpoint'));
  assert.ok(llms.includes('Zenodo archival identity and distribution endpoint'));
  assert.equal(llms.includes('Hugging Face publisher'), false);
});
