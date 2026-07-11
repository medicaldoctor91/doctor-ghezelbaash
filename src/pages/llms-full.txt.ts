import { rawContent } from '../content/landing.md';
export const prerender = true;
export function GET() {
  return new Response(rawContent(), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
