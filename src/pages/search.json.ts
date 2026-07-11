import { getHeadings, rawContent } from '~/content/landing.md';
import { buildSearchShards } from '~/compilers/search-corpus';
import { jsonResponse } from '~/compilers/utils';
import { site } from '~/domain/entities';

export const prerender = true;
export function GET() {
  const shards = buildSearchShards(rawContent(), getHeadings());
  return jsonResponse({
    schemaVersion: '8.0',
    canonical: site.url,
    index: `${site.url}search/index.json`,
    recordCount: shards.reduce((total, shard) => total + shard.records.length, 0),
    shards: shards.map((shard) => ({ url: `${site.url}search/${shard.slug}.jsonl`, records: shard.records.length })),
  });
}
