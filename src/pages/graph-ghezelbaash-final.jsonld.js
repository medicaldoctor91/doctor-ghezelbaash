import { buildGlobalGraph } from '../lib/globalGraph.mjs';
import { applySchemaOrgCompliancePass as cleanGraphNodes } from '../lib/schemaOrgCompliancePass.mjs';

export function GET() {
  const graph = buildGlobalGraph();
  cleanGraphNodes(graph['@graph'] || []);

  return new Response(JSON.stringify(graph, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/ld+json; charset=utf-8' }
  });
}
