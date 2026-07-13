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
  const groups = [
    ...buildGroupedToc(headings),
    {
      id: 'knowledge-ai',
      label: 'Knowledge & AI',
      sections: [
        { slug: 'knowledge-resources', text: 'گراف دانش و منابع ماشین‌خوان', children: [] },
        { slug: 'knowledge-identity', text: 'شناسه‌های انتیتی پزشک و کلینیک', children: [] },
        { slug: 'knowledge-retrieval', text: 'Retrieval و شواهد', children: [] },
      ],
    },
  ];
  return new Response(JSON.stringify({
    schemaVersion: '3.0',
    canonical: site.url,
    language: site.language,
    direction: site.direction,
    updated: site.dateModified,
    primaryEntity: `${site.url}#person`,
    relatedEntities: [`${site.url}#clinic`],
    prelude: [
      { id: 'entity-authority-panel', url: `${site.url}#entity-authority-panel`, role: 'entity-disambiguation', entities: [`${site.url}#person`, `${site.url}#clinic`] },
      { id: 'service-coverage-panel', url: `${site.url}#service-coverage-panel`, role: 'service-and-referral-coverage' },
      { id: 'video-knowledge-hub', url: `${site.url}#video-knowledge-hub`, role: 'contextual-video-index' },
      { id: 'knowledge-resources', url: `${site.url}#knowledge-resources`, role: 'knowledge-graph-and-retrieval-directory' },
    ],
    headingCount: headings.length,
    questionCount: questions.length,
    groups,
    tableOfContents: [
      ...tableOfContents,
      { slug: 'knowledge-resources', text: 'گراف دانش، شناسه‌های انتیتی و منابع Retrieval', depth: 2, children: [] },
    ],
    relationships: buildSectionRelationships(h2Sections),
    procedureAnchors: buildProcedureAnchorMap(headings),
    knowledge: buildKnowledgeSummary(headings),
  }, null, 2), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
