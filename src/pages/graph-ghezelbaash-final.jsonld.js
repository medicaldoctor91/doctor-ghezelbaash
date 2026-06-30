import { buildGlobalGraph } from '../lib/globalGraph.mjs';
import { applyLocalBusinessActionPass } from '../lib/localBusinessActionPass.mjs';
import { applySchemaOrgCompliancePass } from '../lib/schemaOrgCompliancePass.mjs';

export function GET() {
  const graph = buildGlobalGraph();
  applySchemaOrgCompliancePass(graph['@graph'] || []);
  applyLocalBusinessActionPass(graph['@graph'] || []);
  const type = 'application/' + 'ld+json; charset=utf-8';
  return new Response(JSON.stringify(graph, null, 2) + '\n', {
    headers: { 'Content-Type': type }
  });
}
