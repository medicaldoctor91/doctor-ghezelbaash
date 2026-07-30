const HOME = 'https://www.ghezelbaash.ir/';
const PERSON = `${HOME}#saeed-ghezelbash`;

function parse(markdown: string): { title: string; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) throw new Error('src/pages/index.md frontmatter is missing');
  const title = match[1].match(/^title:\s*["']?(.*?)["']?\s*$/m)?.[1];
  if (!title) throw new Error('src/pages/index.md title is missing');
  const body = markdown
    .slice(match[0].length)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*\/\s*>/gi, '')
    .replace(/\s+type=["']application\/ld\+json["']/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!/<h1\s+id=/i.test(body)) throw new Error('Markdown projection is missing the canonical H1');
  return { title, body };
}

export function markdownProjection(markdown: string): string {
  const { title, body } = parse(markdown);
  return `---\ntitle: ${JSON.stringify(title)}\ncanonical: "${HOME}"\nlang: "fa-IR"\nabout: "${PERSON}"\nsource: "${HOME}"\nrobots: "noindex, follow"\n---\n\n${body}\n`;
}

export function llmsFullProjection(markdown: string): string {
  const { body } = parse(markdown);
  return `# Dr. Saeed Ghezelbash — Full canonical page export\n\nCanonical: ${HOME}\nAbout: ${PERSON}\nSource: ${HOME}\nLanguage: fa-IR\nIndexing: noindex, follow\nPurpose: deterministic machine-readable projection of the complete canonical page content\n\n---\n\n${body}\n`;
}
