import { publicDataset } from '../data/dataset.mjs';
import { site } from '../data/site.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.dataset.astro.v1',
    canonicalWebsite: site.canonicalBase + '/',
    dataset: publicDataset
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
