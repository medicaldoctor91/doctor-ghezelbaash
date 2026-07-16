import { clinic } from '../data/clinic.ts';
import { datasets } from '../data/datasets.ts';
import { doctor, SITE_URL } from '../data/doctor.ts';
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
  images: Record<string, { avif?: string; webp?: string; fallback?: string; width: number; height: number; alt?: string }>;
  videos: Record<string, { mp4?: string; webm?: string; poster?: string; captions?: string }>;
};

const pageId = `${SITE_URL}#webpage`;
const websiteId = `${SITE_URL}#website`;

const imageNodes = (assets: AssetManifest): JsonLdNode[] => images.flatMap((image) => {
  const asset = assets.images[image.id];
  const url = asset?.webp ?? asset?.fallback ?? asset?.avif;
  if (!asset || !url) return [];
  return [{ '@id': `${SITE_URL}#image-${image.id}`, '@type': 'ImageObject', contentUrl: absoluteUrl(url), url: absoluteUrl(url), width: asset.width, height: asset.height, ...(asset.alt ? { caption: asset.alt, name: asset.alt } : {}) }];
});

const faqNodes = (): JsonLdNode[] => [{
  '@id': `${SITE_URL}#faq-page`, '@type': 'FAQPage', isPartOf: asId(pageId),
  mainEntity: faqItems.map((item) => asId(`${SITE_URL}#${item.id}`)),
}, ...faqItems.flatMap((item) => [
  { '@id': `${SITE_URL}#${item.id}`, '@type': 'Question', name: item.question, acceptedAnswer: asId(`${SITE_URL}#${item.id}-answer`) },
  { '@id': `${SITE_URL}#${item.id}-answer`, '@type': 'Answer', text: item.answer },
])];

const topicNodes = (): JsonLdNode[] => {
  const terms = topicGroups.flatMap((group) => group.terms);
  return [{
    '@id': `${SITE_URL}#aesthetic-defined-terms`, '@type': 'DefinedTermSet', name: 'واژگان پزشکی زیبایی',
    hasDefinedTerm: terms.map((term) => asId(`${SITE_URL}#term-${term.id}`)),
  }, ...terms.flatMap((term) => [
    { '@id': `${SITE_URL}#term-${term.id}`, '@type': 'DefinedTerm', name: term.name, description: term.description, inDefinedTermSet: asId(`${SITE_URL}#aesthetic-defined-terms`) },
    { '@id': `${SITE_URL}#procedure-${term.id}`, '@type': 'MedicalProcedure', name: term.name, description: term.description, mainEntityOfPage: asId(pageId) },
  ])];
};

const videoNodes = (assets: AssetManifest): JsonLdNode[] => videos.flatMap((video) => {
  const asset = assets.videos[video.id];
  if (!video.available || !asset?.mp4 || !asset.poster) return [];
  return [{
    '@id': `${SITE_URL}#video-${video.id}`, '@type': 'VideoObject', name: video.title, description: video.description,
    contentUrl: absoluteUrl(asset.mp4), thumbnailUrl: absoluteUrl(asset.poster), duration: video.duration,
    inLanguage: 'fa-IR', isPartOf: asId(pageId), url: `${SITE_URL}#${video.id}`, mainEntityOfPage: asId(pageId),
  }];
});

