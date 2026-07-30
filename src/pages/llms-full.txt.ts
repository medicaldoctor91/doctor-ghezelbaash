import source from './index.md?raw';

export const prerender = true;

const HOME = 'https://www.ghezelbaash.ir/';
const PERSON = `${HOME}#saeed-ghezelbash`;

function projection(markdown: string): string {
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!match) throw new Error('src/pages/index.md frontmatter is missing');
  const body = markdown
    .slice(match[0].length)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*\/\s*>/gi, '')
    .replace(/\s+type=["']application\/ld\+json["']/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!/<h1\s+id=/i.test(body)) throw new Error('LLMs projection is missing the canonical H1');
  return `# Dr. Saeed Ghezelbash — Full canonical page export\n\nCanonical: ${HOME}\nAbout: ${PERSON}\nSource: ${HOME}\nLanguage: fa-IR\nIndexing: noindex, follow\nPurpose: deterministic machine-readable projection of the complete canonical page content\n\n---\n\n${body}\n`;
}

export function GET(): Response {
  return new Response(projection(source), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}
