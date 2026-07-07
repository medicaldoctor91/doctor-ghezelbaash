import { getCollection, getEntry } from 'astro:content';
import { SITE } from '~/site.config';

import type { JsonLdGraphDocument, JsonLdNode } from './jsonLd';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stableStringify = (value: unknown): string =>
  JSON.stringify(value, Object.keys(isRecord(value) ? value : {}).sort());

const nodeKey = (node: JsonLdNode): string => {
  const id = node['@id'];
  if (typeof id === 'string' && id) return id;

  const url = node.url;
  if (typeof url === 'string' && url) return url;

  const name = node.name;
  const type = node['@type'];
  if (typeof name === 'string' && name) return `${String(type ?? 'Thing')}::${name}`;

  return stableStringify(node);
};

const arrayKey = (value: unknown): string => {
  if (isRecord(value)) {
    const id = value['@id'];
    if (typeof id === 'string' && id) return `@id:${id}`;

    const url = value.url;
    if (typeof url === 'string' && url) return `url:${url}`;
  }

  return stableStringify(value);
};

const mergeArrays = (first: unknown[], second: unknown[]): unknown[] => {
  const values = new Map<string, unknown>();
  for (const item of [...first, ...second]) values.set(arrayKey(item), item);
  return Array.from(values.values());
};

const mergeValue = (base: unknown, incoming: unknown): unknown => {
  if (base === undefined) return incoming;
  if (incoming === undefined) return base;
  if (stableStringify(base) === stableStringify(incoming)) return base;

  if (Array.isArray(base) && Array.isArray(incoming)) return mergeArrays(base, incoming);
  if (Array.isArray(base)) return mergeArrays(base, [incoming]);
  if (Array.isArray(incoming)) return mergeArrays([base], incoming);

  if (isRecord(base) && isRecord(incoming)) return mergeNode(base, incoming);

  return base;
};

const mergeNode = (base: JsonLdNode, incoming: Record<string, unknown>): JsonLdNode => {
  const merged: JsonLdNode = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    merged[key] = mergeValue(merged[key], value);
  }
  return merged;
};

export const buildGeneratedCanonicalEntityGraph = async (): Promise<JsonLdGraphDocument> => {
  const graphSource = await getEntry('graphSources', 'entity-registry-source');
  const pageGraphs = await getCollection('pageStructuredData');

  if (!graphSource) {
    throw new Error('Missing entity registry source content collection entry.');
  }

  const nodes = new Map<string, JsonLdNode>();
  const addNode = (node: JsonLdNode) => {
    const key = nodeKey(node);
    const existing = nodes.get(key);
    nodes.set(key, existing ? mergeNode(existing, node) : node);
  };

  for (const node of graphSource.data['@graph']) addNode(node);
  for (const pageGraph of pageGraphs) {
    for (const node of pageGraph.data['@graph']) addNode(node);
  }

  const graph = Array.from(nodes.values()).sort((left, right) => nodeKey(left).localeCompare(nodeKey(right)));

  return {
    '@context': graphSource.data['@context'] ?? 'https://schema.org',
    '@graph': graph,
    version: graphSource.data.version ?? 'content-collection-entity-registry-source',
    dateModified: graphSource.data.dateModified,
    generatedFrom: ['src/content/graph-sources/entity-registry-source.json', 'src/content/page-structured-data/*.json'],
    canonicalUrl: `${SITE.site}/graph.json`,
  };
};
