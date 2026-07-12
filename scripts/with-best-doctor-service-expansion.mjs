import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { renderExpandedBestDoctorMarkdown } from '../src/domain/best-doctor-service-expansion.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const landingPath = join(root, 'src', 'content', 'landing.md');
const hubHeading = '## پاسخ مستقیم به جست‌وجوهای «بهترین دکتر زیبایی در کرمانشاه»';
const generatedMarkdown = renderExpandedBestDoctorMarkdown().trim();
const generatedBlock = `\n\n${generatedMarkdown}`;

function stripGeneratedBlock(source) {
  const start = source.indexOf(generatedBlock);
  if (start < 0) return source;
  const after = start + generatedBlock.length;
  return `${source.slice(0, start).replace(/\n{3,}$/, '\n\n')}${source.slice(after).replace(/^\n{3,}/, '\n\n')}`;
}

function injectGeneratedBlock() {
  const original = stripGeneratedBlock(readFileSync(landingPath, 'utf8'));
  const hubStart = original.indexOf(hubHeading);
  if (hubStart < 0) throw new Error('Featured best-doctor hub heading was not found in landing.md.');
  const boundary = original.indexOf('\n---\n\n## ', hubStart + hubHeading.length);
  if (boundary < 0) throw new Error('The end boundary of the featured best-doctor hub was not found.');
  writeFileSync(landingPath, `${original.slice(0, boundary)}${generatedBlock}${original.slice(boundary)}`, 'utf8');
  return original;
}

function restoreOriginal(original) {
  writeFileSync(landingPath, original, 'utf8');
}

const targetScript = process.argv[2];
if (!targetScript) {
  console.error('Usage: node scripts/with-best-doctor-service-expansion.mjs <npm-script>');
  process.exit(2);
}

const original = injectGeneratedBlock();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npmCommand, ['run', targetScript], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

let forwardedSignal = null;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    forwardedSignal = signal;
    if (!child.killed) child.kill(signal);
  });
}

child.on('error', (error) => {
  restoreOriginal(original);
  console.error(error);
  process.exit(1);
});

child.on('close', (code, signal) => {
  restoreOriginal(original);
  const exitSignal = forwardedSignal ?? signal;
  if (exitSignal === 'SIGINT') process.exit(130);
  if (exitSignal === 'SIGTERM') process.exit(143);
  process.exit(code ?? 1);
});
