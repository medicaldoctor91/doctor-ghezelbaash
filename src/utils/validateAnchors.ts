export const validateHtmlAnchors = (html: string): string[] => {
  const errors: string[] = [];
  const ids = [...html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`Duplicate HTML id: ${id}`);
    seen.add(id);
  }
  for (const match of html.matchAll(/href="#([^"]+)"/gu)) {
    if (!seen.has(match[1])) errors.push(`Broken same-page anchor: #${match[1]}`);
  }
  return errors;
};
