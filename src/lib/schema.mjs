import { site, absoluteUrl, canonicalImage } from '../data/site.mjs';
import { location } from '../data/location.mjs';
import { googleMapsReputation } from '../data/reputation.mjs';
import { publicDataset } from '../data/dataset.mjs';
import { regulatoryIdentity } from '../data/regulatory.mjs';
import { researchProfile } from '../data/research.mjs';
import { services } from '../data/services.mjs';
import { authoritySignals } from '../data/authoritySignals.mjs';
import { breadcrumbsForPath } from './routes.mjs';
import {
  getMapUrlsForClinic,
  getSameAsForEntity,
  getSubjectOfForEntity
} from './sourceClassifier.mjs';

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildPostalAddress() {
  return {
    '@type': 'PostalAddress',
    streetAddress: location.streetAddressFa,
    addressLocality: location.addressLocality,
    addressRegion: location.addressRegion,
    postalCode: location.postalCode,
    addressCountry: location.addressCountry
  };
}

function buildAggregateRating() {
  return {
    '@type': 'AggregateRating',
    ratingValue: googleMapsReputation.ratingValue,
    ratingCount: googleMapsReputation.ratingCount,
    bestRating: googleMapsReputation.bestRating,
    worstRating: googleMapsReputation.worstRating
  };
}

export function buildBreadcrumbList({ canonicalPath = '/', breadcrumbs } = {}) {
  const canonical = absoluteUrl(canonicalPath);
  const items = breadcrumbs || breadcrumbsForPath(canonicalPath);

  return {
    '@type': 'BreadcrumbList',
    '@id': `${canonical}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path)
    }))
  };
}

export function buildWebPageSchema({
  title,
  description,
  canonicalPath = '/',
  pageType = 'WebPage'
} = {}) {
  const canonical = absoluteUrl(canonicalPath);
  const schema = {
    '@type': pageType,
    '@id': `${canonical}#webpage`,
    url: canonical,
    name: title,
    description,
    inLanguage: site.locale,
    isPartOf: { '@id': absoluteUrl('/#website') },
    breadcrumb: { '@id': `${canonical}#breadcrumb` }
  };

  if (pageType === 'ProfilePage') {
    schema.mainEntity = { '@id': absoluteUrl('/#dr-saeed-ghezelbash') };
  }

  return schema;
}

export function buildWebsiteEntity() {
  return {
    '@type': 'WebSite',
    '@id': absoluteUrl('/#website'),
    url: absoluteUrl('/'),
    name: site.nameFa,
    alternateName: site.nameEn,
    inLanguage: site.locale,
    publisher: { '@id': absoluteUrl('/#clinic') }
  };
}

export function buildOrganizationEntity() {
  return {
    '@type': 'Organization',
    '@id': absoluteUrl('/#organization'),
    name: site.nameEn,
    alternateName: site.nameFa,
    url: absoluteUrl('/'),
    logo: canonicalImage(site.logo),
    image: canonicalImage(),
    parentOrganization: { '@id': absoluteUrl('/#clinic') },
    sameAs: getSameAsForEntity(authoritySignals, 'clinic', site.sameAs.clinic)
  };
}

export function buildFaqSchema({ canonicalPath = '/', faqItems = [] } = {}) {
  const canonical = absoluteUrl(canonicalPath);
  return {
    '@type': 'FAQPage',
    '@id': `${canonical}#faq`,
    mainEntity: faqItems.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer
      }
    }))
  };
}

export function buildPersonEntity() {
  return {
    '@type': 'Person',
    '@id': absoluteUrl('/#dr-saeed-ghezelbash'),
    name: site.personFa,
    alternateName: ['دکتر محمدسعید قزلباش', site.personEn, 'Mohammad Saeed Ghezelbash', 'Dr. Saeed Ghezelbaash'],
    honorificPrefix: 'Dr.',
    jobTitle: 'پزشک زیبایی',
    url: absoluteUrl(site.pages.person),
    mainEntityOfPage: { '@id': `${absoluteUrl(site.pages.person)}#webpage` },
    image: canonicalImage(),
    sameAs: getSameAsForEntity(authoritySignals, 'person', site.sameAs.person),
    identifier: [
      {
        '@type': 'PropertyValue',
        propertyID: 'IRIMC',
        value: regulatoryIdentity.irimc.medicalCouncilNumber,
        url: regulatoryIdentity.irimc.url
      },
      {
        '@type': 'PropertyValue',
        propertyID: 'ORCID',
        value: researchProfile.orcid.replace('https://orcid.org/', ''),
        url: researchProfile.orcid
      }
    ],
    hasOccupation: {
      '@type': 'Occupation',
      name: 'پزشک زیبایی',
      occupationLocation: { '@type': 'City', name: location.addressLocality }
    },
    worksFor: { '@id': absoluteUrl('/#clinic') },
    affiliation: { '@id': absoluteUrl('/#clinic') },
    workLocation: { '@id': absoluteUrl('/#clinic') },
    knowsAbout: services.map((service) => service.shortTitle || service.title),
    subjectOf: getSubjectOfForEntity(authoritySignals, 'person')
  };
}

