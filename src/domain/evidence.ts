import { createHash } from 'node:crypto';
import { site } from './entities';
// @ts-expect-error Canonical ESM evidence catalogue.
import { evidenceSources } from './claims.mjs';

const ownHost = new URL(site.url).hostname.replace(/^www\./, '');

export const externalEvidenceSources = evidenceSources.filter((source: { url: string }) => {
  try {
    return new URL(source.url).hostname.replace(/^www\./, '') !== ownHost;
  } catch {
    return false;
  }
});

export const legacyFirstPartySources = evidenceSources.filter((source: { url: string }) => {
  try {
    return new URL(source.url).hostname.replace(/^www\./, '') === ownHost;
  } catch {
    return false;
  }
});

export function internalProvenance(sectionId: string, sourceSpan: { startLine: number; endLine: number }, markdown: string) {
  return {
    id: `internal-${sectionId}`,
    sourceType: 'canonical-visible-content',
    canonical: `${site.url}#${sectionId}`,
    sectionId,
    sourceSpan,
    contentHash: {
      algorithm: 'sha256',
      digest: createHash('sha256').update(markdown, 'utf8').digest('hex'),
    },
  };
}

export { evidenceSources };

