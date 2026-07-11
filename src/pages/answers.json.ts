import { getHeadings, rawContent } from '~/content/landing.md';
import { buildAnswerShards } from '~/compilers/search-corpus';
import { jsonResponse } from '~/compilers/utils';
import { site } from '~/domain/entities';

export const prerender = true;
export function GET() {
  const shards = buildAnswerShards(rawContent(), getHeadings());
  return jsonResponse({ schemaVersion: '8.0', canonical: site.url, index: `${site.url}answers/index.json`, answerCount: shards.reduce((total, shard) => total + shard.records.length, 0), shards: shards.map((shard) => ({ url: `${site.url}answers/${shard.slug}.jsonl`, records: shard.records.length })) });
}
