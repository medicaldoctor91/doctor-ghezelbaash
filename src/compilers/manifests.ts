import type { MarkdownHeading } from 'astro';
import { site } from '~/domain/entities';
import { externalEvidenceSources } from '~/domain/evidence';
// @ts-expect-error Canonical ESM media catalogue.
import { videos } from '~/domain/media.mjs';
import { buildAgentContext } from './agent-context';
import { entityIdentity, physicianClinicRelationship, socialIdentityAssignment } from '~/domain/entity-identity';
import { buildFullGraphShards } from './full-graph';
import { buildAnswerShards, buildIntentCategories, buildReverseIntentShards, buildSearchShards } from './search-corpus';
import { bytes, digest, json } from './utils';

function artifact(path: string, mediaType: string, value: string, role: string) {
  return { path, url: new URL(path.replace(/^\//, ''), site.url).href, mediaType, role, bytes: bytes(value), sha256: digest(value) };
}

export function buildKnowledgeManifest(raw: string, headings: MarkdownHeading[]) {
  const graph = buildFullGraphShards(headings, raw).map((item) => artifact(`/graph/${item.slug}.jsonld`, 'application/ld+json', json(item.value), 'knowledge-graph-shard'));
  const intents = buildIntentCategories(raw, headings).map((item) => artifact(`/intents/${item.slug}.json`, 'application/json', json(item.intents), 'intent-control-shard'));
  const reverseShards = buildReverseIntentShards(raw, headings);
  const reverse = reverseShards.map((item) => artifact(`/intents/reverse/${item.slug}.json`, 'application/json', json({ schemaVersion: '8.0', records: item.records }, true), 'query-reverse-index-shard'));
  const search = buildSearchShards(raw, headings).map((item) => artifact(`/search/${item.slug}.jsonl`, 'application/x-ndjson', item.records.map((record) => json(record)).join('\n') + '\n', 'retrieval-shard'));
  const answers = buildAnswerShards(raw, headings).map((item) => artifact(`/answers/${item.slug}.jsonl`, 'application/x-ndjson', item.records.map((record) => json(record)).join('\n') + '\n', 'answer-unit-shard'));
  const reverseIndex = json({ schemaVersion: '8.0', count: reverseShards.reduce((n, shard) => n + shard.records.length, 0), shards: reverseShards.map((shard) => ({ url: `${site.url}intents/reverse/${shard.slug}.json`, records: shard.records.length })) });
  const context = json(buildAgentContext(headings));
  const identityCrosswalk = json({
    schemaVersion: '1.0',
    canonical: site.url,
    updated: site.dateModified,
    entities: entityIdentity,
    relationship: physicianClinicRelationship,
    socialIdentityAssignment,
  });
  return {
    schemaVersion: '8.0',
    canonical: site.url,
    generatedFrom: ['src/domain/**', 'src/content/landing.md'],
    updated: site.dateModified,
    policy: {
      canonicalVisibleHtml: 'primary',
      generatedArtifacts: 'derived',
      googlePageGraph: 'page-scoped-only',
      fullKnowledgeGraph: 'external-sharded',
      serviceRelationships: ['offered', 'evaluated', 'referral-context'],
    },
    root: [
      artifact('/context.json', 'application/json', context, 'agent-context'),
      artifact('/identity-crosswalk.json', 'application/json', identityCrosswalk, 'entity-identifier-crosswalk'),
      artifact('/llms-full.txt', 'text/plain', raw, 'full-visible-source'),
      artifact('/intents/reverse-index.json', 'application/json', reverseIndex, 'query-reverse-index'),
    ],
    artifacts: { graph, intents, reverse, search, answers },
    humanDirectory: `${site.url}knowledge/`,
    aiDiscovery: {
      policy: `${site.url}.well-known/ai.txt`,
      summary: `${site.url}ai/summary.json`,
      faq: `${site.url}ai/faq.json`,
    },
    research: {
      identityGraph: `${site.url}research.jsonld`,
      orcid: site.orcidUrl,
      bibliography: site.ncbiBibliography,
      scholarlyWorks: site.researchProfiles.map((research) => research.doiUrl),
    },
    publishedDataset: {
      url: site.huggingFaceDataset,
      wikidata: site.datasetWikidata,
      wikidataId: site.datasetWikidataId,
      persistentRecord: site.zenodoRecord,
    },
    evidence: { sources: `${site.url}evidence/sources.json`, externalSourceCount: externalEvidenceSources.length },
    media: { index: `${site.url}media/index.json`, watchPages: videos.map((video: any) => `${site.url}videos/${video.id}/`) },
  };
}
