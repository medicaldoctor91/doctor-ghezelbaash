import type { Graph } from 'schema-dts';

const SITE_URL = 'https://www.ghezelbaash.ir/';
const WEBSITE_ID = `${SITE_URL}#website`;
const WEBPAGE_ID = `${SITE_URL}#webpage`;
const DOCTOR_ID = `${SITE_URL}#saeed-ghezelbash-aesthetic-medicine`;
const CLINIC_ID = `${SITE_URL}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`;
const REPOSITORY_ID = `${SITE_URL}#doctor-ghezelbaash-structured-data-repository`;
const PRIMARY_IMAGE_ID = `${SITE_URL}#primary-image`;

type StructuredDataInput = {
  canonicalURL: string;
  description: string;
  title: string;
};

export function buildStructuredData({
  canonicalURL,
  description,
  title,
}: StructuredDataInput): Graph {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        url: SITE_URL,
        name: 'وب‌سایت رسمی دکتر سعید قزلباش',
        alternateName: 'Dr. Saeed Ghezelbash Official Website',
        description,
        inLanguage: ['fa-IR', 'ar-IQ', 'en', 'ckb-IQ'],
        about: { '@id': DOCTOR_ID },
        publisher: { '@id': DOCTOR_ID },
      },
      {
        '@type': 'MedicalWebPage',
        '@id': WEBPAGE_ID,
        url: canonicalURL,
        name: title,
        headline: title,
        description,
        inLanguage: ['fa-IR', 'ar-IQ', 'en', 'ckb-IQ'],
        isPartOf: { '@id': WEBSITE_ID },
        mainEntity: { '@id': DOCTOR_ID },
        about: { '@id': DOCTOR_ID },
        mentions: [{ '@id': CLINIC_ID }, { '@id': REPOSITORY_ID }],
        author: { '@id': DOCTOR_ID },
        publisher: { '@id': DOCTOR_ID },
        primaryImageOfPage: { '@id': PRIMARY_IMAGE_ID },
      },
      {
        '@type': 'Person',
        '@id': DOCTOR_ID,
        additionalType: 'https://schema.org/IndividualPhysician',
        url: SITE_URL,
        name: 'دکتر سعید قزلباش',
        alternateName: [
          'دکتر محمدسعید قزلباش',
          'Dr. Saeed Ghezelbash',
          'Dr. Mohammad Saeed Ghezelbash',
        ],
        honorificPrefix: 'دکتر',
        givenName: 'محمدسعید',
        familyName: 'قزلباش',
        jobTitle: 'پزشک زیبایی',
        description: 'پزشک زیبایی و پژوهشگر پزشکی فعال در کرمانشاه، ایران',
        image: { '@id': PRIMARY_IMAGE_ID },
        mainEntityOfPage: { '@id': WEBPAGE_ID },
        worksFor: { '@id': CLINIC_ID },
        subjectOf: { '@id': REPOSITORY_ID },
        identifier: [
          {
            '@type': 'PropertyValue',
            propertyID: 'Iran Medical Council Number',
            value: '167430',
            url: 'https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e',
          },
          {
            '@type': 'PropertyValue',
            propertyID: 'Google Knowledge Graph ID',
            value: '/g/11nqdfk76c',
          },
        ],
        sameAs: [
          'https://www.wikidata.org/wiki/Q140287622',
          'https://orcid.org/0009-0001-9346-8475',
          'https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/',
          'https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e',
          'https://www.instagram.com/doctor.ghezelbaash/',
        ],
      },
      {
        '@type': 'MedicalClinic',
        '@id': CLINIC_ID,
        url: CLINIC_ID,
        name: 'کلینیک زیبایی دکتر سعید قزلباش',
        alternateName: 'Dr. Saeed Ghezelbash Aesthetic Clinic',
        description:
          'کلینیک زیبایی متعلق به دکتر سعید قزلباش در کرمانشاه و محل فعالیت و پیگیری درمان‌های او',
        telephone: '+989308209494',
        owner: { '@id': DOCTOR_ID },
        employee: { '@id': DOCTOR_ID },
        subjectOf: { '@id': REPOSITORY_ID },
        address: {
          '@type': 'PostalAddress',
          streetAddress: 'میدان ۱۷ شهریور، ساختمان ویستا',
          addressLocality: 'کرمانشاه',
          addressRegion: 'استان کرمانشاه',
          addressCountry: 'IR',
        },
        geo: {
          '@type': 'GeoCoordinates',
          latitude: 34.340124305555555,
          longitude: 47.08517780555555,
        },
        hasMap: 'https://www.google.com/maps?cid=12350483144643112463',
        identifier: [
          {
            '@type': 'PropertyValue',
            propertyID: 'Google Knowledge Graph ID',
            value: '/g/11r3rzdtb3',
          },
          {
            '@type': 'PropertyValue',
            propertyID: 'Google Maps CID',
            value: '12350483144643112463',
          },
          {
            '@type': 'PropertyValue',
            propertyID: 'OpenStreetMap node ID',
            value: '13530287096',
          },
        ],
        sameAs: [
          'https://www.wikidata.org/wiki/Q140288589',
          'https://www.openstreetmap.org/node/13530287096',
        ],
      },
      {
        '@type': 'Dataset',
        '@id': REPOSITORY_ID,
        url: 'https://github.ghezelbaash.ir/',
        name: 'Doctor Ghezelbaash Structured Data Repository',
        alternateName: [
          'Doctor Ghezelbash structured data repository',
          'Doctor Ghezelbash — Public Brand Knowledge Base & Knowledge Graph (JSON/JSON-LD)',
        ],
        description:
          'A public machine-readable data and software repository created, owned, developed and maintained by Saeed Ghezelbash, about Saeed Ghezelbash and Dr. Saeed Ghezelbash Aesthetic Clinic in Kermanshah, Iran.',
        inLanguage: 'en',
        isAccessibleForFree: true,
        version: '1.0.0',
        datePublished: '2026-02-25',
        creator: { '@id': DOCTOR_ID },
        maintainer: { '@id': DOCTOR_ID },
        owner: { '@id': DOCTOR_ID },
        about: [{ '@id': DOCTOR_ID }, { '@id': CLINIC_ID }],
        license: 'https://creativecommons.org/licenses/by/4.0/',
        identifier: [
          {
            '@type': 'PropertyValue',
            propertyID: 'DOI',
            value: '10.5281/zenodo.18765169',
            url: 'https://doi.org/10.5281/zenodo.18765169',
          },
        ],
        sameAs: [
          'https://www.wikidata.org/wiki/Q140304972',
          'https://github.com/medicaldoctor91/doctor-ghezelbaash',
          'https://doi.org/10.5281/zenodo.18765169',
          'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data',
        ],
      },
      {
        '@type': 'ImageObject',
        '@id': PRIMARY_IMAGE_ID,
        url: `${SITE_URL}media/images/physician/saeed-ghezelbash-portrait-1600.webp`,
        contentUrl: `${SITE_URL}media/images/physician/saeed-ghezelbash-portrait-1600.webp`,
        encodingFormat: 'image/webp',
        width: '1600',
        height: '1067',
        caption: 'پرتره رسمی دکتر سعید قزلباش، پزشک زیبایی در کرمانشاه',
        inLanguage: 'fa-IR',
        representativeOfPage: true,
      },
    ],
  };
}
