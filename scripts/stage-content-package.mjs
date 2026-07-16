import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { validateContentPackage } from './validate-content-package.mjs';

const input = process.argv[2];
const replace = process.argv.includes('--replace');
if (!input) {
  process.stderr.write('Usage: npm run content:stage -- <extracted-package-directory> [--replace]\n');
  process.exit(2);
}

const report = validateContentPackage(input);
if (!report.passed) {
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(1);
}

const target = resolve(process.cwd(), 'content-package/current');
if (existsSync(target) && !replace) {
  process.stderr.write('content-package/current already exists; pass --replace only after validating the intended replacement.\n');
  process.exit(2);
}

if (existsSync(target)) rmSync(target, { recursive: true, force: true });
mkdirSync(resolve(target, '..'), { recursive: true });
cpSync(report.root, target, { recursive: true, dereference: false, errorOnExist: true });
process.stdout.write(`Staged validated content package from ${basename(report.root)} at content-package/current.\n`);
