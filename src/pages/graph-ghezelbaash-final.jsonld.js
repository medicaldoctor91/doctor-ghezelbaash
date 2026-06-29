// Primary graph source contract: ../lib/globalGraph.mjs
import { buildGlobalGraph } from '../lib/globalGraph.mjs';
import { applyLocalBusinessActionPass as enrichLocalGraph } from '../lib/localBusinessActionPass.mjs';
import { applySchemaOrgCompliancePass as cleanGraphNodes } from '../lib/schemaOrgCompliancePass.mjs';

export function GET() {
  const graph = buildGlobalGraph();
  cleanGraphNodes(graph['@graph'] || []);
  enrichLocalGraph(graph['@graph'] || []);

  return new Response(JSON.stringify(graph, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/ld+json; charset=utf-8' }
  });
}
