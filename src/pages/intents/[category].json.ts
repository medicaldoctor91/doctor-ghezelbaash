import { getHeadings, rawContent } from '~/content/landing.md';
import { buildIntentCategories } from '~/compilers/search-corpus';
import { jsonResponse } from '~/compilers/utils';

export const prerender = true;
export function getStaticPaths() {
  return buildIntentCategories(rawContent(), getHeadings()).map((category) => ({ params: { category: category.slug }, props: { category } }));
}
export function GET({ props }: { props: { category: { slug: string; intents: unknown[] } } }) {
  return jsonResponse({ schemaVersion: '8.0', category: props.category.slug, count: props.category.intents.length, intents: props.category.intents });
}

