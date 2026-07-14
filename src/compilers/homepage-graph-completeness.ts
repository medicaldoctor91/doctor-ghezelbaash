import { site } from '~/domain/entities';
import { videos } from '~/domain/media.mjs';
import { homepageEntityIds } from '~/domain/homepage-sections';

type Node = Record<string, any>;
type Graph = { '@context'?: unknown; '@graph'?: Node[] };
const id = (fragment: string) => `${site.url}#${fragment}`;
const ref = (value: string) => ({ '@id': value });

export function completeHomepageGraphContract(input: Graph): Graph {
  const nodes = [...(input['@graph'] ?? [])];
  const byId = new Map(nodes.filter((node) => node?.['@id']).map((node) => [node['@id'], node]));
  const personId = id(homepageEntityIds.person);
  const clinicId = id(homepageEntityIds.clinic);
  const webpageId = id('webpage');
  const clinicalGuideId = id('clinical-guide');
  const graphDatasetId = id('knowledge-graph-dataset');

  if (!byId.has(clinicalGuideId)) {
    const node = {
      '@type': 'WebPageElement',
      '@id': clinicalGuideId,
      name: 'راهنمای جامع پزشکی زیبایی، پوست و مو',
      url: clinicalGuideId,
      inLanguage: site.language,
      isPartOf: ref(webpageId),
      about: [ref(personId), ref(clinicId)],
    };
    nodes.push(node);
    byId.set(clinicalGuideId, node);
  }

  if (!byId.has(graphDatasetId)) {
    const node = {
      '@type': 'Dataset',
      '@id': graphDatasetId,
      name: 'Canonical Knowledge Graph of Dr. Saeed Ghezelbaash',
      description: 'Machine-readable graph aligned with the visible physician-first Homepage.',
      url: `${site.url}knowledge-graph.jsonld`,
      creator: ref(personId),
      publisher: ref(clinicId),
      about: [ref(personId), ref(clinicId)],
      isBasedOn: ref(webpageId),
      dateModified: site.dateModified,
      inLanguage: ['fa-IR', 'en'],
      distribution: {
        '@type': 'DataDownload',
        contentUrl: `${site.url}knowledge-graph.jsonld`,
        encodingFormat: 'application/ld+json',
      },
    };
    nodes.push(node);
    byId.set(graphDatasetId, node);
  }

  for (const video of videos) {
    const node = byId.get(id(`video-${video.id}`));
    if (!node) continue;
    node.isPartOf = ref(id(video.sectionId));
    node.mainEntityOfPage = ref(id(video.subsectionId ?? video.sectionId));
  }

  return { '@context': input['@context'] ?? 'https://schema.org', '@graph': nodes };
}
