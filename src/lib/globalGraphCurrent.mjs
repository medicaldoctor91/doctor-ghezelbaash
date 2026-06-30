import { buildGlobalGraph as buildFullGlobalGraph } from './globalGraph.mjs';

const deferredPrefixes = [
  'https://www.ghezelbaash.ir/kg/' + 'advanced-knowledge-scope#'
];

function isDeferredId(id) {
  return typeof id === 'string' && deferredPrefixes.some((prefix) => id.startsWith(prefix));
}

function pruneValue(value) {
  if (Array.isArray(value)) return value.map(pruneValue).filter((item) => item !== null);

  if (value && typeof value === 'object') {
    if (isDeferredId(value['@id'])) return null;
    const next = {};
    for (const [key, innerValue] of Object.entries(value)) {
      const pruned = pruneValue(innerValue);
      if (pruned === null) continue;
      if (Array.isArray(pruned) && pruned.length === 0) continue;
      next[key] = pruned;
    }
    return next;
  }

  if (isDeferredId(value)) return null;
  return value;
}

export function buildGlobalGraph() {
  const graph = buildFullGlobalGraph();
  graph['@graph'] = (graph['@graph'] || [])
    .filter((node) => !isDeferredId(node?.['@id']))
    .map((node) => pruneValue(node));
  return graph;
}
