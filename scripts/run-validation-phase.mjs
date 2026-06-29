import { spawnSync } from 'node:child_process';

const phases = {
  source: [
    ['repo hygiene', 'scripts/validate-repo-hygiene.mjs'],
    ['source contract', 'scripts/validate-source-contract.mjs'],
    ['machine assets', 'scripts/validate-machine-assets.mjs']
  ],
  schema: [
    ['schema entities', 'scripts/validate-schema-entities.mjs'],
    ['schema property expansion', 'scripts/validate-schema-property-expansion.mjs']
  ],
  authority: [
    ['research consolidation', 'scripts/validate-research-consolidation.mjs'],
    ['research evidence graph', 'scripts/validate-research-evidence-graph.mjs'],
    ['credential authority graph', 'scripts/validate-credential-authority-graph.mjs']
  ],
  'primary-graph': [
    ['primary graph completion', 'scripts/validate-primary-graph-completion.mjs'],
    ['primary graph relations', 'scripts/validate-primary-graph-relations.mjs'],
    ['primary graph final layer', 'scripts/validate-primary-graph-final-layer.mjs'],
    ['medical knowledge graph', 'scripts/validate-medical-knowledge-graph.mjs'],
    ['graph architecture guardrails', 'scripts/validate-graph-architecture-guardrails.mjs']
  ],
  dist: [
    ['dist artifacts', 'scripts/validate-dist.mjs'],
    ['primary graph dist', 'scripts/validate-primary-graph-dist.mjs'],
    ['medical knowledge dist', 'scripts/validate-medical-knowledge-dist.mjs'],
    ['research evidence dist', 'scripts/validate-research-evidence-dist.mjs'],
    ['credential authority dist', 'scripts/validate-credential-authority-dist.mjs'],
    ['llms assets', 'scripts/validate-llms-assets.mjs'],
    ['page context', 'scripts/validate-page-context.mjs']
  ]
};

const prebuildPhases = ['source', 'schema', 'authority', 'primary-graph'];
const allPhases = [...prebuildPhases, 'dist'];
const requestedPhase = process.argv[2] || 'prebuild';
const selectedPhases = requestedPhase === 'prebuild' ? prebuildPhases : requestedPhase === 'all' ? allPhases : [requestedPhase];

if (!selectedPhases.every((phase) => phases[phase])) {
  console.error(`Unknown validation phase: ${requestedPhase}`);
  console.error(`Available phases: prebuild, all, ${allPhases.join(', ')}`);
  process.exit(1);
}

function runValidator(label, scriptPath) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
    env: process.env
  });

  if (result.error) {
    console.error(`✖ ${label}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`✖ ${label} failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }

  console.log(`✓ ${label}`);
}

for (const phase of selectedPhases) {
  console.log(`\n=== validate:${phase} ===`);
  for (const [label, scriptPath] of phases[phase]) {
    runValidator(label, scriptPath);
  }
}

console.log(`\nValidation phase complete: ${requestedPhase}`);
