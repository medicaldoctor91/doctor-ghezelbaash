import { getHeadings, rawContent } from '~/content/landing.md';
import { buildSearchChunks, extractFaqEntries } from '~/lib/content';
import { site } from '~/domain/entities';
import { jsonResponse } from '~/compilers/utils';

export const prerender = true;

export function GET() {
  const raw = rawContent();
  const headings = getHeadings();
  const chunks = buildSearchChunks(raw, headings);
  const chunkMap = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const questions = extractFaqEntries(raw, headings).map((question) => {
    const chunk = chunkMap.get(question.id);
    return {
      id: question.id,
      question: question.question,
      answer: question.answer,
      url: question.url,
      conceptIds: chunk?.conceptIds ?? [],
      claimIds: chunk?.claimIds ?? [],
      evidenceIds: chunk?.evidenceIds ?? [],
      contentHash: chunk?.contentHash,
      sourceSpan: chunk?.sourceSpan,
      medicalSafetyClass: chunk?.medicalSafetyClass,
    };
  });

  return jsonResponse({
    schemaVersion: '1.0',
    canonical: site.url,
    source: `${site.url}faq.json`,
    updated: site.dateModified,
    language: site.language,
    questionCount: questions.length,
    medicalDisclaimer: 'General information only; diagnosis and treatment require an in-person medical assessment.',
    questions,
  });
}
