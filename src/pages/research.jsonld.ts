import { site } from '../data/site';

export const prerender = true;

export function GET() {
  const personId = `${site.url}#person`;
  const graph = [
    {
      '@type': ['Person', 'IndividualPhysician'],
      '@id': personId,
      name: site.legalName,
      alternateName: [site.name, site.latinName],
      url: site.url,
      jobTitle: 'پزشک، پژوهشگر و مدرس پزشکی زیبایی',
      sameAs: [
        site.orcidUrl,
        site.ncbiBibliography,
        site.doctorWikidata,
        site.huggingFaceProfile,
      ],
      identifier: [
        {
          '@type': 'PropertyValue',
          propertyID: 'ORCID',
          value: site.orcid,
          url: site.orcidUrl,
        },
        {
          '@type': 'PropertyValue',
          propertyID: 'Wikidata',
          value: site.doctorWikidataId,
          url: site.doctorWikidata,
        },
        {
          '@type': 'PropertyValue',
          propertyID: 'GoogleKnowledgeGraphMID',
          value: site.doctorGoogleKnowledgeGraphId,
          url: site.doctorGoogleKnowledgeGraphUrl,
        },
        {
          '@type': 'PropertyValue',
          propertyID: 'GoogleCloudEnterpriseKnowledgeGraphMID',
          value: site.doctorCloudKnowledgeGraphMid,
        },
      ],
      workLocation: { '@id': `${site.url}#clinic` },
      worksFor: { '@id': `${site.url}#clinic` },
      hasOccupation: [
        {
          '@type': 'Occupation',
          name: 'پزشک',
          occupationalCategory: 'پزشک دارای دکترای حرفه‌ای پزشکی',
        },
        {
          '@type': 'Occupation',
          name: 'پژوهشگر پزشکی',
          description: 'مشارکت در پژوهش‌های بالینی و روان‌پزشکی با آثار قابل‌ردیابی از طریق DOI، PMID، PubMed و ORCID.',
        },
        {
          '@type': 'Occupation',
          name: 'مدرس پزشکی زیبایی',
          description: 'آموزش پزشکان با تمرکز بر آناتومی، انتخاب بیمار، تصمیم‌گیری پیش از تکنیک و مرز ارجاع.',
        },
      ],
      subjectOf: site.researchProfiles.map((research) => ({ '@id': research.doiUrl })),
    },
    ...site.researchProfiles.map((research) => ({
      '@type': 'ScholarlyArticle',
      '@id': research.doiUrl,
      name: research.name,
      headline: research.name,
      url: research.url,
      sameAs: [
        research.url,
        research.doiUrl,
        ...('alternateUrl' in research ? [research.alternateUrl] : []),
        ...('fullTextUrl' in research ? [research.fullTextUrl] : []),
      ],
      inLanguage: 'en',
      datePublished: research.datePublished,
      author: { '@id': personId },
      identifier: [
        {
          '@type': 'PropertyValue',
          propertyID: 'DOI',
          value: research.doi,
          url: research.doiUrl,
        },
        {
          '@type': 'PropertyValue',
          propertyID: 'PMID',
          value: research.pmid,
          url: research.url,
        },
        ...('pmcid' in research ? [{
          '@type': 'PropertyValue',
          propertyID: 'PMCID',
          value: research.pmcid,
          url: research.fullTextUrl,
        }] : []),
      ],
      isPartOf: {
        '@type': 'Periodical',
        name: research.journal,
      },
      publisher: {
        '@type': 'Organization',
        name: research.publisher,
      },
      isAccessibleForFree: Boolean('fullTextUrl' in research || 'alternateUrl' in research),
    })),
  ];

  return new Response(JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': graph,
  }, null, 2), {
    headers: {
      'Content-Type': 'application/ld+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
