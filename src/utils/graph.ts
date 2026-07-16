import { clinic } from '../data/clinic.ts';
import { datasets } from '../data/datasets.ts';
import { doctor, SITE_URL } from '../data/doctor.ts';
import { googleMapsEvidence } from '../data/evidence.ts';
import { faqItems } from '../data/faq.ts';
import { images } from '../data/images.ts';
import { references } from '../data/references.ts';
import { sections } from '../data/sections.ts';
import { topicGroups } from '../data/topics.ts';
import { videos } from '../data/videos.ts';
import { asId, asPropertyValue, type CanonicalGraph, type JsonLdNode } from './schema.ts';
import { absoluteUrl, seo } from './seo.ts';

export type AssetManifest = {
  css: string | null;
  font: string | null;
  icons?: Record<string, string>;
  images: Record<string, {
    avif?: string;
    webp?: string;
    fallback?: string;
    avifSrcset?: Array<{ src: string; width: number }>;
    webpSrcset?: Array<{ src: string; width: number }>;
    fallbackSrcset?: Array<{ src: string; width: number }>;
    width: number;
    height: number;
    alt?: string;
  }>;
  videos: Record<string, { mp4?: string; webm?: string; poster?: string; captions?: string }>;
};

const pageId = `${SITE_URL}#webpage`;
const websiteId = `${SITE_URL}#website`;
const faqId = `${SITE_URL}#faq`;
const topicSetId = `${SITE_URL}#aesthetic-medicine-map`;

const hasType = (node: JsonLdNode, type: string): boolean => {
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  return types.includes(type);
};

const imageNodes = (assets: AssetManifest): JsonLdNode[] => images.flatMap((image) => {
  const asset = assets.images[image.id];
  const url = asset?.webp ?? asset?.fallback ?? asset?.avif;
  if (!asset || !url) return [];
  return [{
    '@id': `${SITE_URL}#image-${image.id}`,
    '@type': 'ImageObject',
    contentUrl: absoluteUrl(url),
    url: `${SITE_URL}#image-${image.id}`,
    width: asset.width,
    height: asset.height,
    representativeOfPage: image.id === 'doctor-portrait',
    ...(asset.alt ? { caption: asset.alt, name: asset.alt } : {}),
  }];
});

const faqNodes = (): JsonLdNode[] => faqItems.flatMap((item) => [
  {
    '@id': `${SITE_URL}#${item.id}`,
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: asId(`${SITE_URL}#${item.id}-answer`),
    isPartOf: asId(faqId),
  },
  {
    '@id': `${SITE_URL}#${item.id}-answer`,
    '@type': 'Answer',
    text: item.answer,
  },
]);

const topicNodes = (): JsonLdNode[] => topicGroups.flatMap((group) => group.terms.map((term): JsonLdNode => ({
  '@id': `${SITE_URL}#topic-${term.id}`,
  '@type': 'schemaType' in term && term.schemaType ? ['DefinedTerm', term.schemaType] : 'DefinedTerm',
  name: term.name,
  description: term.description,
  inDefinedTermSet: asId(topicSetId),
  url: `${SITE_URL}#topic-${term.id}`,
})));

const sectionNodes = (): JsonLdNode[] => {
  const topicIds = topicGroups.flatMap((group) => group.terms.map((term) => asId(`${SITE_URL}#topic-${term.id}`)));
  const questionIds = faqItems.map((item) => asId(`${SITE_URL}#${item.id}`));

  return sections.map((section): JsonLdNode => {
    const id = `${SITE_URL}#${section.id}`;
    const base: JsonLdNode = {
      '@id': id,
      '@type': 'WebPageElement',
      name: section.title,
      url: id,
      isPartOf: asId(pageId),
    };
    if (section.id === 'faq') {
      return { ...base, '@type': ['WebPageElement', 'FAQPage'], mainEntity: questionIds };
    }
    if (section.id === 'aesthetic-medicine-map') {
      return { ...base, '@type': ['WebPageElement', 'DefinedTermSet'], hasDefinedTerm: topicIds };
    }
    return base;
  });
};

