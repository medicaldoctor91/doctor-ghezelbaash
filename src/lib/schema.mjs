import { site, absoluteUrl, canonicalImage } from '../data/site.mjs';
import { location } from '../data/location.mjs';
import { googleMapsReputation } from '../data/reputation.mjs';
import { publicDataset } from '../data/dataset.mjs';
import { regulatoryIdentity } from '../data/regulatory.mjs';
import { researchProfile } from '../data/research.mjs';
import { services } from '../data/services.mjs';
import { aestheticServiceConcepts } from '../data/aestheticScope.mjs';
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

function normalizedPath(path = '/') {
  if (path === '/') return '/';
  return path.endsWith('/') ? path : `${path}/`;
}

function serviceForPath(path = '/') {
  const normalized = normalizedPath(path);
  return services.find((service) => normalized === `/${service.slug}/`);
}

function serviceByKey(key) {
  return services.find((service) => service.key === key);
}

function conceptId(concept) {
  return absoluteUrl(`/kg/aesthetic-scope#${concept.key}`);
}

function conceptReferences() {
  return aestheticServiceConcepts.map((concept) => ({ '@id': conceptId(concept) }));
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

function buildGeoCoordinates() {
  return {
    '@type': 'GeoCoordinates',
    latitude: location.geo.latitude,
    longitude: location.geo.longitude
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

function buildMedicalIdentifier() {
  return {
    '@type': 'PropertyValue',
    propertyID: 'IRIMC',
    value: regulatoryIdentity.irimc.medicalCouncilNumber,
    url: regulatoryIdentity.irimc.url
  };
}

function buildOrcidIdentifier() {
  return {
    '@type': 'PropertyValue',
    propertyID: 'ORCID',
    value: researchProfile.orcid.replace('https://orcid.org/', ''),
    url: researchProfile.orcid
  };
}

function mainEntityForPath(canonicalPath = '/') {
  const normalized = normalizedPath(canonicalPath);
  const service = serviceForPath(normalized);

  if (normalized === '/') return { '@id': absoluteUrl('/#clinic') };
  if (normalized === normalizedPath(site.pages.person)) return { '@id': absoluteUrl('/#dr-saeed-ghezelbash') };
  if (normalized === normalizedPath(site.pages.clinic)) return { '@id': absoluteUrl('/#clinic') };
  if (normalized === normalizedPath(site.pages.services)) return { '@id': `${absoluteUrl(site.pages.services)}#service-list` };
  if (service) return { '@id': `${absoluteUrl(`/${service.slug}/`)}#service` };
  return null;
}

function aboutForPath(canonicalPath = '/') {
  const normalized = normalizedPath(canonicalPath);
  const service = serviceForPath(normalized);
  const base = [
    { '@id': absoluteUrl('/#clinic') },
    { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
    { '@id': absoluteUrl('/#physician') },
    { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') }
  ];

  if (service) return [{ '@id': `${absoluteUrl(`/${service.slug}/`)}#service` }, ...base];
  if (normalized === normalizedPath(site.pages.person)) return [{ '@id': absoluteUrl('/#dr-saeed-ghezelbash') }, { '@id': absoluteUrl('/#physician') }, { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') }];
  if (normalized === normalizedPath(site.pages.clinic)) return [{ '@id': absoluteUrl('/#clinic') }, { '@id': absoluteUrl('/#physician') }, { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') }];
  return base;
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
  const mainEntity = mainEntityForPath(canonicalPath);
  const schema = {
    '@type': pageType,
    '@id': `${canonical}#webpage`,
    url: canonical,
    name: title,
    description,
    inLanguage: site.locale,
    isPartOf: { '@id': absoluteUrl('/#website') },
    breadcrumb: { '@id': `${canonical}#breadcrumb` },
    about: aboutForPath(canonicalPath)
  };

  if (mainEntity) schema.mainEntity = mainEntity;

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
    publisher: { '@id': absoluteUrl('/#clinic') },
    about: [
      { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      { '@id': absoluteUrl('/#physician') },
      { '@id': absoluteUrl('/#clinic') },
      { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') }
    ]
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
    identifier: [buildMedicalIdentifier(), buildOrcidIdentifier()],
    hasCredential: buildMedicalIdentifier(),
    hasOccupation: {
      '@type': 'Occupation',
      name: 'پزشک زیبایی',
      occupationLocation: { '@type': 'City', name: location.addressLocality }
    },
    worksFor: { '@id': absoluteUrl('/#clinic') },
    affiliation: { '@id': absoluteUrl('/#clinic') },
    workLocation: { '@id': absoluteUrl('/#clinic') },
    knowsAbout: [
      ...services.map((service) => service.shortTitle || service.title),
      ...conceptReferences()
    ],
    subjectOf: getSubjectOfForEntity(authoritySignals, 'person')
  };
}

export function buildPhysicianEntity() {
  return {
    '@type': 'Physician',
    '@id': absoluteUrl('/#physician'),
    name: site.personFa,
    alternateName: ['دکتر محمدسعید قزلباش', site.personEn, 'Mohammad Saeed Ghezelbash', 'Dr. Saeed Ghezelbaash'],
    url: absoluteUrl(site.pages.person),
    mainEntityOfPage: { '@id': `${absoluteUrl(site.pages.person)}#webpage` },
    image: canonicalImage(),
    medicalSpecialty: 'Aesthetic medicine',
    occupationalCategory: 'Physician; aesthetic medicine',
    telephone: location.telephone,
    priceRange: location.priceRange,
    address: buildPostalAddress(),
    geo: buildGeoCoordinates(),
    hasMap: getMapUrlsForClinic(authoritySignals, location),
    sameAs: getSameAsForEntity(authoritySignals, 'person', site.sameAs.person),
    identifier: [buildMedicalIdentifier(), buildOrcidIdentifier()],
    employee: { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
    founder: { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
    parentOrganization: { '@id': absoluteUrl('/#clinic') },
    containedInPlace: { '@id': absoluteUrl('/#clinic') },
    availableService: services.map((service) => ({ '@id': absoluteUrl(`/${service.slug}/#service`) })),
    makesOffer: services.map((service) => ({ '@id': absoluteUrl(`/${service.slug}/#service`) })),
    knowsAbout: conceptReferences(),
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
    member: { '@id': absoluteUrl('/#physician') },
    address: buildPostalAddress(),
    geo: buildGeoCoordinates(),
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

export function buildAestheticScopeTermSet() {
  return {
    '@type': 'DefinedTermSet',
    '@id': absoluteUrl('/kg/aesthetic-scope#term-set'),
    name: 'Aesthetic medicine service and knowledge scope for Dr. Saeed Ghezelbash',
    inLanguage: ['fa-IR', 'en'],
    about: [
      { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      { '@id': absoluteUrl('/#physician') },
      { '@id': absoluteUrl('/#clinic') }
    ],
    hasDefinedTerm: conceptReferences()
  };
}

export function buildAestheticScopeTerms() {
  return aestheticServiceConcepts.map((concept) => {
    const parentService = serviceByKey(concept.pillar);
    return {
      '@type': 'DefinedTerm',
      '@id': conceptId(concept),
      name: concept.nameFa,
      alternateName: [concept.nameEn, concept.key],
      termCode: concept.key,
      inDefinedTermSet: { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') },
      isPartOf: { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') },
      about: [
        { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
        { '@id': absoluteUrl('/#physician') },
        { '@id': absoluteUrl('/#clinic') }
      ],
      subjectOf: parentService ? { '@id': `${absoluteUrl(`/${parentService.slug}/`)}#webpage` } : { '@id': absoluteUrl('/services/#webpage') }
    };
  });
}

export function buildServiceSchema({ service, canonicalPath = `/${service.slug}/` } = {}) {
  const canonical = absoluteUrl(canonicalPath);
  const childConcepts = aestheticServiceConcepts.filter((concept) => concept.pillar === service.key);

  return {
    '@type': 'Service',
    '@id': `${canonical}#service`,
    name: service.title,
    alternateName: [service.shortTitle, ...(service.intentExamples || []), ...childConcepts.map((concept) => concept.nameFa), ...childConcepts.map((concept) => concept.nameEn)].filter(Boolean),
    description: service.description,
    serviceType: service.shortTitle || service.title,
    category: childConcepts.map((concept) => ({ '@id': conceptId(concept) })),
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
      buildPhysicianEntity(),
      buildClinicEntity(),
      buildKnowledgeGraphDataset(),
      buildAestheticScopeTermSet(),
      ...buildAestheticScopeTerms(),
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
