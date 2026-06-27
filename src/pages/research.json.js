import { researchProfile } from '../data/research.mjs';
import { site } from '../data/site.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.research_identifiers.astro.v2',
    canonicalWebsite: site.canonicalBase + '/',
    bibliographyUrl: researchProfile.bibliographyUrl,
    orcid: researchProfile.orcid,
    identifiers: researchProfile.publications.map((item) => ({
      key: item.key,
      doi: item.doi,
      pmid: item.pmid,
      pmcid: item.pmcid,
      pubmed: item.pubmed,
      url: item.url || null,
      reviewReport: item.reviewReport || null
    }))
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
