import { DOCTOR, FAQ, SERVICES, SITE } from './site';

const pageId = `${SITE.url}/#webpage`;
const websiteId = `${SITE.url}/#website`;
const doctorId = DOCTOR.entityId;
const clinicId = DOCTOR.clinicId;
const contactPointId = `${SITE.url}/#contact-point`;
const serviceListId = `${SITE.url}/#services-list`;
const faqId = `${SITE.url}/#faq`;

export function getServiceId(slug: string) {
  return `${SITE.url}/#${slug}-service`;
}

export function buildJsonLdGraph() {
  const serviceNodes = SERVICES.map((service) => ({
    '@type': 'Service',
    '@id': getServiceId(service.slug),
    name: service.title,
    alternateName: service.shortTitle,
    description: service.summary,
    url: `${SITE.url}/#${service.slug}`,
    serviceType: service.intentTerms,
    areaServed: {
      '@type': 'City',
      name: SITE.city,
      containedInPlace: {
        '@type': 'Country',
        name: SITE.country,
      },
    },
    provider: { '@id': clinicId },
    availableChannel: {
      '@type': 'ServiceChannel',
      servicePhone: SITE.phone,
      availableLanguage: ['fa'],
      serviceUrl: `${SITE.url}/#contact`,
    },
  }));

  const faqQuestions = FAQ.map((item, index) => ({
    '@type': 'Question',
    '@id': `${SITE.url}/#faq-question-${index + 1}`,
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.answer,
    },
  }));

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': websiteId,
        name: SITE.name,
        url: SITE.url,
        inLanguage: SITE.language,
        publisher: { '@id': clinicId },
      },
      {
        '@type': 'WebPage',
        '@id': pageId,
        url: SITE.url,
        name: SITE.title,
        description: SITE.description,
        inLanguage: SITE.language,
        isPartOf: { '@id': websiteId },
        about: [{ '@id': doctorId }, { '@id': clinicId }, { '@id': serviceListId }],
        mainEntity: { '@id': doctorId },
        primaryImageOfPage: {
          '@type': 'ImageObject',
          '@id': `${SITE.url}/#primary-image`,
          url: `${SITE.url}/og.svg`,
          caption: SITE.title,
        },
        breadcrumb: { '@id': `${SITE.url}/#breadcrumb` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${SITE.url}/#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'صفحه اصلی',
            item: SITE.url,
          },
        ],
      },
      {
        '@type': 'Person',
        '@id': doctorId,
        name: DOCTOR.name,
        jobTitle: DOCTOR.jobTitle,
        description: DOCTOR.description,
        url: SITE.url,
        telephone: SITE.phone,
        image: `${SITE.url}/og.svg`,
        worksFor: { '@id': clinicId },
        address: {
          '@type': 'PostalAddress',
          addressLocality: SITE.city,
          addressCountry: SITE.country,
        },
        knowsAbout: ['پزشکی زیبایی', 'بوتاکس', 'فیلر', 'لیفت با نخ', 'تحلیل چهره', 'زیبایی طبیعی'],
        sameAs: DOCTOR.sameAs,
      },
      {
        '@type': ['MedicalClinic', 'LocalBusiness'],
        '@id': clinicId,
        name: DOCTOR.clinicName,
        url: SITE.url,
        telephone: SITE.phone,
        description: SITE.description,
        medicalSpecialty: 'Aesthetic medicine',
        priceRange: 'پس از ارزیابی',
        areaServed: {
          '@type': 'City',
          name: SITE.city,
        },
        address: {
          '@type': 'PostalAddress',
          addressLocality: SITE.city,
          addressCountry: SITE.country,
        },
        contactPoint: { '@id': contactPointId },
        founder: { '@id': doctorId },
        employee: { '@id': doctorId },
        hasOfferCatalog: { '@id': serviceListId },
        sameAs: [SITE.mapUrl, SITE.osmUrl, SITE.instagram],
      },
      {
        '@type': 'ContactPoint',
        '@id': contactPointId,
        telephone: SITE.phone,
        contactType: 'appointments and clinic contact',
        areaServed: SITE.city,
        availableLanguage: ['fa'],
        url: `${SITE.url}/#contact`,
      },
      {
        '@type': 'OfferCatalog',
        '@id': serviceListId,
        name: 'خدمات زیبایی دکتر سعید قزلباش در کرمانشاه',
        itemListElement: SERVICES.map((service, index) => ({
          '@type': 'Offer',
          position: index + 1,
          itemOffered: { '@id': getServiceId(service.slug) },
        })),
      },
      ...serviceNodes,
      {
        '@type': 'FAQPage',
        '@id': faqId,
        url: `${SITE.url}/#faq`,
        mainEntity: faqQuestions.map((item) => ({ '@id': item['@id'] })),
      },
      ...faqQuestions,
    ],
  };
}

export const jsonLdGraph = buildJsonLdGraph();
