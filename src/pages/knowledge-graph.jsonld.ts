import { getHeadings, rawContent } from '~/content/landing.md';
import { buildCanonicalKnowledgeGraph } from '~/compilers/knowledge-graph';
import { applyHomepageGraphContract } from '~/compilers/homepage-graph-contract';

export const prerender = true;

export function GET() {
  const graph = applyHomepageGraphContract(buildCanonicalKnowledgeGraph(getHeadings(), rawContent()));
  return new Response(JSON.stringify(graph), {
    headers: {
      'Content-Type': 'application/ld+json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
