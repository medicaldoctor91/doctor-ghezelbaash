import { getHeadings, rawContent } from '~/content/landing.md';
import { buildCanonicalKnowledgeGraph } from '~/compilers/knowledge-graph';

export const prerender = true;

export function GET() {
  return new Response(JSON.stringify(buildCanonicalKnowledgeGraph(getHeadings(), rawContent())), {
    headers: {
      'Content-Type': 'application/ld+json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
