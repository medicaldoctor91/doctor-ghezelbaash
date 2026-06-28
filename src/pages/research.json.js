import { researchProfile } from '../data/research.mjs';
import { site, absoluteUrl } from '../data/site.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.research_identifiers.astro.v3.graph_linked',
    canonicalWebsite: site.canonicalBase + '/',
    researchGraph: absoluteUrl('/research-graph.jsonld'),
    bibliographyUrl: researchProfile.bibliographyUrl,
    orcid: researchProfile.orcid,
    identifiers: researchProfile.publications.map((item) => ({
      key: item.key,
      title: item.title,
      datePublished: item.datePublished,
      doi: item.doi,
      pmid: item.pmid,
      pmcid: item.pmcid,
      pubmed: item.pubmed,
      url: item.url || null,
      reviewReport: item.reviewReport || null,
      graphNode: absoluteUrl(`/research/#${item.key}`),
      authorNameVariant: item.authorNameVariant || null,
      citationNameVariant: item.citationNameVariant || null
    }))
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