const videoNodes = (assets: AssetManifest): JsonLdNode[] => videos.flatMap((video) => {
  const asset = assets.videos[video.id];
  if (!video.available || !asset?.mp4 || !asset.poster) return [];
  return [{
    '@id': `${SITE_URL}#${video.id}`,
    '@type': 'VideoObject',
    name: video.title,
    description: video.description,
    contentUrl: absoluteUrl(asset.mp4),
    thumbnailUrl: absoluteUrl(asset.poster),
    duration: video.duration,
    inLanguage: 'fa-IR',
    isPartOf: asId(pageId),
    url: `${SITE_URL}#${video.id}`,
  }];
});

export const buildCanonicalGraph = (assets: AssetManifest): CanonicalGraph => {
  const nodes: JsonLdNode[] = [
    {
      '@id': websiteId,
      '@type': 'WebSite',
      url: SITE_URL,
      name: seo.siteName,
      inLanguage: 'fa-IR',
    },
    {
      '@id': pageId,
      '@type': ['ProfilePage', 'MedicalWebPage'],
      url: SITE_URL,
      name: seo.title,
      description: seo.description,
      inLanguage: 'fa-IR',
      isPartOf: asId(websiteId),
      mainEntity: asId(doctor.id),
      about: [asId(doctor.id), asId(clinic.id)],
      datePublished: '2026-07-16',
      dateModified: '2026-07-16',
      hasPart: sections.map((section) => asId(`${SITE_URL}#${section.id}`)),
    },
    {
      '@id': doctor.id,
      '@type': 'Person',
      name: doctor.name,
      alternateName: doctor.alternateName,
      givenName: doctor.givenName,
      familyName: doctor.familyName,
      honorificPrefix: doctor.honorificPrefix,
      jobTitle: doctor.jobTitle,
      email: doctor.email,
      identifier: doctor.identifiers.map(asPropertyValue),
      sameAs: doctor.sameAs,
      worksFor: asId(doctor.worksFor),
      workLocation: asId(doctor.workLocation),
      mainEntityOfPage: asId(pageId),
      ...(assets.images['doctor-portrait'] ? { image: asId(`${SITE_URL}#image-doctor-portrait`) } : {}),
    },
    {
      '@id': clinic.id,
      '@type': 'MedicalClinic',
      name: clinic.name,
      url: SITE_URL,
      telephone: clinic.telephone,
      email: clinic.email,
      address: asId(clinic.address.id),
      geo: asId(clinic.geo.id),
      hasMap: clinic.mapsUrl,
      identifier: clinic.identifiers.map(asPropertyValue),
      sameAs: clinic.sameAs,
      employee: asId(clinic.employee),
      contactPoint: asId(`${SITE_URL}#clinic-contact`),
      areaServed: asId(`${SITE_URL}#city-kermanshah`),
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: googleMapsEvidence.ratingValue,
        ratingCount: googleMapsEvidence.reviewCount,
        bestRating: 5,
        worstRating: 1,
      },
      ...(assets.images['clinic-interior'] ? { image: asId(`${SITE_URL}#image-clinic-interior`) } : {}),
    },
    {
      '@id': clinic.address.id,
      '@type': 'PostalAddress',
      streetAddress: clinic.address.streetAddress,
      addressLocality: clinic.address.addressLocality,
      addressRegion: clinic.address.addressRegion,
      postalCode: clinic.address.postalCode,
      addressCountry: asId(`${SITE_URL}#country-ir`),
    },
    {
      '@id': clinic.geo.id,
      '@type': 'GeoCoordinates',
      latitude: clinic.geo.latitude,
      longitude: clinic.geo.longitude,
    },
    {
      '@id': `${SITE_URL}#clinic-contact`,
      '@type': 'ContactPoint',
      telephone: clinic.telephone,
      email: clinic.email,
      contactType: 'appointments',
      availableLanguage: ['fa'],
    },
    {
      '@id': `${SITE_URL}#city-kermanshah`,
      '@type': 'City',
      name: 'کرمانشاه',
      containedInPlace: asId(`${SITE_URL}#country-ir`),
    },
    {
      '@id': `${SITE_URL}#country-ir`,
      '@type': 'Country',
      name: 'ایران',
      identifier: 'IR',
    },
    {
      '@id': `${SITE_URL}#section-list`,
      '@type': 'ItemList',
      name: 'فهرست بخش‌های صفحه',
      itemListElement: sections.map((section, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: asId(`${SITE_URL}#${section.id}`),
      })),
    },
    {
      '@id': `${SITE_URL}knowledge-graph.jsonld#dataset`,
      '@type': 'Dataset',
      name: 'Canonical JSON-LD knowledge graph for ghezelbaash.ir',
      url: `${SITE_URL}knowledge-graph.jsonld`,
      inLanguage: ['fa-IR', 'en'],
      distribution: {
        '@type': 'DataDownload',
        contentUrl: `${SITE_URL}knowledge-graph.jsonld`,
        encodingFormat: 'application/ld+json',
      },
      isBasedOn: asId(pageId),
    },
    {
      '@id': `${SITE_URL}assets/data/chunks.json#dataset`,
      '@type': 'Dataset',
      name: 'Retrieval corpus for ghezelbaash.ir',
      url: `${SITE_URL}assets/data/chunks.json`,
      inLanguage: 'fa-IR',
      distribution: [
        { '@type': 'DataDownload', contentUrl: `${SITE_URL}llms-full.txt`, encodingFormat: 'text/plain' },
        { '@type': 'DataDownload', contentUrl: `${SITE_URL}assets/data/chunks.json`, encodingFormat: 'application/json' },
      ],
      isBasedOn: asId(pageId),
    },
    ...sectionNodes(),
    ...datasets.map((dataset): JsonLdNode => ({
      '@id': dataset.url,
      '@type': 'Dataset',
      name: dataset.name,
      url: dataset.url,
      inLanguage: 'en',
      includedInDataCatalog: {
        '@type': 'DataCatalog',
        name: dataset.catalogName,
        url: dataset.catalogUrl,
      },
    })),
    ...references.map((reference): JsonLdNode => ({
      '@id': `${SITE_URL}#${reference.id}`,
      '@type': reference.type,
      name: reference.name,
      url: reference.url,
      ...(reference.datePublished ? { datePublished: reference.datePublished } : {}),
      ...(reference.doi ? { identifier: reference.doi } : {}),
      ...('sameAs' in reference && reference.sameAs ? { sameAs: reference.sameAs } : {}),
    })),
    ...imageNodes(assets),
    ...topicNodes(),
    ...faqNodes(),
    ...videoNodes(assets),
  ];

  return { '@context': 'https://schema.org', '@graph': nodes };
};

/**
 * Page-scoped Schema projection. The full evidence/topic graph remains available
 * at /knowledge-graph.jsonld; the inline block contains only entities and page features
 * that a crawler can verify directly in the rendered document.
 */
export const buildInlineGraph = (canonical: CanonicalGraph): CanonicalGraph => {
  const keep = canonical['@graph'].filter((node) =>
    [
      'WebSite',
      'ProfilePage',
      'MedicalWebPage',
      'Person',
      'MedicalClinic',
      'PostalAddress',
      'GeoCoordinates',
      'ContactPoint',
      'City',
      'Country',
      'ImageObject',
      'VideoObject',
      'FAQPage',
      'Question',
      'Answer',
    ].some((type) => hasType(node, type)),
  ).map((node) => {
    if (node['@id'] !== pageId) return node;
    const { hasPart: _hasPart, ...projectedPage } = node;
    return projectedPage;
  });

  return { '@context': 'https://schema.org', '@graph': keep };
};
