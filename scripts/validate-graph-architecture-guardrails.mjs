import fs from 'node:fs';
import path from 'node:path';
import { absoluteUrl } from '../src/data/site.mjs';
import { GET as getPrimaryGraphResponse } from '../src/pages/graph-ghezelbaash-final.jsonld.js';

let failed = false;
function fail(message) {
  console.error(message);
  failed = true;
}
function refs(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}
function types(node) {
  return refs(node?.['@type']);
}
function visit(value, callback, pathLabel = '$') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, callback, `${pathLabel}[${index}]`));
    return;
  }
  callback(value, pathLabel);
  for (const [key, child] of Object.entries(value)) visit(child, callback, `${pathLabel}.${key}`);
}
async function loadPublishedPrimaryGraphForGuardrails() {
  const response = await getPrimaryGraphResponse();
  const text = await response.text();
  return JSON.parse(text);
}

const repoRoot = process.cwd();
const forbiddenParallelFiles = [
  'src/lib/expandedMedicalKnowledgeGraph.mjs'
];
for (const file of forbiddenParallelFiles) {
  if (fs.existsSync(path.join(repoRoot, file))) fail(`parallel graph layer must not exist: ${file}`);
}

for (const [file, needle] of [
  ['src/lib/credentialedGlobalGraph.mjs', 'expandedMedicalKnowledgeGraph'],
  ['src/lib/globalGraph.mjs', 'expandedMedicalKnowledgeGraph'],
  ['src/pages/graph-ghezelbaash-final.jsonld.js', 'expandedMedicalKnowledgeGraph']
]) {
  const fullPath = path.join(repoRoot, file);
  if (fs.existsSync(fullPath) && fs.readFileSync(fullPath, 'utf8').includes(needle)) {
    fail(`${file} imports or references forbidden parallel layer ${needle}`);
  }
}

const graph = await loadPublishedPrimaryGraphForGuardrails();
const nodes = graph['@graph'] || [];
const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));

for (const node of nodes) {
  if (types(node).includes('Review')) fail(`Review nodes are outside the active graph plan: ${node['@id'] || node.name}`);
}

const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
const physician = byId.get(absoluteUrl('/#physician'));
for (const entity of [person, physician].filter(Boolean)) {
  const minc = refs(entity.identifier).find((item) => item?.propertyID === 'MINC');
  if (!minc) fail(`${entity['@id']} missing MINC public authority identifier`);
}

const forbiddenPlanningKeys = new Set(['risk', 'action', 'pending', 'addNow', 'addLater']);
visit(graph, (item, pathLabel) => {
  for (const key of Object.keys(item)) {
    if (forbiddenPlanningKeys.has(key)) fail(`planning metadata leaked into published primary graph at ${pathLabel}: ${key}`);
  }
});

if (failed) process.exit(1);
console.log('Graph architecture guardrails passed');
