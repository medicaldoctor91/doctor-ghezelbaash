import type { MarkdownHeading } from 'astro';
import { anchorRegistry } from './anchors';

export function stableAnchorFor(title: string, fallback?: string) {
  return anchorRegistry[title.trim()] ?? fallback ?? 'section';
}

export function stabilizeHeadings(headings: MarkdownHeading[]): MarkdownHeading[] {
  return headings.map((heading) => ({ ...heading, slug: stableAnchorFor(heading.text, heading.slug) }));
}
