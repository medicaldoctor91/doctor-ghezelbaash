import { buildGlobalGraph } from './globalGraph.mjs';
import {
  applyCredentialAuthorityGraph,
  buildCredentialAuthorityGraphNodes
} from './credentialAuthorityGraph.mjs';

function mergeNodeList(nodes, additions) {
  const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));

  for (const addition of additions) {
    const id = addition['@id'];
    if (!id || !byId.has(id)) {
      nodes.push(addition);
      if (id) byId.set(id, addition);
      continue;
    }

    Object.assign(byId.get(id), addition);
  }

  return byId;
}

export function buildCredentialedGlobalGraph() {
  const graph = buildGlobalGraph();
  const nodes = graph['@graph'] || [];

  mergeNodeList(nodes, buildCredentialAuthorityGraphNodes());
  applyCredentialAuthorityGraph(nodes);

  return graph;
}
