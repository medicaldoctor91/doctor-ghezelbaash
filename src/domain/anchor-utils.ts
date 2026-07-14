import type { MarkdownHeading } from 'astro';
import { homepageSubsectionAnchorRegistry } from './homepage-subsections';
import { anchorRegistry } from './anchors';

const canonicalAnchorRegistry: Record<string, string> = {
  ...anchorRegistry,
  ...homepageSubsectionAnchorRegistry,
};

export function stableAnchorFor(title: string, fallback?: string) {
  return canonicalAnchorRegistry[title.trim()] ?? fallback ?? 'section';
}

export function stabilizeHeadings(headings: MarkdownHeading[]): MarkdownHeading[] {
  return headings.map((heading) => {
    const text = heading.text.replace(/\s*¶$/u, '').trim();
    return { ...heading, text, slug: stableAnchorFor(text, heading.slug) };
  });
}
