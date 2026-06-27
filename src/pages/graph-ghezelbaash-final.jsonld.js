import { buildGlobalGraph } from '../lib/schema.mjs';

export function GET() {
  return new Response(JSON.stringify(buildGlobalGraph(), null, 2) + '\n', {
    headers: { 'Content-Type': 'application/ld+json; charset=utf-8' }
  });
}
