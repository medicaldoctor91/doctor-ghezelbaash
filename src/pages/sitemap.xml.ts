import { CANONICAL } from './index.astro';
export const prerender = true;
export function GET() {
  return new Response(CANONICAL.sitemapXml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
