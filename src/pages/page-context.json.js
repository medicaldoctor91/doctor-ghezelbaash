import { site } from '../data/site.mjs';
import { pageContexts } from '../lib/pageContext.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbash.page_context.astro.v1',
    dateModified: '2026-06-27',
    canonicalWebsite: site.canonicalBase + '/',
    pages: pageContexts
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
