import { getCollection } from 'astro:content';
import { SITE } from '~/site.config';

export type JsonLdNode = Record<string, any>;

export type PageSchemaDocument = {
  path: string;
  '@graph': JsonLdNode[];
};

export type PageFaqQuestion = {
  id: string;
  name: string;
  answer: string;
};

export const normalizeContentPath = (pathname: string): string => {
  if (!pathname) return '/';
  const [withoutQuery] = pathname.split(/[?#]/);
  if (withoutQuery === '/') return '/';
  return withoutQuery.endsWith('/') ? withoutQuery : `${withoutQuery}/`;
};

const dereferenceGraphNode = (graph: JsonLdNode[], ref: unknown): JsonLdNode | undefined => {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return undefined;
  const id = (ref as { '@id'?: string })['@id'];
  if (!id) return undefined;
  return graph.find((node) => node['@id'] === id);
};

export async function getPageSchemaByPath(pathname: string): Promise<PageSchemaDocument | undefined> {
  const normalizedPath = normalizeContentPath(pathname);
  const pageSchemas = await getCollection('pageSchema');
  return pageSchemas.find((entry) => entry.data.path === normalizedPath)?.data as PageSchemaDocument | undefined;
}

export async function getPageSchemaGraph(pathname: string): Promise<JsonLdNode[]> {
  return (await getPageSchemaByPath(pathname))?.['@graph'] ?? [];
}

/**
 * FAQ visible content is intentionally read from the same page-scoped JSON-LD document
 * that is embedded in the page. This keeps visible FAQ and FAQPage rich-result data in sync.
 */
export async function getPageFaqQuestions(pathname: string): Promise<PageFaqQuestion[]> {
  const graph = await getPageSchemaGraph(pathname);
  const normalizedPath = normalizeContentPath(pathname);
  const faqId = `${SITE.site}${normalizedPath}#faq`;
  const faqPage = graph.find((node) => node['@id'] === faqId);

  if (!faqPage || !Array.isArray(faqPage.mainEntity)) return [];

  return faqPage.mainEntity
    .map((ref: unknown) => dereferenceGraphNode(graph, ref))
    .filter((node): node is JsonLdNode => Boolean(node))
    .map((node) => ({
      id: String(node['@id'] ?? ''),
      name: String(node.name ?? ''),
      answer: String(node.acceptedAnswer?.text ?? ''),
    }))
    .filter((item) => Boolean(item.id && item.name && item.answer));
}
