import type { APIRoute } from 'astro';
import { SITE } from '@data/site';

export const GET: APIRoute = () => {
  const body = ['User-agent: *', 'Allow: /', '', `Sitemap: ${SITE.url}/sitemap-index.xml`, ''].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
