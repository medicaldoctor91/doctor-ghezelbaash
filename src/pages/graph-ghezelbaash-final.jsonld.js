// Primary graph source contract: ../lib/globalGraph.mjs
import { buildCredentialedGlobalGraph } from '../lib/credentialedGlobalGraph.mjs';
import { applyLocalBusinessActionPass as enrichLocalGraph } from '../lib/localBusinessActionPass.mjs';
import { applySchemaOrgCompliancePass as cleanGraphNodes } from '../lib/schemaOrgCompliancePass.mjs';

export function GET() {
  const graph = buildCredentialedGlobalGraph();
  cleanGraphNodes(graph['@graph'] || []);
  enrichLocalGraph(graph['@graph'] || []);

  return new Response(JSON.stringify(graph, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/ld+json; charset=utf-8' }
  });
}
