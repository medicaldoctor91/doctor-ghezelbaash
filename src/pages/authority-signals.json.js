import { authoritySignals } from '../data/authoritySignals.mjs';
import { site } from '../data/site.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.authority_signals.astro.v1',
    canonicalWebsite: site.canonicalBase + '/',
    signals: authoritySignals
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
