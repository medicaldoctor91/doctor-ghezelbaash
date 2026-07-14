import type { MarkdownHeading } from 'astro';
import { anchorRegistry } from './anchors';
import { homepageSections } from './homepage-sections';
import { homepageSubsectionAnchorRegistry } from './homepage-subsections';

const homepageSectionAnchorRegistry = Object.fromEntries(
  homepageSections.map((section) => [section.title, section.id]),
) as Record<string, string>;

export function stableAnchorFor(title: string, fallback?: string) {
  const normalized = title.replace(/\s*¶$/u, '').trim();
  return homepageSectionAnchorRegistry[normalized]
    ?? homepageSubsectionAnchorRegistry[normalized]
    ?? anchorRegistry[normalized]
    ?? fallback
    ?? 'section';
}

export function stabilizeHeadings(headings: MarkdownHeading[]): MarkdownHeading[] {
  return headings.map((heading) => {
    const text = heading.text.replace(/\s*¶$/u, '').trim();
    return { ...heading, text, slug: stableAnchorFor(text, heading.slug) };
  });
}