export const buildCanonicalGraph = (assets: AssetManifest): CanonicalGraph => {
  const nodes: JsonLdNode[] = [
    { '@id': websiteId, '@type': 'WebSite', url: SITE_URL, name: seo.siteName, inLanguage: 'fa-IR' },
    { '@id': pageId, '@type': ['ProfilePage','MedicalWebPage'], url: SITE_URL, name: seo.title, description: seo.description, inLanguage: 'fa-IR', isPartOf: asId(websiteId), mainEntity: asId(doctor.id), about: [asId(doctor.id),asId(clinic.id)], datePublished: '2026-07-16', dateModified: '2026-07-16', hasPart: sections.map((section) => asId(`${SITE_URL}#section-${section.id}`)) },
    { '@id': doctor.id, '@type': 'Person', name: doctor.name, alternateName: doctor.alternateName, givenName: doctor.givenName, familyName: doctor.familyName, honorificPrefix: doctor.honorificPrefix, jobTitle: doctor.jobTitle, email: doctor.email, identifier: doctor.identifiers.map(asPropertyValue), sameAs: doctor.sameAs, worksFor: asId(doctor.worksFor), workLocation: asId(doctor.workLocation), mainEntityOfPage: asId(pageId), ...(assets.images['doctor-portrait'] ? { image: asId(`${SITE_URL}#image-doctor-portrait`) } : {}) },
    { '@id': clinic.id, '@type': 'MedicalClinic', name: clinic.name, url: SITE_URL, telephone: clinic.telephone, email: clinic.email, address: asId(clinic.address.id), geo: asId(clinic.geo.id), hasMap: clinic.mapsUrl, identifier: clinic.identifiers.map(asPropertyValue), sameAs: clinic.sameAs, employee: asId(clinic.employee), contactPoint: asId(`${SITE_URL}#clinic-contact`), ...(assets.images['clinic-interior'] ? { image: asId(`${SITE_URL}#image-clinic-interior`) } : {}) },
    { '@id': clinic.address.id, '@type': 'PostalAddress', streetAddress: clinic.address.streetAddress, addressLocality: clinic.address.addressLocality, addressRegion: clinic.address.addressRegion, postalCode: clinic.address.postalCode, addressCountry: asId(`${SITE_URL}#country-ir`) },
    { '@id': clinic.geo.id, '@type': 'GeoCoordinates', latitude: clinic.geo.latitude, longitude: clinic.geo.longitude },
    { '@id': `${SITE_URL}#clinic-contact`, '@type': 'ContactPoint', telephone: clinic.telephone, email: clinic.email, contactType: 'customer support', availableLanguage: ['fa'] },
    { '@id': `${SITE_URL}#city-kermanshah`, '@type': 'City', name: 'کرمانشاه', containedInPlace: asId(`${SITE_URL}#country-ir`) },
    { '@id': `${SITE_URL}#country-ir`, '@type': 'Country', name: 'ایران', identifier: 'IR' },
    { '@id': `${SITE_URL}#section-list`, '@type': 'ItemList', name: 'فهرست بخش‌های صفحه', itemListElement: sections.map((section,index) => ({ '@type': 'ListItem', position: index + 1, item: asId(`${SITE_URL}#section-${section.id}`) })) },
    { '@id': `${SITE_URL}#dataset-canonical-graph`, '@type': 'Dataset', name: 'Canonical JSON-LD knowledge graph for ghezelbaash.ir', url: `${SITE_URL}graph.jsonld`, inLanguage: ['fa-IR','en'], distribution: { '@type': 'DataDownload', contentUrl: `${SITE_URL}graph.jsonld`, encodingFormat: 'application/ld+json' }, isBasedOn: asId(pageId) },
    { '@id': `${SITE_URL}#dataset-retrieval-corpus`, '@type': 'Dataset', name: 'Retrieval corpus for ghezelbaash.ir', url: `${SITE_URL}llms-full.txt`, inLanguage: 'fa-IR', distribution: [{ '@type': 'DataDownload', contentUrl: `${SITE_URL}llms-full.txt`, encodingFormat: 'text/plain' },{ '@type': 'DataDownload', contentUrl: `${SITE_URL}assets/data/chunks.json`, encodingFormat: 'application/json' }], isBasedOn: asId(pageId) },
    ...sections.map((section): JsonLdNode => ({ '@id': `${SITE_URL}#section-${section.id}`, '@type': 'WebPageElement', name: section.title, url: `${SITE_URL}#${section.id}`, isPartOf: asId(pageId) })),
    ...datasets.map((dataset): JsonLdNode => ({ '@id': dataset.id, '@type': 'Dataset', name: dataset.name, url: dataset.url, inLanguage: 'en', includedInDataCatalog: { '@type': 'DataCatalog', name: dataset.catalogName, url: dataset.catalogUrl } })),
    ...references.map((reference): JsonLdNode => ({ '@id': `${SITE_URL}#${reference.id}`, '@type': 'CreativeWork', name: reference.name, url: reference.url, datePublished: reference.datePublished, identifier: reference.doi })),
    ...imageNodes(assets), ...topicNodes(), ...faqNodes(), ...videoNodes(assets),
  ];
  return { '@context': 'https://schema.org', '@graph': nodes };
};
