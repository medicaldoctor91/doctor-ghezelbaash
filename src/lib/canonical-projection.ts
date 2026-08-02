export const HOME = 'https://www.ghezelbaash.ir/';
export const PERSON = `${HOME}#saeed-ghezelbash`;

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function canonicalBody(markdown: string): { body: string; frontmatter: string } {
  const match = markdown.match(frontmatterPattern);
  if (!match) throw new Error('src/pages/index.md frontmatter is missing');

  const body = markdown
    .slice(match[0].length)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*\/\s*>/gi, '')
    .replace(/\s+type=["']application\/ld\+json["']/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!/<h1\s+id=/i.test(body)) {
    throw new Error('Canonical projection is missing the canonical H1');
  }
  return { body, frontmatter: match[1] };
}

export function frontmatterTitle(frontmatter: string): string {
  const title = frontmatter.match(/^title:\s*["']?(.*?)["']?\s*$/m)?.[1];
  if (!title) throw new Error('src/pages/index.md title is missing');
  return title;
}
