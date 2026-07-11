import { getHeadings, rawContent } from '~/content/landing.md';
import { buildAnswerShards } from '~/compilers/search-corpus';
import { jsonlResponse } from '~/compilers/utils';

export const prerender = true;
export function getStaticPaths() {
  return buildAnswerShards(rawContent(), getHeadings()).map((shard) => ({ params: { shard: shard.slug }, props: { records: shard.records } }));
}
export function GET({ props }: { props: { records: unknown[] } }) {
  return jsonlResponse(props.records);
}

