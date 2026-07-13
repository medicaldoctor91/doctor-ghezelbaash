import type { MarkdownHeading } from 'astro';
import { site } from '~/domain/entities';
import { buildCanonicalKnowledgeGraph } from './knowledge-graph';

type Node = Record<string, any>;

const ref = (id: string) => ({ '@id': id });
const types = (node: Node) => Array.isArray(node['@type']) ? node['@type'] : [node['@type']];

function collectInternalRefs(value: unknown, references: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectInternalRefs(item, references));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record['@id'] === 'string' && record['@id'].startsWith(site.url)) references.add(record['@id']);
  Object.values(record).forEach((item) => collectInternalRefs(item, references));
}

function compactDefinition(node: Node): Node {
  const fields = [
    '@type', '@id', 'name', 'alternateName', 'description', 'url', 'inLanguage',
    'keywords', 'bodyLocation', 'procedureType', 'additionalProperty',
  ];
  return Object.fromEntries(fields.filter((field) => node[field] !== undefined).map((field) => [field, node[field]]));
}

export function buildGooglePageGraph(headings: MarkdownHeading[], raw: string) {
  const canonical = buildCanonicalKnowledgeGraph(headings, raw);
  const nodes = canonical['@graph'] as Node[];
  const byId = new Map(nodes.map((node) => [node['@id'], node]));

  const serviceNodes = nodes.filter((node) => types(node).includes('Service')).slice(0, 12);
  const procedureNodes = nodes.filter((node) => /^https:\/\/www\.ghezelbaash\.ir\/#procedure-/.test(node['@id'] ?? '')).slice(0, 12);
  const researchNodes = nodes.filter((node) => types(node).includes('ScholarlyArticle'));
  const videoNodes = nodes.filter((node) => types(node).includes('VideoObject'));
  const clipNodes = nodes.filter((node) => types(node).includes('Clip'));
  const imageNodes = nodes
    .filter((node) => types(node).includes('ImageObject') && node['@id'] !== `${site.url}#logo`)
    .slice(0, 4);

  const personSource = byId.get(`${site.url}#person`) as Node;
  const clinicSource = byId.get(`${site.url}#clinic`) as Node;
  const pageSource = byId.get(`${site.url}#webpage`) as Node;
  const articleSource = byId.get(`${site.url}#article`) as Node;

  const person: Node = {
    ...personSource,
    '@type': 'Person',
    sameAs: [site.irimcVerification, site.orcidUrl, site.doctorWikidata, site.huggingFaceProfile, site.githubProfile],
    worksFor: ref(`${site.url}#clinic`),
    workLocation: ref(`${site.url}#clinic`),
    knowsAbout: procedureNodes.map((node) => ref(node['@id'])),
    subjectOf: [ref(`${site.url}#article`), ...researchNodes.map((node) => ref(node['@id'])), ref(`${site.url}#knowledge-graph-dataset`)],
  };
  delete person.affiliation;

  const clinic: Node = {
    ...clinicSource,
    employee: ref(`${site.url}#person`),
    availableService: serviceNodes.map((node) => ref(node['@id'])),
    subjectOf: ref(`${site.url}#clinic-reputation-snapshot`),
  };
  delete clinic.hasOfferCatalog;

  const page: Node = {
    ...pageSource,
    mainEntity: ref(`${site.url}#person`),
    publisher: ref(`${site.url}#clinic`),
    about: [ref(`${site.url}#person`), ref(`${site.url}#clinic`), ...procedureNodes.map((node) => ref(node['@id']))],
    hasPart: [
      ref(`${site.url}#article`),
      ref(`${site.url}#video-knowledge-hub`),
      ref(`${site.url}#knowledge-resources`),
      ...videoNodes.map((node) => ref(node['@id'])),
    ],
  };

  const article: Node = {
    ...articleSource,
    about: page.about,
    mentions: [...procedureNodes.map((node) => ref(node['@id'])), ...researchNodes.map((node) => ref(node['@id']))],
    subjectOf: ref(`${site.url}#medical-editorial-review`),
  };

  const selectedIds = [
    'https://membersearch.irimc.org/#organization',
    `${site.url}#credential-irimc-${site.irimc}`,
    `${site.url}#website`,
    `${site.url}#logo`,
    `${site.url}#medical-editorial-review`,
    `${site.url}#clinic-reputation-snapshot`,
    `${site.url}#conversion-dock`,
    `${site.url}#video-knowledge-hub`,
    `${site.url}#knowledge-resources`,
    `${site.url}#knowledge-graph-dataset`,
    `${site.url}#retrieval-corpus`,
  ];

  const graph: Node[] = [
    ...selectedIds.map((id) => byId.get(id)).filter(Boolean) as Node[],
    person,
    clinic,
    page,
    article,
    ...imageNodes,
    ...procedureNodes,
    ...serviceNodes,
    ...researchNodes,
    ...videoNodes,
    ...clipNodes,
  ];

  const definedIds = new Set(graph.map((node) => node['@id']).filter(Boolean));
  const refs = new Set<string>();
  graph.forEach((node) => collectInternalRefs(node, refs));
  const supplemental = [...refs]
    .filter((id) => !definedIds.has(id) && byId.has(id))
    .map((id) => compactDefinition(byId.get(id) as Node));

  return { '@context': 'https://schema.org', '@graph': [...graph, ...supplemental] };
}
