import type { MarkdownHeading } from 'astro';
import { anchorRegistry } from './anchors';
// @ts-expect-error Shared canonical authored-answer mappings.
import { authoredAnswerMappings } from './answer-hub.mjs';

const authoredAnchorByTitle = new Map(
  authoredAnswerMappings.map((entry: { question: string; sectionId: string }) => [entry.question.trim(), entry.sectionId]),
);

export function stableAnchorFor(title: string, fallback?: string) {
  const normalizedTitle = title.trim();
  return anchorRegistry[normalizedTitle] ?? authoredAnchorByTitle.get(normalizedTitle) ?? fallback ?? 'section';
}

export function stabilizeHeadings(headings: MarkdownHeading[]): MarkdownHeading[] {
  return headings.map((heading) => ({ ...heading, slug: stableAnchorFor(heading.text, heading.slug) }));
}
