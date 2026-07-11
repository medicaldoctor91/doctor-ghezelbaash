import { getHeadings, rawContent } from '~/content/landing.md';
import { buildIntentCategories, buildIntentControlRegistry } from '~/compilers/search-corpus';
import { jsonResponse } from '~/compilers/utils';
import { site } from '~/domain/entities';

export const prerender = true;
export function GET() {
  const raw = rawContent();
  const headings = getHeadings();
  const registry = buildIntentControlRegistry(raw, headings);
  const categories = buildIntentCategories(raw, headings);
  const statuses = Object.fromEntries([...new Set(registry.map((intent: any) => intent.status))].map((status) => [status, registry.filter((intent: any) => intent.status === status).length]));
  return jsonResponse({ schemaVersion: '8.0', canonical: site.url, count: registry.length, statuses, reverseIndex: `${site.url}intents/reverse-index.json`, categories: categories.map((item) => ({ id: item.slug, count: item.intents.length, url: `${site.url}intents/${item.slug}.json` })) });
}

