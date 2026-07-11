import { getHeadings, rawContent } from '../content/landing.md';
import { buildSearchChunks, extractFaqEntries } from '../lib/content';
import { site } from '../data/site';

export const prerender = true;

export function GET() {
  const raw = rawContent();
  const headings = getHeadings();
  const chunks = buildSearchChunks(raw, headings);
  const chunkMap = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const questions = extractFaqEntries(raw, headings).map((question) => {
    const chunk = chunkMap.get(question.id);
    return {
      ...question,
      conceptIds: chunk?.conceptIds ?? [],
      claimIds: chunk?.claimIds ?? [],
      evidenceIds: chunk?.evidenceIds ?? [],
      citationIds: chunk?.citationIds ?? [],
      contentHash: chunk?.contentHash,
      sourceSpan: chunk?.sourceSpan,
      medicalSafetyClass: chunk?.medicalSafetyClass,
    };
  });
  return new Response(JSON.stringify({
    schemaVersion: '6.0',
    canonical: site.url,
    updated: site.dateModified,
    language: site.language,
    questionCount: questions.length,
    primaryEntities: [`${site.url}#person`, `${site.url}#clinic`],
    answersRegistry: `${site.url}answers.json`,
    questions,
  }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
