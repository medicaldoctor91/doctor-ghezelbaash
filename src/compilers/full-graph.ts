import type { MarkdownHeading } from 'astro';
import { buildSchemaParts } from '~/lib/schema';
import { stabilizeHeadings } from '~/domain/anchor-utils';
import { json, shardByBytes, pad } from './utils';

type Node = Record<string, unknown>;

function graph(nodes: Node[]) {
  return { '@context': 'https://schema.org', '@graph': nodes };
}

export function buildFullGraphShards(headings: MarkdownHeading[], raw: string) {
  headings = stabilizeHeadings(headings);
  const p = buildSchemaParts(headings, raw) as Record<string, any>;
  const canonicalPage = { ...p.pageNode, '@type': 'MedicalWebPage' };
  const fixed = [
    { slug: 'core', value: graph([p.irimcOrganizationNode, p.credentialNode, p.personNode, p.clinicKnowledgeNode, p.websiteNode, canonicalPage, p.articleNode, p.logoNode]) },
    { slug: 'entities', value: graph([...p.externalProfileNodes, ...p.researchNodes, ...p.authorityAssetNodes, p.authorityNetworkNode, p.editorialReviewNode, p.reputationSnapshotNode]) },
    { slug: 'services', value: graph([p.offerCatalogNode, p.conceptSetNode, ...p.procedureNodes, ...p.procedureTermNodes, ...p.umbrellaServiceNodes, ...p.granularConceptNodes, ...p.conceptTermNodes, ...p.granularServiceNodes]) },
    { slug: 'media', value: graph([...p.imageNodes, ...p.videoNodes, ...p.clipNodes]) },
    { slug: 'answers', value: graph([p.answerSetNode, ...p.faqQuestions, ...p.faqAnswerNodes, ...p.sectionAnswerNodes]) },
    { slug: 'catalog', value: graph([p.artifactCatalogNode, ...p.artifactDatasetNodes, p.authorityCorpusNode, p.intentSetNode, p.intentFeedNode, p.claimSetNode, p.evidenceSetNode, p.decisionCapsulesNode, p.contentMapNode, p.faqNode, ...p.panelNodes, ...p.compatibilityNodes]) },
  ];
  const variableGroups: Array<[string, Node[]]> = [
    ['evidence', [...p.evidenceNodes, ...p.claimNodes]],
    ['sections', p.sectionNodes],
    ['intents', p.intentNodes],
  ];
  const variable = variableGroups.flatMap(([name, nodes]) =>
    shardByBytes(nodes, 700_000).map((records, index) => ({ slug: `${name}-${pad(index)}`, value: graph(records) })),
  );
  return [...fixed, ...variable].map((item) => ({ ...item, bytes: Buffer.byteLength(json(item.value), 'utf8') }));
}
