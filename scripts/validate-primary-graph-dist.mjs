import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'dist', 'graph-ghezelbaash-final.jsonld');
let failed = false;
function fail(message) {
  console.error(message);
  failed = true;
}

if (!fs.existsSync(file)) {
  fail('missing dist/graph-ghezelbaash-final.jsonld');
} else {
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of [
    'DataCatalog',
    '/kg/#catalog',
    'EducationalOccupationalCredential',
    '/kg/credential#irimc-167430',
    '/kg/credential#medical-degree-kums-2018',
    '/kg/credential#mcc-doctor-of-medicine-equivalency',
    '/kg/organization#kermanshah-university-medical-school',
    '/kg/organization#medical-council-of-canada',
    'Kermanshah University of Medical Sciences School of Medicine',
    'Medical Council of Canada',
    'Medical Degree',
    'Doctor of Medicine',
    'Medical degree equivalency',
    'Canadian equivalency: Doctor of Medicine',
    '2020-09-17',
    '/kg/place#kermanshah',
    '/kg/medical-specialty#aesthetic-medicine',
    'Primary graph governance policy',
    '/kg/policy#primary-graph-governance',
    'graphConsolidationPolicy',
    'offerBoundaryPolicy',
    'sameAsPolicy',
    'accountablePerson',
    'maintainer',
    'schemaVersion',
    'isAccessibleForFree',
    'includedInDataCatalog',
    'availableAtOrFrom',
    'serviceArea',
    'knowsLanguage',
    'ProfilePage',
    'CollectionPage',
    'ContactPage',
    'MedicalWebPage',
    'BreadcrumbList',
    'ItemList',
    'ContactAction',
    'CommunicateAction',
    'mainEntityOfPage',
    'primaryImageOfPage',
    '/services/#service-list',
    '/contact/#webpage',
    '#breadcrumb-botox-kermanshah',
    '#breadcrumb-contact',
    '/services/#webpage',
    '/kg/#webpage',
    'دکتر سعید قزلباش؛ دروغ بزرگ جوانسازی و فریب زیباجویان',
    'کلینیک زیبایی دکتر سعید قزلباش کرمانشاه',
    '2026-06-27',
    '2025-06-30',
    'روانشناسی زیباجو',
    'سابسیژن',
    'PezeshkYab',
    'IranMedLabs',
    'Doctoreto',
    'DoctorYab',
    'Paziresh24',
    'DrDr',
    'Nobat.ir',
    'DrNext',
    'Nobat.net',
    'Tabibino',
    'GPezBJ',
    '43609',
    '92014',
    'dr-doctor.ghezelbaash',
    '27bdey',
    '62116',
    '265252',
    'https://www.instagram.com/doctor.ghezelbaash/',
    'https://www.facebook.com/Doctor.Ghezelbaash/',
    'https://www.facebook.com/Ghezelbaash/',
    'https://www.pinterest.com/qezelbaash/',
    'https://about.me/ghezelbaash',
    'https://linktr.ee/Doctor.ghezelbaash',
    'https://www.linkedin.com/in/saeed-ghezelbash-93310a96/',
    'https://www.paziresh24.com/dr/',
    'https://drdr.ir/dr/92014/',
    'https://drnext.ir/doctor/27bdey',
    'https://nobat.net/doctor/62116',
    'https://tabibino.com/doctor/265252/',
    'https://gadgetnews.net/927682/beauty-services-kermanshah-dr-saeed-ghazelbash/',
    '/kg/policy#primary-graph-final-layer',
    '/kg/expertise#term-set',
    '/kg/evidence#identity-sameas-list',
    '/kg/evidence#medical-directory-list',
    '/kg/evidence#local-map-list',
    '/kg/evidence#research-authority-list',
    '/kg/evidence#media-coverage-list',
    '/kg/occupation#aesthetic-physician',
    '/kg/occupation#medical-researcher',
    '/kg/audience#aesthetic-consultation-kermanshah',
    '/kg/place#kermanshah-aesthetic-medicine-market',
    'FAQPage',
    'Question',
    'acceptedAnswer',
    'disambiguatingDescription',
    'eligibleRegion',
    'seller'
  ]) {
    if (!text.includes(needle)) fail(`primary graph dist missing ${needle}`);
  }

  for (const retired of ['dataset-manifest.jsonld', 'publishing-crosswalk.jsonld', 'research-graph.jsonld']) {
    if (text.includes(`/${retired}`)) fail(`primary graph should not reference retired endpoint ${retired}`);
  }

  for (const privateNeedle of [
    'E94583066IMM',
    '1962-87530',
    'E0217736',
    'MyIntealth',
    'EICS',
    'ECA ID',
    'MCC candidate code',
    'Canadian immigration purposes',
    'immigration validity',
    'credentialEvidenceBoundary',
    'assessmentPurpose',
    'LMCC',
    '1991-05-29',
    'medicaldoctor91@gmail.com',
    'Yazdan Alley',
    'Delgosha street'
  ]) {
    if (text.includes(privateNeedle)) fail(`primary graph leaked private or non-authority credential data: ${privateNeedle}`);
  }
}

if (failed) process.exit(1);
console.log('Primary graph dist validation passed');
