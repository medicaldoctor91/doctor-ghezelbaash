import { getHeadings, rawContent } from '~/content/landing.md';
import { buildReverseIntentShards } from '~/compilers/search-corpus';
import { jsonResponse } from '~/compilers/utils';

export const prerender = true;
export function getStaticPaths() {
  return buildReverseIntentShards(rawContent(), getHeadings()).map((shard) => ({ params: { shard: shard.slug }, props: { records: shard.records } }));
}
export function GET({ props }: { props: { records: unknown[] } }) {
  return jsonResponse({ schemaVersion: '8.0', records: props.records });
}
