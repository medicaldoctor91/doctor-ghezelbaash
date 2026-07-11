import { getHeadings, rawContent } from '~/content/landing.md';
import { buildSearchChunks } from '~/lib/content';
// @ts-expect-error Canonical ESM claim catalogue.
import { allAuthorityClaims } from '~/domain/claims.mjs';
import { externalEvidenceSources } from '~/domain/evidence';
import { jsonlResponse, shardByBytes, pad } from '~/compilers/utils';

export const prerender = true;
function shards() {
  const externalIds = new Set(externalEvidenceSources.map((source: any) => source.id));
  const chunks = buildSearchChunks(rawContent(), getHeadings());
  const records = allAuthorityClaims.map((claim: any) => ({
    ...claim,
    externalEvidenceIds: claim.evidenceIds.filter((id: string) => externalIds.has(id)),
    internalProvenanceIds: chunks.filter((chunk) => chunk.claimIds.includes(claim.id)).map((chunk) => `internal-${chunk.id}`),
  }));
  return shardByBytes(records, 650_000).map((records, index) => ({ slug: `claims-${pad(index)}`, records }));
}
export function getStaticPaths() {
  return shards().map((shard) => ({ params: { shard: shard.slug }, props: { records: shard.records } }));
}
export function GET({ props }: { props: { records: unknown[] } }) {
  return jsonlResponse(props.records);
}

