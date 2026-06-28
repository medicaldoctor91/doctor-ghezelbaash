import { researchProfile } from '../data/research.mjs';
import { site, absoluteUrl } from '../data/site.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.research_identifiers.astro.v4.primary_graph_consolidated',
    canonicalWebsite: site.canonicalBase + '/',
    primaryGraph: absoluteUrl('/graph-ghezelbaash-final.jsonld'),
    researchCollection: absoluteUrl('/research/#collection'),
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
