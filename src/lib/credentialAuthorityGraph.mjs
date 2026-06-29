import { absoluteUrl, site } from '../data/site.mjs';

function ref(path) {
  return { '@id': absoluteUrl(path) };
}

function refs(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function refKey(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value['@id'] || value.url || `${value.propertyID || ''}:${value.value || value.codeValue || ''}`;
  return String(value);
}

function appendUnique(currentValue, additions = []) {
  const seen = new Set(refs(currentValue).map(refKey));
  const merged = [...refs(currentValue)];
  for (const addition of additions) {
    const key = refKey(addition);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(addition);
  }
  return merged;
}

function node(path, type, fields = {}) {
  return {
    '@id': absoluteUrl(path),
    '@type': type,
    ...fields
  };
}

export const mccOrganizationId = () => absoluteUrl('/kg/organization#medical-council-of-canada');
export const kumsMedicalSchoolId = () => absoluteUrl('/kg/organization#kermanshah-university-medical-sciences-school-of-medicine');
export const medicalDegreeCredentialId = () => absoluteUrl('/kg/credential#medical-degree');
export const mccDoctorOfMedicineEquivalencyCredentialId = () => absoluteUrl('/kg/credential#mcc-doctor-of-medicine-equivalency');

export function mincIdentifier() {
  return {
    '@type': 'PropertyValue',
    propertyID: 'MINC',
    name: 'Medical Identification Number for Canada',
    value: 'CAMD-0224-1997'
  };
}

export function credentialAuthorityReferences() {
  return [
    ref('/kg/organization#medical-council-of-canada'),
    ref('/kg/organization#kermanshah-university-medical-sciences-school-of-medicine'),
    ref('/kg/credential#medical-degree'),
    ref('/kg/credential#mcc-doctor-of-medicine-equivalency')
  ];
}

export function buildCredentialAuthorityGraphNodes() {
  return [
    node('/kg/organization#medical-council-of-canada', 'Organization', {
      name: 'Medical Council of Canada',
      alternateName: ['MCC', 'Conseil médical du Canada'],
      url: 'https://mcc.ca/'
    }),
    node('/kg/organization#kermanshah-university-medical-sciences-school-of-medicine', ['CollegeOrUniversity', 'EducationalOrganization'], {
      name: 'Kermanshah University of Medical Sciences School of Medicine',
      alternateName: ['Kermanshah University of Medical Sciences', 'دانشگاه علوم پزشکی کرمانشاه', 'دانشکده پزشکی دانشگاه علوم پزشکی کرمانشاه'],
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'IR'
      }
    }),
    node('/kg/credential#medical-degree', ['EducationalOccupationalCredential', 'CreativeWork'], {
      name: 'Medical degree',
      alternateName: ['Doctor of Medicine', 'مدرک پزشکی'],
      credentialCategory: 'Medical degree',
      educationalLevel: 'Doctor of Medicine',
      datePublished: '2018',
      provider: ref('/kg/organization#kermanshah-university-medical-sciences-school-of-medicine'),
      about: [
        ref('/#dr-saeed-ghezelbash'),
        ref('/#physician'),
        ref('/kg/organization#kermanshah-university-medical-sciences-school-of-medicine')
      ]
    }),
    node('/kg/credential#mcc-doctor-of-medicine-equivalency', ['EducationalOccupationalCredential', 'CreativeWork'], {
      name: 'Doctor of Medicine equivalency assessed by the Medical Council of Canada',
      alternateName: [
        'MCC-assessed medical degree equivalency',
        'Canadian equivalency: Doctor of Medicine',
        'ارزیابی تطبیقی مدرک پزشکی توسط شورای پزشکی کانادا'
      ],
      description: 'Medical degree assessed by the Medical Council of Canada with Canadian equivalency established as Doctor of Medicine.',
      credentialCategory: 'Medical degree equivalency',
      educationalLevel: 'Doctor of Medicine',
      datePublished: '2020-09-17',
      recognizedBy: ref('/kg/organization#medical-council-of-canada'),
      publisher: ref('/kg/organization#medical-council-of-canada'),
      about: [
        ref('/#dr-saeed-ghezelbash'),
        ref('/#physician'),
        ref('/kg/credential#medical-degree'),
        ref('/kg/organization#medical-council-of-canada')
      ]
    })
  ];
}

export function applyCredentialAuthorityGraph(nodes) {
  const byId = new Map(nodes.map((item) => [item['@id'], item]).filter(([id]) => Boolean(id)));
  const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
  const physician = byId.get(absoluteUrl('/#physician'));
  const dataset = byId.get(absoluteUrl('/kg/#dataset'));
  const website = byId.get(absoluteUrl('/#website'));
  const personPage = byId.get(`${absoluteUrl(site.pages.person)}#webpage`);

  const credentialRefs = [
    ref('/kg/credential#mcc-doctor-of-medicine-equivalency'),
    ref('/kg/credential#medical-degree')
  ];
  const authorityRefs = credentialAuthorityReferences();

  for (const entity of [person, physician].filter(Boolean)) {
    entity.identifier = appendUnique(entity.identifier, [mincIdentifier()]);
    entity.hasCredential = appendUnique(entity.hasCredential, credentialRefs);
    entity.knowsAbout = appendUnique(entity.knowsAbout, [
      ref('/kg/organization#medical-council-of-canada'),
      ref('/kg/credential#mcc-doctor-of-medicine-equivalency')
    ]);
  }

  if (dataset) {
    dataset.about = appendUnique(dataset.about, authorityRefs);
    dataset.mentions = appendUnique(dataset.mentions, authorityRefs);
    dataset.hasPart = appendUnique(dataset.hasPart, authorityRefs);
  }

  if (website) {
    website.about = appendUnique(website.about, authorityRefs);
  }

  if (personPage) {
    personPage.about = appendUnique(personPage.about, authorityRefs);
    personPage.mentions = appendUnique(personPage.mentions, authorityRefs);
  }

  return nodes;
}
