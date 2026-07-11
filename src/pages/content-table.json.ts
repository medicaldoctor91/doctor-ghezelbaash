import { getHeadings } from '../content/landing.md';
import { buildGroupedToc, buildKnowledgeSummary, buildProcedureAnchorMap, buildToc, extractFaqEntries } from '../lib/content';
import { buildSectionRelationships } from '../data/knowledge.mjs';
import { rawContent } from '../content/landing.md';
import { site } from '../data/site';

export const prerender = true;

export function GET() {
  const headings = getHeadings();
  const tableOfContents = buildToc(headings);
  const h2Sections = tableOfContents.map((section) => ({ slug: section.slug, text: section.text }));
  const questions = extractFaqEntries(rawContent(), headings);
  return new Response(JSON.stringify({
    schemaVersion: '3.0',
    canonical: site.url,
    language: site.language,
    direction: site.direction,
    updated: site.dateModified,
    primaryEntities: [`${site.url}#person`, `${site.url}#clinic`],
    prelude: [
      { id: 'entity-authority-panel', url: `${site.url}#entity-authority-panel`, role: 'entity-disambiguation', entities: [`${site.url}#person`, `${site.url}#clinic`] },
      { id: 'service-coverage-panel', url: `${site.url}#service-coverage-panel`, role: 'service-and-referral-coverage' },
    ],
    headingCount: headings.length,
    questionCount: questions.length,
    groups: buildGroupedToc(headings),
    tableOfContents,
    relationships: buildSectionRelationships(h2Sections),
    procedureAnchors: buildProcedureAnchorMap(headings),
    knowledge: buildKnowledgeSummary(headings),
  }, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
