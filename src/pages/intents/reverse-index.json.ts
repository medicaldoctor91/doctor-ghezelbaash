import { getHeadings, rawContent } from '~/content/landing.md';
import { buildReverseIntentShards } from '~/compilers/search-corpus';
import { jsonResponse } from '~/compilers/utils';
import { site } from '~/domain/entities';

export const prerender = true;
export function GET() {
  const shards = buildReverseIntentShards(rawContent(), getHeadings());
  return jsonResponse({ schemaVersion: '8.0', count: shards.reduce((n, shard) => n + shard.records.length, 0), shards: shards.map((shard) => ({ url: `${site.url}intents/reverse/${shard.slug}.json`, records: shard.records.length })) });
}

