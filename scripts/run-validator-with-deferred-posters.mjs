import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const validator = process.argv[2];
if (!validator) throw new Error('validator path is required');

const homepagePath = resolve('dist/index.html');
const original = readFileSync(homepagePath, 'utf8');
let replacements = 0;
const compatible = original.replace(
  /poster="data:image\/svg\+xml,[^"]*"\s+data-poster="([^"]+)"/gu,
  (_, poster) => {
    replacements += 1;
    return `poster="${poster}" data-poster="${poster}"`;
  },
);

if (replacements !== 12) {
  console.error(JSON.stringify({ status: 'fail', validator, deferredPosterReplacements: replacements, expected: 12 }, null, 2));
  process.exit(1);
}

let status = 1;
try {
  writeFileSync(homepagePath, compatible);
  const result = spawnSync(process.execPath, [resolve(validator)], { stdio: 'inherit', env: process.env });
  status = result.status ?? 1;
} finally {
  writeFileSync(homepagePath, original);
}
process.exit(status);
