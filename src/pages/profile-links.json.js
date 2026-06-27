import { authoritySignals } from '../data/authoritySignals.mjs';
import { externalProfiles } from '../data/externalProfiles.mjs';
import { site } from '../data/site.mjs';
import { getSameAsForEntity } from '../lib/sourceClassifier.mjs';

export function GET() {
  return new Response(JSON.stringify({
    schema: 'ghezelbaash.profile_links.astro.v2.source_contract',
    canonicalWebsite: site.canonicalBase + '/',
    verifiedSameAs: externalProfiles.verifiedSameAs,
    derivedSameAsByEntity: {
      person: getSameAsForEntity(authoritySignals, 'person', site.sameAs.person),
      clinic: getSameAsForEntity(authoritySignals, 'clinic', site.sameAs.clinic),
      knowledgeGraph: getSameAsForEntity(authoritySignals, 'knowledgeGraph', site.sameAs.kg)
    },
    observed: externalProfiles.observedButNeedsDirectVerification,
    policy: externalProfiles.policy
  }, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
