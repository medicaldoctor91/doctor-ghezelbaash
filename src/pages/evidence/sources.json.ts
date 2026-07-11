import { externalEvidenceSources } from '~/domain/evidence';
// @ts-expect-error Canonical ESM claim catalogue.
import { allAuthorityClaims } from '~/domain/claims.mjs';
import { jsonResponse } from '~/compilers/utils';
import { site } from '~/domain/entities';

export const prerender = true;
export function GET() {
  return jsonResponse({
    schemaVersion: '8.0',
    canonical: site.url,
    count: externalEvidenceSources.length,
    policy: 'Only genuinely external sources are listed here. Canonical page passages use sectionId, sourceSpan and contentHash.',
    sources: externalEvidenceSources.map((source: any) => ({
      ...source,
      supportsClaimIds: allAuthorityClaims.filter((claim: any) => claim.evidenceIds.includes(source.id)).map((claim: any) => claim.id),
    })),
  });
}

