import fs from 'node:fs';
import path from 'node:path';
import { googleMapsRating } from '~/data/googleMapsRating';
import { getPageMedia } from '~/data/pageMedia';

type Node = Record<string, any>;
type GraphDoc = { '@graph'?: Node[] };
export type FaqQuestion = { id?: string; name: string; text: string };
export type StructuredDataDocument = { '@context': 'https://schema.org'; '@graph': Node[] };

const SITE = 'https://www.ghezelbaash.ir';
const GRAPH_PATH = path.join(process.cwd(), 'public', 'graph.json');
const SERVICE_PAGES = ['/botox-kermanshah/', '/filler-kermanshah/', '/thread-lift-kermanshah/', '/aesthetic-concerns-kermanshah/'];
let cachedGraph: Node[] | undefined;

const p = (pathname: string) => (!pathname || pathname === '/' ? '/' : pathname.endsWith('/') ? pathname : `${pathname}/`);
const urlFor = (pathname: string) => `${SITE}${p(pathname) === '/' ? '' : p(pathname)}`;
const pageId = (pathname: string) => `${urlFor(pathname)}#webpage`;
const idOf = (node?: Node) => (typeof node?.['@id'] === 'string' ? node['@id'] : undefined);
const typesOf = (node?: Node): string[] => {
  const type = node?.['@type'];
  return Array.isArray(type) ? type.filter((item): item is string => typeof item === 'string') : typeof type === 'string' ? [type] : [];
};
const isType = (node: Node | undefined, type: string) => typesOf(node).includes(type);
const refId = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  return value && typeof value === 'object' && typeof (value as Node)['@id'] === 'string' ? (value as Node)['@id'] : undefined;
};
const arr = <T>(value: T | T[] | undefined): T[] => (typeof value === 'undefined' ? [] : Array.isArray(value) ? value : [value]);
const unique = <T>(items: T[]) => Array.from(new Set(items));

const graph = (): Node[] => {
  if (cachedGraph) return cachedGraph;
  const doc = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8')) as GraphDoc;
  cachedGraph = Array.isArray(doc['@graph']) ? doc['@graph'] : [];
  return cachedGraph;
};
const indexById = (nodes: Node[]) => new Map(nodes.map((node) => [idOf(node), node] as const).filter((entry): entry is readonly [string, Node] => Boolean(entry[0])));
const itemRefs = (node?: Node) => arr(node?.itemListElement as unknown).map((item) => (item && typeof item === 'object' ? refId((item as Node).item) : undefined)).filter((id): id is string => Boolean(id));
const faqQuestionIds = (node?: Node) => arr(node?.mainEntity as unknown).map(refId).filter((id): id is string => Boolean(id));
const identityIds = (nodes: Node[]) => {
  const ids = itemRefs(nodes.find((node) => idOf(node) === `${SITE}/graph.json#identity-layer`));
  for (const node of nodes) if (idOf(node) === `${SITE}/#contact-point` || isType(node, 'ContactPoint')) ids.push(idOf(node)!);
  return unique(ids);
};
const isPillarService = (node: Node) => {
  const id = idOf(node);
  return Boolean(id && isType(node, 'Service') && SERVICE_PAGES.some((servicePath) => id === `${SITE}${servicePath}#service`));
};
const serviceForPath = (node: Node, pathname: string) => {
  if (!isType(node, 'Service')) return false;
  const pathnameNorm = p(pathname);
  const pageUrl = urlFor(pathnameNorm);
  const id = idOf(node);
  const nodeUrl = typeof node.url === 'string' ? node.url : undefined;
  if (pathnameNorm === '/' || pathnameNorm === '/dr-saeed-ghezelbash-aesthetic-clinic/') return isPillarService(node);
  return Boolean(id?.startsWith(`${pageUrl}#`) || nodeUrl?.startsWith(pageUrl));
};
const pageScoped = (node: Node, pathname: string) => {
  const pathnameNorm = p(pathname);
  const pageUrl = urlFor(pathnameNorm);
  const pid = pageId(pathnameNorm);
  const id = idOf(node);
  if (id) {
    if (pathnameNorm === '/' && id.startsWith(`${SITE}/#`) && !isType(node, 'Service')) return true;
    if (pathnameNorm !== '/' && id.startsWith(`${pageUrl}#`)) return true;
  }
  return ['mainEntityOfPage', 'isPartOf', 'partOf', 'about', 'subjectOf'].some((key) => arr(node[key] as unknown).some((value) => refId(value) === pid));
};
const faqCandidateIds = (pathname: string) => {
  const pathnameNorm = p(pathname);
  const pageUrl = urlFor(pathnameNorm);
  if (pathnameNorm === '/') return [`${SITE}/#faq`];
  if (pathnameNorm === '/dr-saeed-ghezelbash-aesthetic-clinic/') return [`${pageUrl}#clinic-faq-kermanshah`, `${pageUrl}#faq`];
  return [`${pageUrl}#faq`];
};
const faqForPath = (node: Node, pathname: string) => isType(node, 'FAQPage') && Boolean(idOf(node) && faqCandidateIds(pathname).includes(idOf(node)!));
const breadcrumbForPath = (node: Node, pathname: string) => isType(node, 'BreadcrumbList') && p(pathname) !== '/' && idOf(node) === `${urlFor(pathname)}#breadcrumb`;

