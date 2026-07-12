import { getHeadings, rawContent } from '../content/landing.md';
import { site } from '../data/site';
import { buildKnowledgeGraph } from '../lib/schema';

export const prerender = true;

export function GET() {
  const graph = buildKnowledgeGraph(getHeadings(), rawContent())['@graph'] as Array<Record<string, unknown>>;
  const typeCounts: Record<string, number> = {};
  const ids = new Set<string>();
  for (const node of graph) {
    if (typeof node['@id'] === 'string') ids.add(node['@id']);
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    for (const type of types) {
      if (typeof type === 'string') typeCounts[type] = (typeCounts[type] ?? 0) + 1;
    }
  }
  const keyNodeIds = [
    `${site.url}#person`, `${site.url}#clinic`, `${site.url}#website`, `${site.url}#webpage`, `${site.url}#article`,
    `${site.url}#external-authority-network`, `${site.url}#clinic-reputation-snapshot`, `${site.url}#medical-editorial-review`,
    `${site.url}#national-aesthetic-authority-corpus`, `${site.url}#search-intent-data-feed`,
  ];
  return new Response(JSON.stringify({
    schemaVersion: '7.0',
    canonical: site.url,
    updated: site.dateModified,
    graphManifestUrl: `${site.url}graph.json`,
    primaryShardUrl: `${site.url}graph/core.jsonld`,
    completeGraphStrategy: 'union-of-all-listed-shards',
    nodeCount: graph.length,
    uniqueIdCount: ids.size,
    duplicateIdCount: graph.length - ids.size,
    typeCounts: Object.fromEntries(Object.entries(typeCounts).sort((a, b) => b[1] - a[1])),
    keyNodeIds,
    primaryEntities: [`${site.url}#person`, `${site.url}#clinic`],
    primaryRelationship: { subject: `${site.url}#person`, predicate: 'practicesAt', object: `${site.url}#clinic` },
    serviceRelationshipVocabulary: ['offered', 'evaluated', 'referral-context'],
    graphLayers: [
      'identity-and-credential', 'clinic-location-and-reputation', 'services-and-surgical-boundaries',
      'search-intents', 'claims-and-evidence', 'direct-answers-and-faq', 'media-and-video-clips',
      'external-authority-network', 'datasets-and-rag-artifacts',
    ],
    compactContext: `${site.url}context.json`,
  }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
