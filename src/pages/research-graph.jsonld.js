import { buildResearchGraph } from '../lib/researchGraph.mjs';

export function GET() {
  return new Response(JSON.stringify(buildResearchGraph(), null, 2) + '\n', {
    headers: { 'Content-Type': 'application/ld+json; charset=utf-8' }
  });
}
