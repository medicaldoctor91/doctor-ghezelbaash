import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { importModuleFromSourceDirectory } from './lib/derived-module-loader.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ghezelbaash-derived-module-'));
const pagesDir = path.join(root, 'src/pages');
const libDir = path.join(root, 'src/lib');
await fs.mkdir(pagesDir, { recursive: true });
await fs.mkdir(libDir, { recursive: true });

const sourceFile = path.join(pagesDir, 'index.astro');
await fs.writeFile(sourceFile, '---\n// fixture\n---\n', 'utf8');
await fs.writeFile(path.join(libDir, 'fixture.mjs'), 'export const value = "relative-import-ok";\n', 'utf8');

const before = new Set(await fs.readdir(pagesDir));
const derived = await importModuleFromSourceDirectory(
  "import { value } from '../lib/fixture.mjs';\nexport const result = value;\n",
  sourceFile,
  'verify-fixture'
);
assert.equal(derived.result, 'relative-import-ok', 'Derived module must resolve imports relative to the Astro source directory');
const after = new Set(await fs.readdir(pagesDir));
assert.deepEqual(after, before, 'Derived module loader must remove its temporary sibling module');

await fs.rm(root, { recursive: true, force: true });
console.log('Derived module loader tests passed');
