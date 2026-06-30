import { buildGlobalGraph } from '../lib/globalGraph.mjs';

export function GET() {
  const graph = buildGlobalGraph();
  return new Response(JSON.stringify(graph, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
