import { externalProfiles } from '../data/externalProfiles.mjs';
import { site } from '../data/site.mjs';

export function GET() {
  return new Response(JSON.stringify({
    schema: 'ghezelbaash.profile_links.astro.v1',
    canonicalWebsite: site.canonicalBase + '/',
    links: externalProfiles.verifiedSameAs,
    observed: externalProfiles.observedButNeedsDirectVerification
  }, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
