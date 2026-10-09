import { CANONICAL } from './index.astro';
export const prerender = true;
export function GET() {
  return new Response(CANONICAL.robotsTxt, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
