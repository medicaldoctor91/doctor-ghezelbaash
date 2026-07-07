import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '~/site.config';
import { getUiCopy } from '~/utils/uiCopy';

export const prerender = true;

export async function GET(context: APIContext) {
  const pages = await getCollection('pages');
  const uiCopy = await getUiCopy<{ rss: { title: string; description: string; language: string } }>();

  return rss({
    title: uiCopy.rss.title,
    description: uiCopy.rss.description,
    site: context.site?.toString() ?? SITE.site,
    customData: `<language>${uiCopy.rss.language}</language>`,
    items: pages.map((entry) => ({
      title: entry.data.title,
      description: entry.data.description,
      link: entry.data.path,
    })),
  });
}
