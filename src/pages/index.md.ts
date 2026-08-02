import source from './index.md?raw';
import { canonicalBody, frontmatterTitle, HOME, PERSON } from '../lib/canonical-projection';

export const prerender = true;

function projection(markdown: string): string {
  const { body, frontmatter } = canonicalBody(markdown);
  const title = frontmatterTitle(frontmatter);
  return `---\ntitle: ${JSON.stringify(title)}\ncanonical: "${HOME}"\nlang: "fa-IR"\nabout: "${PERSON}"\nsource: "${HOME}"\nrobots: "noindex, follow"\n---\n\n${body}\n`;
}

export function GET(): Response {
  return new Response(projection(source), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}
