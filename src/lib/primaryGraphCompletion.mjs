import { publicDataset } from '../data/dataset.mjs';
import { medicalEducationProfile } from '../data/education.mjs';
import { location } from '../data/location.mjs';
import { regulatoryIdentity } from '../data/regulatory.mjs';
import { site, absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';
import { machineAssetDataDownloads } from './machineAssets.mjs';

export function dataCatalogId() {
  return absoluteUrl('/kg/#catalog');
}

export function medicalCredentialId() {
  return absoluteUrl('/kg/credential#irimc-167430');
}

export function medicalDegreeCredentialId() {
  return absoluteUrl('/kg/credential#medical-degree-kums-2018');
}

export function mccCredentialAssessmentId() {
  return absoluteUrl('/kg/credential#mcc-eca-doctor-of-medicine-2020');
}

export function medicalSchoolId() {
  return absoluteUrl('/kg/organization#kermanshah-university-medical-school');
}

export function medicalCouncilOfCanadaId() {
  return absoluteUrl('/kg/organization#medical-council-of-canada');
}

export function kermanshahPlaceId() {
  return absoluteUrl('/kg/place#kermanshah');
}

export function aestheticMedicineSpecialtyId() {
  return absoluteUrl('/kg/medical-specialty#aesthetic-medicine');
}

function pageRef(path, fragment = '#webpage') {
  return { '@id': `${absoluteUrl(path)}${fragment}` };
}

function canonicalPageNodes() {
  const servicePageNodes = services.map((service) => ({
    '@type': 'WebPage',
    '@id': `${absoluteUrl(`/${service.slug}/`)}#webpage`,
    url: absoluteUrl(`/${service.slug}/`),
    name: service.title,
    inLanguage: site.locale,
    isPartOf: { '@id': absoluteUrl('/#website') },
    mainEntity: { '@id': absoluteUrl(`/${service.slug}/#service`) },
    about: [
      { '@id': absoluteUrl(`/${service.slug}/#service`) },
      { '@id': absoluteUrl('/#physician') },
      { '@id': absoluteUrl('/#clinic') },
      { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') }
    ],
    publisher: { '@id': absoluteUrl('/#clinic') }
  }));

  return [
    {
      '@type': 'WebPage',
      '@id': `${absoluteUrl('/')}#webpage`,
      url: absoluteUrl('/'),
      name: site.nameFa,
      inLanguage: site.locale,
      isPartOf: { '@id': absoluteUrl('/#website') },
      mainEntity: { '@id': absoluteUrl('/#clinic') },
      about: [
        { '@id': absoluteUrl('/#clinic') },
        { '@id': absoluteUrl('/#physician') },
        { '@id': absoluteUrl('/#dr-saeed-ghezelbash') }
      ],
      publisher: { '@id': absoluteUrl('/#clinic') }
    },
    {
      '@type': 'ProfilePage',
      '@id': `${absoluteUrl(site.pages.person)}#webpage`,
      url: absoluteUrl(site.pages.person),
      name: site.personFa,
      inLanguage: site.locale,
      isPartOf: { '@id': absoluteUrl('/#website') },
      mainEntity: { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      about: [
        { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
        { '@id': absoluteUrl('/#physician') },
        { '@id': absoluteUrl('/research/#collection') },
        { '@id': medicalDegreeCredentialId() },
        { '@id': mccCredentialAssessmentId() }
      ],
      publisher: { '@id': absoluteUrl('/#clinic') }
    },
    {
      '@type': 'ProfilePage',
      '@id': `${absoluteUrl(site.pages.clinic)}#webpage`,
      url: absoluteUrl(site.pages.clinic),
      name: site.nameFa,
      inLanguage: site.locale,
      isPartOf: { '@id': absoluteUrl('/#website') },
      mainEntity: { '@id': absoluteUrl('/#clinic') },
      about: [
        { '@id': absoluteUrl('/#clinic') },
        { '@id': absoluteUrl('/#physician') },
        { '@id': kermanshahPlaceId() }
      ],
      publisher: { '@id': absoluteUrl('/#clinic') }
    },
    {
      '@type': 'CollectionPage',
      '@id': `${absoluteUrl(site.pages.services)}#webpage`,
      url: absoluteUrl(site.pages.services),
      name: 'فهرست خدمات زیبایی دکتر سعید قزلباش',
      inLanguage: site.locale,
      isPartOf: { '@id': absoluteUrl('/#website') },
      mainEntity: { '@id': `${absoluteUrl(site.pages.services)}#service-list` },
      about: [
        { '@id': absoluteUrl('/#clinic') },
        { '@id': absoluteUrl('/#physician') },
        { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') }
      ],
      hasPart: services.map((service) => pageRef(`/${service.slug}/`)),
      publisher: { '@id': absoluteUrl('/#clinic') }
    },
    {
      '@type': 'CollectionPage',
      '@id': `${absoluteUrl(site.pages.kg)}#webpage`,
      url: absoluteUrl(site.pages.kg),
      name: 'Knowledge graph hub for Dr. Saeed Ghezelbash',
      inLanguage: site.locale,
      isPartOf: { '@id': absoluteUrl('/#website') },
      mainEntity: { '@id': absoluteUrl('/kg/#dataset') },
      about: [
        { '@id': absoluteUrl('/kg/#dataset') },
        { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
        { '@id': absoluteUrl('/#clinic') },
        { '@id': medicalDegreeCredentialId() },
        { '@id': mccCredentialAssessmentId() }
      ],
      publisher: { '@id': absoluteUrl('/#clinic') }
    },
    ...servicePageNodes
  ];
}

function buildEducationNodes() {
  const { medicalDegree, canadianCredentialAssessment } = medicalEducationProfile;

  return [
    {
      '@type': ['CollegeOrUniversity', 'EducationalOrganization'],
      '@id': medicalSchoolId(),
      name: medicalDegree.institution.name,
      alternateName: medicalDegree.institution.parentName,
      address: {
        '@type': 'PostalAddress',
        addressCountry: medicalDegree.institution.addressCountry
      }
    },
    {
      '@type': 'Organization',
      '@id': medicalCouncilOfCanadaId(),
      name: canadianCredentialAssessment.recognizedBy.name,
      url: canadianCredentialAssessment.recognizedBy.url,
      sameAs: [canadianCredentialAssessment.recognizedBy.url]
    },
    {
      '@type': 'EducationalOccupationalCredential',
      '@id': medicalDegreeCredentialId(),
      name: medicalDegree.name,
      credentialCategory: medicalDegree.credentialCategory,
      educationalLevel: medicalDegree.educationalLevel,
      competencyRequired: medicalDegree.fieldOfStudy,
      dateIssued: medicalDegree.dateAwarded,
      recognizedBy: { '@id': medicalSchoolId() },
      about: { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      additionalProperty: [
        {
          '@type': 'PropertyValue',
          propertyID: 'countryOfStudy',
          value: medicalDegree.countryOfStudy
        },
        {
          '@type': 'PropertyValue',
          propertyID: 'credentialEvidenceBoundary',
          value: medicalDegree.evidenceBoundary
        }
      ]
    },
    {
      '@type': 'EducationalOccupationalCredential',
      '@id': mccCredentialAssessmentId(),
      name: canadianCredentialAssessment.name,
      credentialCategory: canadianCredentialAssessment.credentialCategory,
      educationalLevel: canadianCredentialAssessment.equivalency,
      dateIssued: canadianCredentialAssessment.dateIssued,
      recognizedBy: { '@id': medicalCouncilOfCanadaId() },
      about: { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      assesses: { '@id': medicalDegreeCredentialId() },
      additionalProperty: [
        {
          '@type': 'PropertyValue',
          propertyID: 'assessedCredential',
          value: canadianCredentialAssessment.assessedCredential
        },
        {
          '@type': 'PropertyValue',
          propertyID: 'canadianEquivalency',
          value: canadianCredentialAssessment.equivalency
        },
        {
          '@type': 'PropertyValue',
          propertyID: 'assessmentPurpose',
          value: canadianCredentialAssessment.purpose
        },
        {
          '@type': 'PropertyValue',
          propertyID: 'credentialEvidenceBoundary',
          value: canadianCredentialAssessment.evidenceBoundary
        }
      ]
    }
  ];
}

export function buildPrimaryGraphCompletionNodes() {
  return [
    {
      '@type': 'DataCatalog',
      '@id': dataCatalogId(),
      name: 'Dr. Saeed Ghezelbash public entity data catalog',
      url: absoluteUrl(site.pages.kg),
      inLanguage: ['fa-IR', 'en'],
      creator: { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      publisher: { '@id': absoluteUrl('/#clinic') },
      dataset: { '@id': absoluteUrl('/kg/#dataset') },
      distribution: machineAssetDataDownloads(),
      about: [
        { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
        { '@id': absoluteUrl('/#physician') },
        { '@id': absoluteUrl('/#clinic') },
        { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') },
        { '@id': medicalDegreeCredentialId() },
        { '@id': mccCredentialAssessmentId() }
      ]
    },
    {
      '@type': 'EducationalOccupationalCredential',
      '@id': medicalCredentialId(),
      name: 'Iran Medical Council practice license 167430',
      credentialCategory: regulatoryIdentity.irimc.licenseType,
      recognizedBy: {
        '@type': 'Organization',
        name: 'Iran Medical Council',
        url: regulatoryIdentity.irimc.url
      },
      identifier: {
        '@type': 'PropertyValue',
        propertyID: 'IRIMC',
        value: regulatoryIdentity.irimc.medicalCouncilNumber,
        url: regulatoryIdentity.irimc.url
      },
      about: { '@id': absoluteUrl('/#dr-saeed-ghezelbash') }
    },
    ...buildEducationNodes(),
    {
      '@type': 'City',
      '@id': kermanshahPlaceId(),
      name: location.addressLocality,
      addressRegion: location.addressRegion,
      addressCountry: location.addressCountry,
      geo: {
        '@type': 'GeoCoordinates',
        latitude: location.geo.latitude,
        longitude: location.geo.longitude
      }
    },
    {
      '@type': 'DefinedTerm',
      '@id': aestheticMedicineSpecialtyId(),
      name: 'Aesthetic medicine',
      alternateName: ['پزشکی زیبایی', 'medical aesthetics'],
      termCode: 'aesthetic-medicine',
      inDefinedTermSet: { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') },
      about: [
        { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
        { '@id': absoluteUrl('/#physician') },
        { '@id': absoluteUrl('/#clinic') }
      ]
    },
    ...canonicalPageNodes()
  ];
}

function appendRefs(currentValue, additions = []) {
  const current = Array.isArray(currentValue) ? currentValue : [currentValue].filter(Boolean);
  const seen = new Set(current.map((item) => item?.['@id'] || item?.url || JSON.stringify(item)));
  const merged = [...current];
  for (const addition of additions) {
    const key = addition?.['@id'] || addition?.url || JSON.stringify(addition);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(addition);
  }
  return merged;
}

function educationCredentialRefs() {
  return [
    { '@id': medicalDegreeCredentialId() },
    { '@id': mccCredentialAssessmentId() }
  ];
}

export function applyPrimaryGraphCompletion(nodes) {
  const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
  const website = byId.get(absoluteUrl('/#website'));
  const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
  const physician = byId.get(absoluteUrl('/#physician'));
  const clinic = byId.get(absoluteUrl('/#clinic'));
  const dataset = byId.get(absoluteUrl('/kg/#dataset'));
  const termSet = byId.get(absoluteUrl('/kg/aesthetic-scope#term-set'));
  const catalogRef = { '@id': dataCatalogId() };
  const credentialRef = { '@id': medicalCredentialId() };
  const placeRef = { '@id': kermanshahPlaceId() };
  const specialtyRef = { '@id': aestheticMedicineSpecialtyId() };
  const educationRefs = educationCredentialRefs();

  if (website) {
    website.hasPart = appendRefs(website.hasPart, canonicalPageNodes().map((page) => ({ '@id': page['@id'] })));
    website.mainEntity = { '@id': absoluteUrl('/kg/#dataset') };
  }

  if (person) {
    person.hasCredential = appendRefs(person.hasCredential, [credentialRef, ...educationRefs]);
    person.knowsAbout = appendRefs(person.knowsAbout, [specialtyRef]);
    person.workLocation = { '@id': absoluteUrl('/#clinic') };
    person.alumniOf = appendRefs(person.alumniOf, [{ '@id': medicalSchoolId() }]);
  }

  if (physician) {
    physician.hasCredential = appendRefs(physician.hasCredential, [credentialRef, ...educationRefs]);
    physician.medicalSpecialty = appendRefs(physician.medicalSpecialty, [specialtyRef]);
    physician.areaServed = placeRef;
    physician.alumniOf = appendRefs(physician.alumniOf, [{ '@id': medicalSchoolId() }]);
  }

  if (clinic) {
    clinic.areaServed = placeRef;
  }

  if (dataset) {
    dataset.includedInDataCatalog = catalogRef;
    dataset.isPartOf = catalogRef;
    dataset.distribution = machineAssetDataDownloads();
    dataset.license = publicDataset.license;
    dataset.isAccessibleForFree = true;
    dataset.spatialCoverage = placeRef;
    dataset.mainEntity = [
      { '@id': absoluteUrl('/#dr-saeed-ghezelbash') },
      { '@id': absoluteUrl('/#physician') },
      { '@id': absoluteUrl('/#clinic') },
      { '@id': absoluteUrl('/kg/aesthetic-scope#term-set') }
    ];
    dataset.hasPart = appendRefs(dataset.hasPart, [
      { '@id': medicalDegreeCredentialId() },
      { '@id': mccCredentialAssessmentId() },
      { '@id': medicalSchoolId() },
      { '@id': medicalCouncilOfCanadaId() }
    ]);
  }

  if (termSet) {
    termSet.hasDefinedTerm = appendRefs(termSet.hasDefinedTerm, [specialtyRef]);
  }

  for (const service of nodes.filter((node) => node['@type'] === 'Service')) {
    service.serviceArea = placeRef;
    service.availableAtOrFrom = { '@id': absoluteUrl('/#clinic') };
  }

  return nodes;
}
