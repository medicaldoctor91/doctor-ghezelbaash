import { getHeadings, rawContent } from '~/content/landing.md';
import { buildFullGraphShards } from '~/compilers/full-graph';

export const prerender = true;
export function getStaticPaths() {
  return buildFullGraphShards(getHeadings(), rawContent()).map((shard) => ({ params: { slug: shard.slug }, props: { value: shard.value } }));
}
export function GET({ props }: { props: { value: unknown } }) {
  return new Response(JSON.stringify(props.value), { headers: { 'Content-Type': 'application/ld+json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });
}