export const getProjectedPageGraph = (pathnameInput: string): Node[] => {
  const pathname = p(pathnameInput);
  const nodes = graph();
  const index = indexById(nodes);
  const include = new Set<string>();
  const add = (id?: string) => { if (id && index.has(id)) include.add(id); };
  for (const id of identityIds(nodes)) add(id);
  add(pageId(pathname));
  for (const node of nodes) {
    const id = idOf(node);
    if (id && (pageScoped(node, pathname) || serviceForPath(node, pathname) || faqForPath(node, pathname) || breadcrumbForPath(node, pathname))) include.add(id);
  }
  for (const id of [...include]) if (isType(index.get(id), 'FAQPage')) for (const questionId of faqQuestionIds(index.get(id))) add(questionId);
  return nodes.filter((node) => Boolean(idOf(node) && include.has(idOf(node)!)));
};

const normalizeDates = (node: Node): Node => {
  if (!isType(node, 'VideoObject') && !isType(node, 'ProfilePage')) return node;
  const copy = { ...node };
  for (const key of ['uploadDate', 'dateModified']) if (typeof copy[key] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(copy[key])) copy[key] = `${copy[key]}T00:00:00+03:30`;
  return copy;
};
const rating = () => googleMapsRating as Record<string, any>;
const mapsUrl = () => rating().googleMapsUrl ?? rating().mapsUrl ?? rating().googleMapsSearchUrl;
const ratingCount = () => rating().ratingCount ?? rating().reviewCount;
const logo = () => ({ '@type': 'ImageObject', '@id': `${SITE}/#logo`, url: `${SITE}/favicon.svg`, contentUrl: `${SITE}/favicon.svg` });
const pageImage = (pathnameInput: string): Node => {
  const pathname = p(pathnameInput);
  const media = getPageMedia(pathname);
  const imageUrl = `${SITE}${media.ogImagePath}`;
  return { '@type': 'ImageObject', '@id': `${urlFor(pathname)}#primary-image`, url: imageUrl, contentUrl: imageUrl, width: 1200, height: 630, caption: media.imageCaption };
};
const enrich = (node: Node, image: Node): Node => {
  const id = idOf(node);
  const imageId = idOf(image);
  const mapUrl = mapsUrl();
  if (id === `${SITE}/#clinic`) {
    const sameAs = Array.isArray(node.sameAs) ? node.sameAs : [];
    return { ...node, logo: logo(), image: { '@id': imageId }, ...(mapUrl ? { hasMap: mapUrl, sameAs: unique([...sameAs, mapUrl]) } : {}), ...(rating().enabledInSchema && rating().ratingValue && ratingCount() ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating().ratingValue, ratingCount: ratingCount(), reviewCount: ratingCount(), bestRating: 5, worstRating: 1, ...(mapUrl ? { url: mapUrl } : {}) } } : {}) };
  }
  if (id === `${SITE}/#website`) return { ...node, logo: logo(), publisher: { '@id': `${SITE}/#clinic` } };
  if (isType(node, 'WebPage')) return { ...node, image: { '@id': imageId }, primaryImageOfPage: { '@id': imageId }, thumbnailUrl: image.url };
  if (isType(node, 'Service')) return { ...node, image: { '@id': imageId } };
  return node;
};

export const buildStructuredDataForPathname = (pathnameInput: string): StructuredDataDocument => {
  const pathname = p(pathnameInput);
  const image = pageImage(pathname);
  return { '@context': 'https://schema.org', '@graph': [...getProjectedPageGraph(pathname).map((node) => normalizeDates(enrich(node, image))), image] };
};

export const getFaqQuestionsForPathname = (pathnameInput: string): FaqQuestion[] => {
  const index = indexById(graph());
  const faq = faqCandidateIds(p(pathnameInput)).map((id) => index.get(id)).find(Boolean);
  return faqQuestionIds(faq).map((id) => index.get(id)).filter((node): node is Node => Boolean(node?.name && node?.acceptedAnswer?.text)).map((node) => ({ id: idOf(node), name: String(node.name), text: String(node.acceptedAnswer.text) }));
};
