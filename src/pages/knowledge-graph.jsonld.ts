import { getHeadings, rawContent } from '~/content/landing.md';
import { buildCanonicalKnowledgeGraph } from '~/compilers/knowledge-graph';
import { applyHomepageGraphContract } from '~/compilers/homepage-graph-contract';
import { completeHomepageGraphContract } from '~/compilers/homepage-graph-completeness';
import { applyHomepageAuditFixes } from '~/compilers/homepage-graph-audit-fixes';
import { synchronizeHomepageGraph } from '~/compilers/homepage-graph-synchronization';
import { applyHomepageMissionGraph } from '~/compilers/homepage-mission-graph';

export const prerender = true;

export function GET() {
  const graph = applyHomepageMissionGraph(
    synchronizeHomepageGraph(
      applyHomepageAuditFixes(
        completeHomepageGraphContract(
          applyHomepageGraphContract(
            buildCanonicalKnowledgeGraph(getHeadings(), rawContent()),
          ),
        ),
      ),
    ),
  );
  return new Response(JSON.stringify(graph), {
    headers: {
      'Content-Type': 'application/ld+json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
