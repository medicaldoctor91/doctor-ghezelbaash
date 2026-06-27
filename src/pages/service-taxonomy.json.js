import { serviceTaxonomy } from '../data/serviceTaxonomy.mjs';
import { site } from '../data/site.mjs';

export function GET() {
  return new Response(JSON.stringify({
    schema: 'ghezelbaash.service_taxonomy.astro.v1',
    canonicalWebsite: site.canonicalBase + '/',
    taxonomy: serviceTaxonomy
  }, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
