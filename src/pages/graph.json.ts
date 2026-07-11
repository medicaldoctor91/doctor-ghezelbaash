import { getHeadings, rawContent } from '~/content/landing.md';
import { buildFullGraphShards } from '~/compilers/full-graph';
import { jsonResponse } from '~/compilers/utils';
import { site } from '~/domain/entities';

export const prerender = true;
export function GET() {
  const shards = buildFullGraphShards(getHeadings(), rawContent());
  return jsonResponse({
    schemaVersion: '8.0',
    deprecatedMonolith: true,
    canonical: site.url,
    replacement: `${site.url}graph/core.jsonld`,
    shards: shards.map(({ slug, bytes }) => ({ url: `${site.url}graph/${slug}.jsonld`, bytes })),
  });
}

