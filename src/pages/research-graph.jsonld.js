import { site, absoluteUrl } from '../data/site.mjs';
import { researchProfile } from '../data/research.mjs';

function articleId(publication) {
  return absoluteUrl(`/research/#${publication.key}`);
}

function identifierList(publication) {
  return [
    publication.doi && {
      '@type': 'PropertyValue',
      propertyID: 'DOI',
      value: publication.doi,
      url: publication.url || publication.doiUrl || null
    },
    publication.pmid && {
      '@type': 'PropertyValue',
      propertyID: 'PMID',
      value: publication.pmid,
      url: publication.pubmed || null
    },
    publication.pmcid && {
      '@type': 'PropertyValue',
      propertyID: 'PMCID',
      value: publication.pmcid
    }
  ].filter(Boolean);
}

export function GET() {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Person',
        '@id': absoluteUrl('/#dr-saeed-ghezelbash'),
        name: site.personFa,
        alternateName: [site.personEn, 'Mohammad Saeed Ghezelbash', 'Dr. Saeed Ghezelbash'],
        sameAs: [researchProfile.orcid, researchProfile.bibliographyUrl],
        identifier: [
          {
            '@type': 'PropertyValue',
            propertyID: 'ORCID',
            value: researchProfile.orcid.replace('https://orcid.org/', ''),
            url: researchProfile.orcid
          }
        ],
        subjectOf: researchProfile.publications.map((publication) => ({ '@id': articleId(publication) }))
      },
      {
        '@type': 'CollectionPage',
        '@id': absoluteUrl('/research/#collection'),
        name: 'Research identifiers and scholarly works for Dr. Saeed Ghezelbash',
        url: absoluteUrl('/research.json'),
        mainEntity: researchProfile.publications.map((publication) => ({ '@id': articleId(publication) }))
      },
      ...researchProfile.publications.map((publication) => ({
        '@type': 'ScholarlyArticle',
        '@id': articleId(publication),
        name: publication.title,
        headline: publication.title,
        datePublished: publication.datePublished,
        url: publication.url || publication.pubmed || null,
        sameAs: [publication.url, publication.pubmed, publication.reviewReport].filter(Boolean),
        author: {
          '@id': absoluteUrl('/#dr-saeed-ghezelbash'),
          name: publication.authorNameVariant || site.personEn
        },
        creator: { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
        identifier: identifierList(publication),
        isPartOf: { '@id': absoluteUrl('/research/#collection') },
        about: [
          { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
          { '@id': absoluteUrl('/#physician') }
        ]
      }))
    ]
  };

  return new Response(JSON.stringify(graph, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/ld+json; charset=utf-8' }
  });
}
