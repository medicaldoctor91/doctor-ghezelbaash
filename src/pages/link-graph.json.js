import { site } from '../data/site.mjs';
import { pageContexts } from '../lib/pageContext.mjs';
import { getRouteByPath } from '../lib/routes.mjs';

export function GET() {
  const nodes = pageContexts.map((context) => ({
    id: context.path,
    url: context.url,
    label: context.label,
    kind: context.kind,
    priority: context.priority,
    schemaTargets: context.schemaTargets
  }));

  const edges = pageContexts.flatMap((context) =>
    context.outgoingLinks.map((targetPath) => {
      const target = getRouteByPath(targetPath);
      return {
        source: context.path,
        target: target.path,
        sourceKind: context.kind,
        targetKind: target.kind,
        targetUrl: target.url
      };
    })
  );

  const body = {
    schema: 'ghezelbash.internal_link_graph.astro.v1',
    dateModified: '2026-06-27',
    canonicalWebsite: site.canonicalBase + '/',
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
