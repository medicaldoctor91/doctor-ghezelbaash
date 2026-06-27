import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'dist', 'link-graph.json');
let failed = false;

function fail(message) {
  console.error(message);
  failed = true;
}

if (!fs.existsSync(file)) {
  fail('missing dist/link-graph.json');
} else {
  const graph = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (graph.schema !== 'ghezelbash.internal_link_graph.astro.v1') fail('invalid link graph schema');
  if (!Array.isArray(graph.nodes) || graph.nodes.length < 8) fail('link graph has too few nodes');
  if (!Array.isArray(graph.edges) || graph.edges.length < graph.nodes.length) fail('link graph has too few edges');

  const paths = new Set(graph.nodes.map((node) => node.id));
  for (const requiredPath of [
    '/',
    '/dr-saeed-ghezelbash/',
    '/dr-saeed-ghezelbash-aesthetic-clinic/',
    '/services/',
    '/botox-kermanshah/',
    '/filler-kermanshah/',
    '/thread-lift-kermanshah/',
    '/skin-hair-rejuvenation-kermanshah/',
    '/double-chin-liposuction-kermanshah/',
    '/contact/'
  ]) {
    if (!paths.has(requiredPath)) fail(`link graph missing node ${requiredPath}`);
  }

  for (const edge of graph.edges) {
    if (!paths.has(edge.source)) fail(`link graph edge has unknown source ${edge.source}`);
    if (!paths.has(edge.target)) fail(`link graph edge has unknown target ${edge.target}`);
    if (!edge.sourceKind || !edge.targetKind) fail('link graph edge missing route kind');
  }
}

if (failed) process.exit(1);
console.log('Internal link graph validation passed');
