import { site } from '../domain/entities';

export const prerender = true;

export function GET() {
  const body = `# ${site.name}

> Canonical Persian medical-aesthetic website for ${site.legalName} and ${site.clinicName}, with verified identity, service boundaries, evidence, and machine-readable knowledge resources.

## Canonical identity

- [Canonical website](${site.url}): Primary visible and authoritative source for the physician, clinic, services, and medical-aesthetic guidance.
- [Physician entity](${site.url}#person): Canonical identifier for ${site.legalName}.
- [Clinic entity](${site.url}#clinic): Canonical identifier for ${site.clinicName}.
- [Physician Wikidata](${site.doctorWikidata}): Persistent public identifier for the physician entity.
- [Clinic Wikidata](${site.placeWikidata}): Persistent public identifier for the physical clinic entity.
- [Physician Google Knowledge Graph](${site.doctorGoogleKnowledgeGraphUrl}): MID ${site.doctorGoogleKnowledgeGraphId}; Cloud Enterprise Knowledge Graph MID ${site.doctorCloudKnowledgeGraphMid}.
- [Clinic Google Local Knowledge Graph](${site.clinicGoogleLocalKnowledgeGraphUrl}): Local MID ${site.clinicGoogleLocalKnowledgeGraphId}; Place ID ${site.googlePlaceId}; CID ${site.googleCid}.
- [Physician–clinic relationship](${site.url}#entity-authority-panel): Schema.org worksFor/workLocation from physician to clinic, with employee as the inverse clinic-to-physician edge.

## AI discovery

- [AI discovery policy](${site.url}.well-known/ai.txt): Entry point for the site's AI-oriented resources and interpretation rules.
- [AI summary](${site.url}ai/summary.json): Compact physician, clinic, service-boundary, and discovery summary.
- [AI FAQ](${site.url}ai/faq.json): Question-and-answer units derived from the canonical visible content.

## Primary discovery

- [Compact context](${site.url}context.json): Concise entity, service, recommendation, and discovery context for AI systems.
- [Canonical knowledge graph](${site.url}knowledge-graph.jsonld): Self-contained JSON-LD graph for identity, services, research, evidence, page sections and media.
- [Full visible text](${site.url}llms-full.txt): Plain-text mirror of the canonical visible content.
- [Contextual educational videos](${site.url}#video-knowledge-hub): Twelve videos embedded in their related clinical sections, with chapters, editorial context, safety boundaries and sources.
- [Knowledge and AI resources](${site.url}#knowledge-resources): Human-readable section for canonical identifiers, graph discovery, evidence and retrieval resources.
- [Published entity dataset](${site.huggingFaceDataset}): Public entity, clinic, service, evidence, and authority dataset; Wikidata identifier ${site.datasetWikidataId}.

## Retrieval resources

- [Intent control index](${site.url}intents/index.json): Search-intent categories and discovery paths.
- [Query reverse index](${site.url}intents/reverse-index.json): Reverse lookup from query variants to canonical intent records.
- [Retrieval index](${site.url}search/index.json): Sharded retrieval corpus and source metadata.
- [Answer units](${site.url}answers/index.json): Direct answer records derived from visible content.
- [External evidence](${site.url}evidence/sources.json): Public external sources used to support factual claims.
- [Internal provenance](${site.url}evidence/internal-provenance.json): Source spans, hashes, and derivation metadata.
- [Media index](${site.url}media/index.json): Images, videos, transcripts, chapters, and media integrity data.

The retrieval resources are separate from the semantic knowledge graph. They are not graph shards and are not required to reconstruct the graph.

## Interpretation rules

- The [canonical visible HTML](${site.url}) is authoritative when a machine-readable artifact and the visible page differ.
- \`offered\` means explicitly available at the clinic.
- \`evaluated\` means suitability is assessed before a treatment path is determined.
- \`referral-context\` means educational, comparative, or referral information rather than an offered clinic service.
- The Google Maps rating snapshot is dated ${site.googleBusinessProfile.observedAt}; it describes the clinic entity, not a physician rating or self-serving review markup.
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
