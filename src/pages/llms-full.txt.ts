import source from './index.md?raw';
import { llmsFullProjection } from '../lib/page-projections';

export const prerender = true;

export function GET(): Response {
  return new Response(llmsFullProjection(source), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}
