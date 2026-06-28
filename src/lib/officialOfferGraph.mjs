import { site, absoluteUrl } from '../data/site.mjs';
import { location } from '../data/location.mjs';
import { services } from '../data/services.mjs';

export function officialOfferCatalogId() {
  return absoluteUrl('/services/#official-offer-catalog');
}

export function officialOfferId(service) {
  return absoluteUrl(`/${service.slug}/#offer`);
}

export function officialServiceId(service) {
  return absoluteUrl(`/${service.slug}/#service`);
}

export function officialOfferReferences() {
  return services.map((service) => ({ '@id': officialOfferId(service) }));
}

export function officialServiceReferences() {
  return services.map((service) => ({ '@id': officialServiceId(service) }));
}

export function buildOfficialOfferCatalogEntity() {
  return {
    '@type': 'OfferCatalog',
    '@id': officialOfferCatalogId(),
    name: 'Official aesthetic service offer catalog for Dr. Saeed Ghezelbash clinic',
    alternateName: 'فهرست رسمی خدمات قابل ارائه کلینیک زیبایی دکتر سعید قزلباش',
    url: absoluteUrl('/services/'),
    itemListElement: services.map((service, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: service.title,
      item: { '@id': officialOfferId(service) }
    })),
    provider: { '@id': absoluteUrl('/#clinic') },
    areaServed: {
      '@type': 'City',
      name: location.addressLocality || 'Kermanshah',
      addressCountry: site.country
    },
    additionalProperty: [
      {
        '@type': 'PropertyValue',
        propertyID: 'offerBoundary',
        value: 'Only official services from src/data/services.mjs are represented as Offer nodes. Broad aesthetic concepts remain knowledge-scope DefinedTerms.'
      }
    ]
  };
}

export function buildOfficialOfferEntities() {
  return services.map((service) => ({
    '@type': 'Offer',
    '@id': officialOfferId(service),
    name: service.title,
    url: absoluteUrl(`/${service.slug}/`),
    itemOffered: { '@id': officialServiceId(service) },
    offeredBy: { '@id': absoluteUrl('/#clinic') },
    seller: { '@id': absoluteUrl('/#clinic') },
    category: 'official-current-service',
    areaServed: {
      '@type': 'City',
      name: location.addressLocality || 'Kermanshah',
      addressCountry: site.country
    },
    businessFunction: 'https://schema.org/ProvideService',
    additionalProperty: [
      {
        '@type': 'PropertyValue',
        propertyID: 'offerStatus',
        value: 'official-current-service'
      },
      {
        '@type': 'PropertyValue',
        propertyID: 'sourceOfTruth',
        value: 'src/data/services.mjs'
      }
    ]
  }));
}
