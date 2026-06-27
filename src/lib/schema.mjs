import { site, absoluteUrl, canonicalImage } from '../data/site.mjs';
import { location } from '../data/location.mjs';
import { regulatoryIdentity } from '../data/regulatory.mjs';
import { researchProfile } from '../data/research.mjs';
import { services } from '../data/services.mjs';
import { breadcrumbsForPath } from './routes.mjs';

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
    '@type': ['Person', 'Physician'],
    '@id': absoluteUrl('/#dr-saeed-ghezelbash'),
    name: site.personFa,
    alternateName: ['دکتر محمدسعید قزلباش', site.personEn, 'Mohammad Saeed Ghezelbash', 'Dr. Saeed Ghezelbaash'],
    url: absoluteUrl(site.pages.person),
    image: canonicalImage(),
    sameAs: site.sameAs.person,
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
    knowsAbout: services.map((service) => service.shortTitle || service.title),
    subjectOf: [
      { '@type': 'WebPage', name: 'NCBI bibliography', url: researchProfile.bibliographyUrl },
      { '@type': 'WebPage', name: 'IranMedLabs media coverage', url: 'https://iranmedlabs.com/skin-and-hair-and-beauty/120049/' },
      { '@type': 'WebPage', name: 'MDPI article', url: 'https://www.mdpi.com/2227-9032/9/9/1169' }
    ]
  };
}

export function buildClinicEntity() {
  return {
    '@type': ['MedicalBusiness', 'LocalBusiness'],
    '@id': absoluteUrl('/#clinic'),
    name: site.nameFa,
    alternateName: [site.nameEn, 'کلینیک دکتر سعید قزلباش', 'کلینیک زیبایی دکتر قزلباش'],
    url: absoluteUrl(site.pages.clinic),
    image: canonicalImage(),
    logo: absoluteUrl(site.logo),
    telephone: location.telephone,
    sameAs: site.sameAs.clinic,
    founder: { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
    employee: { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
    address: {
      '@type': 'PostalAddress',
      streetAddress: location.streetAddressFa,
      addressLocality: location.addressLocality,
      addressRegion: location.addressRegion,
      addressCountry: location.addressCountry
    },
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
    hasMap: location.googleMapsCid,
    makesOffer: services.map((service) => ({ '@id': absoluteUrl(`/${service.slug}/#service`) }))
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
