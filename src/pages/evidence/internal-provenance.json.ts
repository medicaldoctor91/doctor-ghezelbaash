import { getHeadings, rawContent } from '~/content/landing.md';
import { buildSearchChunks } from '~/lib/content';
import { internalProvenance } from '~/domain/evidence';
import { jsonResponse } from '~/compilers/utils';
import { site } from '~/domain/entities';

export const prerender = true;
export function GET() {
  const records = buildSearchChunks(rawContent(), getHeadings()).map((chunk) => ({ ...internalProvenance(chunk.id, chunk.sourceSpan, chunk.markdown), claimIds: chunk.claimIds }));
  return jsonResponse({ schemaVersion: '8.0', canonical: site.url, records });
}

