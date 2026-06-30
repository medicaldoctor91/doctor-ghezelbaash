import { buildGlobalGraph } from '../lib/globalGraph.mjs';

export function GET() {
  const graph = buildGlobalGraph();
  const type = 'application/' + 'ld+json; charset=utf-8';
  return new Response(JSON.stringify(graph, null, 2) + '\n', {
    headers: { 'Content-Type': type }
  });
}
