import { site, absoluteUrl } from '../data/site.mjs';
import { researchProfile } from '../data/research.mjs';

export function scholarlyArticleId(publication) {
  return absoluteUrl(`/research/#${publication.key}`);
}

export function scholarlyArticleReferences() {
  return researchProfile.publications.map((publication) => ({ '@id': scholarlyArticleId(publication) }));
}

export function scholarlyArticleIdentifierList(publication) {
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

export function buildResearchPersonEntity() {
  return {
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
    subjectOf: scholarlyArticleReferences()
  };
}

export function buildResearchCollectionEntity() {
  return {
    '@type': 'CollectionPage',
    '@id': absoluteUrl('/research/#collection'),
    name: 'Research identifiers and scholarly works for Dr. Saeed Ghezelbash',
    url: absoluteUrl('/research.json'),
    mainEntity: scholarlyArticleReferences(),
    about: [
      { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      { '@id': absoluteUrl('/#physician') }
    ]
  };
}

export function buildScholarlyArticleEntities() {
  return researchProfile.publications.map((publication) => ({
    '@type': 'ScholarlyArticle',
    '@id': scholarlyArticleId(publication),
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
    identifier: scholarlyArticleIdentifierList(publication),
    isPartOf: { '@id': absoluteUrl('/research/#collection') },
    about: [
      { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      { '@id': absoluteUrl('/#physician') }
    ]
  }));
}

export function buildResearchGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      buildResearchPersonEntity(),
      buildResearchCollectionEntity(),
      ...buildScholarlyArticleEntities()
    ]
  };
}