export function buildClinicEntity() {
  return {
    '@type': ['MedicalClinic', 'MedicalBusiness', 'LocalBusiness'],
    '@id': absoluteUrl('/#clinic'),
    name: site.nameFa,
    alternateName: [site.nameEn, 'کلینیک دکتر سعید قزلباش', 'کلینیک زیبایی دکتر قزلباش'],
    url: absoluteUrl('/'),
    mainEntityOfPage: { '@id': `${absoluteUrl(site.pages.clinic)}#webpage` },
    image: canonicalImage(),
    logo: absoluteUrl(site.logo),
    telephone: location.telephone,
    priceRange: location.priceRange,
    aggregateRating: buildAggregateRating(),
    sameAs: getSameAsForEntity(authoritySignals, 'clinic', site.sameAs.clinic),
    subjectOf: getSubjectOfForEntity(authoritySignals, 'clinic'),
    founder: { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
    employee: { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
    address: buildPostalAddress(),
    geo: {
      '@type': 'GeoCoordinates',
      latitude: location.geo.latitude,
      longitude: location.geo.longitude
    },
    areaServed: {
      '@type': 'City',
      name: location.addressLocality,
      addressCountry: location.addressCountry
    },
    hasMap: getMapUrlsForClinic(authoritySignals, location),
    identifier: [
      {
        '@type': 'PropertyValue',
        propertyID: 'Google Maps CID',
        value: googleMapsReputation.cid,
        url: googleMapsReputation.cidUrl
      },
      {
        '@type': 'PropertyValue',
        propertyID: 'Google Maps Place ID',
        value: googleMapsReputation.placeId,
        url: googleMapsReputation.placeIdUrl
      }
    ],
    makesOffer: services.map((service) => ({ '@id': absoluteUrl(`/${service.slug}/#service`) })),
    availableService: services.map((service) => ({ '@id': absoluteUrl(`/${service.slug}/#service`) }))
  };
}

export function buildKnowledgeGraphDataset() {
  return {
    '@type': 'Dataset',
    '@id': absoluteUrl('/kg/#dataset'),
    name: publicDataset.name,
    description: publicDataset.description,
    url: absoluteUrl(site.pages.kg),
    identifier: publicDataset.doi,
    license: publicDataset.license,
    datePublished: publicDataset.datePublished,
    version: publicDataset.version,
    creator: { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
    sameAs: getSameAsForEntity(authoritySignals, 'knowledgeGraph', [
      publicDataset.wikidata,
      publicDataset.doiUrl,
      publicDataset.zenodo,
      publicDataset.huggingFace,
      publicDataset.github
    ])
  };
}

export function buildServiceSchema({ service, canonicalPath = `/${service.slug}/` } = {}) {
  const canonical = absoluteUrl(canonicalPath);

  return {
    '@type': 'Service',
    '@id': `${canonical}#service`,
    name: service.title,
    alternateName: [service.shortTitle, ...(service.intentExamples || [])].filter(Boolean),
    description: service.description,
    serviceType: service.shortTitle || service.title,
    url: canonical,
    provider: { '@id': absoluteUrl('/#clinic') },
    areaServed: {
      '@type': 'City',
      name: location.addressLocality || 'Kermanshah',
      addressCountry: site.country
    },
    audience: {
      '@type': 'Audience',
      audienceType: 'کاربران جست‌وجوی خدمات زیبایی در کرمانشاه'
    },
    subjectOf: {
      '@id': `${canonical}#webpage`
    }
  };
}

export function buildServiceItemList({ canonicalPath = site.pages.services } = {}) {
  return {
    '@type': 'ItemList',
    '@id': `${absoluteUrl(canonicalPath)}#service-list`,
    name: 'فهرست خدمات زیبایی دکتر سعید قزلباش در کرمانشاه',
    itemListElement: services.map((service, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: service.title,
      url: absoluteUrl(`/${service.slug}/`),
      item: { '@id': absoluteUrl(`/${service.slug}/#service`) }
    }))
  };
}

export function buildGlobalGraph() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      buildWebsiteEntity(),
      buildOrganizationEntity(),
      buildPersonEntity(),
      buildClinicEntity(),
      buildKnowledgeGraphDataset(),
      ...services.map((service) => buildServiceSchema({ service }))
    ]
  };
}

export function buildPageGraph({
  title,
  description,
  canonicalPath = '/',
  pageType = 'WebPage',
  breadcrumbs,
  extraGraph = []
} = {}) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      buildWebPageSchema({ title, description, canonicalPath, pageType }),
      buildBreadcrumbList({ canonicalPath, breadcrumbs }),
      ...extraGraph
    ]
  };
}
