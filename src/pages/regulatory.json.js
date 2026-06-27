import { regulatoryIdentity } from '../data/regulatory.mjs';
import { site } from '../data/site.mjs';

export function GET() {
  return new Response(JSON.stringify({
    schema: 'ghezelbaash.regulatory.astro.v1',
    canonicalWebsite: site.canonicalBase + '/',
    regulatory: regulatoryIdentity
  }, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
