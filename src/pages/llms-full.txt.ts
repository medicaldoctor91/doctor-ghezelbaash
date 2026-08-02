import source from './index.md?raw';
import { canonicalBody, HOME, PERSON } from '../lib/canonical-projection';

export const prerender = true;

function projection(markdown: string): string {
  const { body } = canonicalBody(markdown);
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
