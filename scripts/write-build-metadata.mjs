import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const publicDir = path.join(root, 'public');
fs.mkdirSync(publicDir, { recursive: true });

const commit = process.env.GITHUB_SHA || 'local';
const branch = process.env.GITHUB_REF_NAME || 'main';
const runId = process.env.GITHUB_RUN_ID || null;
const generatedAt = new Date().toISOString();

const status = {
  schema: 'ghezelbaash.deploy_status.v1',
  stage: 'production-astro-main',
  generatedAt,
  source: {
    repository: 'medicaldoctor91/doctor-ghezelbaash',
    branch,
    commit,
    runId
  },
  canonicalWebsite: 'https://www.ghezelbaash.ir/',
  expectedRuntime: 'Astro static build on GitHub Pages Actions',
  verification: [
    'https://www.ghezelbaash.ir/deploy-status.json',
    'https://www.ghezelbaash.ir/services.json',
    'https://www.ghezelbaash.ir/sameas.json',
    'https://www.ghezelbaash.ir/sitemap.xml'
  ]
};

fs.writeFileSync(path.join(publicDir, 'deploy-status.json'), JSON.stringify(status, null, 2) + '\n');
fs.writeFileSync(
  path.join(publicDir, 'deploy-status.txt'),
  `doctor-ghezelbaash Astro production build\nstage=${status.stage}\ncommit=${commit}\nbranch=${branch}\ngeneratedAt=${generatedAt}\n`
);
fs.writeFileSync(path.join(publicDir, '.nojekyll'), '');

console.log(`wrote deploy status for ${commit}`);
