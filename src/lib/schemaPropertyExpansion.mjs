import { site, absoluteUrl, canonicalImage } from '../data/site.mjs';
import { location } from '../data/location.mjs';
import { publicDataset } from '../data/dataset.mjs';
import { machineAssetDataDownloads } from './machineAssets.mjs';

export function graphContactPointId() {
  return absoluteUrl('/#contact-point');
}

export function graphDoctorImageId() {
  return absoluteUrl('/#doctor-image');
}

export function graphClinicLogoId() {
  return absoluteUrl('/#clinic-logo');
}

export function buildGraphContactPoint() {
  return {
    '@type': 'ContactPoint',
    '@id': graphContactPointId(),
    telephone: location.telephone,
    contactType: 'aesthetic medicine consultation',
    areaServed: {
      '@type': 'City',
      name: location.addressLocality,
      addressCountry: location.addressCountry
    },
    availableLanguage: ['fa-IR'],
    url: absoluteUrl(site.pages.contact)
  };
}

export function buildGraphImageObjects() {
  return [
    {
      '@type': 'ImageObject',
      '@id': graphDoctorImageId(),
      url: canonicalImage(),
      contentUrl: canonicalImage(),
      name: 'Dr. Saeed Ghezelbash profile image',
      about: [
        { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
        { '@id': absoluteUrl('/#physician') },
        { '@id': absoluteUrl('/#clinic') }
      ]
    },
    {
      '@type': 'ImageObject',
      '@id': graphClinicLogoId(),
      url: canonicalImage(site.logo),
      contentUrl: canonicalImage(site.logo),
      name: 'Dr. Saeed Ghezelbash Aesthetic Clinic logo',
      about: { '@id': absoluteUrl('/#clinic') }
    }
  ];
}

export function buildSchemaPropertyExpansionNodes() {
  return [
    buildGraphContactPoint(),
    ...buildGraphImageObjects()
  ];
}

function uniqueRefs(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.filter(Boolean)) {
    const key = typeof value === 'string' ? value : value['@id'] || value.url || JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function appendRefs(currentValue, additions = []) {
  const current = Array.isArray(currentValue) ? currentValue : [currentValue].filter(Boolean);
  return uniqueRefs([...current, ...additions]);
}

export function applySchemaPropertyExpansion(nodes) {
  const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
  const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
  const physician = byId.get(absoluteUrl('/#physician'));
  const clinic = byId.get(absoluteUrl('/#clinic'));
  const website = byId.get(absoluteUrl('/#website'));
  const dataset = byId.get(absoluteUrl('/kg/#dataset'));
  const contactPoint = { '@id': graphContactPointId() };
  const doctorImage = { '@id': graphDoctorImageId() };
  const clinicLogo = { '@id': graphClinicLogoId() };

  if (person) {
    person.image = doctorImage;
    person.subjectOf = appendRefs(person.subjectOf, [doctorImage]);
  }

  if (physician) {
    physician.image = doctorImage;
    physician.contactPoint = contactPoint;
    physician.availableLanguage = ['fa-IR'];
  }

  if (clinic) {
    clinic.image = doctorImage;
    clinic.logo = clinicLogo;
    clinic.contactPoint = contactPoint;
    clinic.availableLanguage = ['fa-IR'];
  }

  if (website) {
    website.image = doctorImage;
  }

  if (dataset) {
    dataset.distribution = machineAssetDataDownloads();
    dataset.isBasedOn = { '@id': absoluteUrl('/graph-ghezelbaash-final.jsonld') };
    dataset.spatialCoverage = {
      '@type': 'City',
      name: location.addressLocality,
      addressRegion: location.addressRegion,
      addressCountry: location.addressCountry
    };
    dataset.keywords = [
      'Dr. Saeed Ghezelbash',
      'aesthetic medicine Kermanshah',
      'medical aesthetics knowledge graph',
      'local SEO entity graph',
      publicDataset.doi
    ];
  }

  const serviceNodes = nodes.filter((node) => node['@type'] === 'Service');
  for (const service of serviceNodes) {
    service.availableChannel = {
      '@type': 'ServiceChannel',
      serviceUrl: service.url,
      servicePhone: contactPoint,
      serviceLocation: { '@id': absoluteUrl('/#clinic') }
    };
    service.isRelatedTo = serviceNodes
      .filter((other) => other['@id'] !== service['@id'])
      .map((other) => ({ '@id': other['@id'] }));
  }

  return nodes;
}
