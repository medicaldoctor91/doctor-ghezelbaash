import { authoritySignalPolicy, authoritySignals } from '../data/authoritySignals.mjs';
import { site } from '../data/site.mjs';
import { getSameAsForEntity, getUrlsByUse } from '../lib/sourceClassifier.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.authority_signals.astro.v2',
    canonicalWebsite: site.canonicalBase + '/',
    policy: authoritySignalPolicy,
    derived: {
      sameAs: {
        person: getSameAsForEntity(authoritySignals, 'person', site.sameAs.person),
        clinic: getSameAsForEntity(authoritySignals, 'clinic', site.sameAs.clinic),
        knowledgeGraph: getSameAsForEntity(authoritySignals, 'knowledgeGraph', site.sameAs.kg)
      },
      hasMap: getUrlsByUse(authoritySignals, 'clinic', 'hasMap')
    },
    signals: authoritySignals
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
