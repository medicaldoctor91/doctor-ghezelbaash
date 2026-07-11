import type { MarkdownHeading } from 'astro';
import { createHash } from 'node:crypto';
import { site } from '~/domain/entities';
import { stabilizeHeadings } from '~/domain/anchor-utils';
import { buildSearchChunks } from '~/lib/content';

const clean = (value: string) => value
  .replace(/^#{1,6}\s+.+$/m, '')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/[|*_`>#]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const answerWindow = (value: string) => {
  const words = clean(value).split(/\s+/).filter(Boolean);
  return words.slice(0, Math.min(180, Math.max(60, words.length))).join(' ');
};

export function buildAnswerUnits(raw: string, headings: MarkdownHeading[]) {
  headings = stabilizeHeadings(headings);
  return buildSearchChunks(raw, headings)
    .filter((chunk) => chunk.depth === 2 || chunk.answerRole === 'question-answer')
    .map((chunk) => {
      const answerText = answerWindow(chunk.markdown);
      return {
        id: `answer-${chunk.id}`,
        question: chunk.title,
        answerText,
        url: chunk.url,
        visibleSectionId: chunk.id,
        sourceSpan: chunk.sourceSpan,
        conceptId: chunk.primaryConceptId,
        conceptIds: chunk.conceptIds,
        procedureId: chunk.primaryProcedureId,
        procedureIds: chunk.procedureIds,
        dimensionId: chunk.intents[0] ?? 'informational',
        primaryIntentId: chunk.primaryIntentIds[0] ?? null,
        primaryIntentIds: chunk.primaryIntentIds,
        evidenceIds: chunk.evidenceIds,
        claimIds: chunk.claimIds,
        reviewedBy: `${site.url}#person`,
        lastReviewed: site.dateModified,
        contentHash: createHash('sha256').update(answerText, 'utf8').digest('hex'),
        medicalSafetyClass: chunk.medicalSafetyClass,
      };
    });
}
