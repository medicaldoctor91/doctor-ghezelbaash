import type { MarkdownHeading } from 'astro';
import { anchorRegistry } from './anchors';

export function stableAnchorFor(title: string, fallback?: string) {
  return anchorRegistry[title.trim()] ?? fallback ?? 'section';
}

export function stabilizeHeadings(headings: MarkdownHeading[]): MarkdownHeading[] {
  return headings.map((heading) => {
    const text = heading.text.replace(/\s*¶$/u, '').trim();
    return { ...heading, text, slug: stableAnchorFor(text, heading.slug) };
  });
}
