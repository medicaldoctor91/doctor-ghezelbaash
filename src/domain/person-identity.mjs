export const personAlternateNames = [
  'دکتر سعید قزلباش',
  'دکتر محمد سعید قزلباش',
  'دکتر قزلباش',
  'سعید قزلباش',
  'محمد سعید قزلباش',
  'محمدسعید قزلباش',
  'Dr. Saeed Ghezelbash',
  'Dr. Saeed Ghezelbaash',
  'Mohammad Saeed Ghezelbash',
  'Dr. Mohammad Saeed Ghezelbash',
  'Dr. Mohammad Saeed Ghazlbash',
  'Saeed Ghezelbash',
  'Saeed Ghezelbaash',
  'Mohammad Saeed Ghazlbash',
  'Mohammadsaeed Ghezelbash',
  'Saeed Qezlbash',
];

export const personRequiredSameAs = [
  'https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e',
  'https://orcid.org/0009-0001-9346-8475',
  'https://www.wikidata.org/entity/Q140287622',
  'https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/',
  'https://github.com/medicaldoctor91/doctor-ghezelbaash',
  'https://github.com/Medicaldoctor91',
  'https://www.pinterest.com/qezelbaash/',
  'https://about.me/ghezelbaash',
  'https://linktr.ee/Doctor.ghezelbaash',
  'https://huggingface.co/Ghezelbaash',
  'https://x.com/Qezelbaash',
];

export const clinicRequiredSameAs = [
  'https://www.instagram.com/doctor.ghezelbaash/',
  'https://www.linkedin.com/in/saeed-ghezelbash-93310a96',
  'https://www.facebook.com/Ghezelbaash/',
];

export const restoredPersonIdentifiers = [
  {
    '@type': 'PropertyValue',
    propertyID: 'NCBI Bibliography',
    value: 'saeed.ghezelbash.1',
    url: 'https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/',
  },
  {
    '@type': 'PropertyValue',
    propertyID: 'MINC',
    name: 'Medical Identification Number for Canada',
    value: 'CAMD-0224-1997',
  },
  {
    '@type': 'PropertyValue',
    propertyID: 'Hugging Face Profile',
    name: 'Personal Hugging Face profile',
    value: 'Ghezelbaash',
    url: 'https://huggingface.co/Ghezelbaash',
  },
];

export const restoredPersonProfileNodes = [
  {
    '@type': 'ProfilePage',
    '@id': 'https://www.facebook.com/Ghezelbaash/',
    url: 'https://www.facebook.com/Ghezelbaash/',
    name: 'پروفایل Facebook کلینیک دکتر سعید قزلباش',
    about: { '@id': 'https://www.ghezelbaash.ir/#clinic' },
    mainEntity: { '@id': 'https://www.ghezelbaash.ir/#clinic' },
    publisher: { '@type': 'Organization', name: 'Facebook' },
  },
  {
    '@type': 'ProfilePage',
    '@id': 'https://www.pinterest.com/qezelbaash/',
    url: 'https://www.pinterest.com/qezelbaash/',
    name: 'پروفایل Pinterest دکتر سعید قزلباش',
    about: { '@id': 'https://www.ghezelbaash.ir/#person' },
    publisher: { '@type': 'Organization', name: 'Pinterest' },
  },
];

export const personIdentityContract = {
  honorificPrefix: 'دکتر',
  minc: 'CAMD-0224-1997',
  linkedin: 'https://www.linkedin.com/in/saeed-ghezelbash-93310a96',
  facebook: 'https://www.facebook.com/Ghezelbaash/',
  instagram: 'https://www.instagram.com/doctor.ghezelbaash/',
  pinterest: 'https://www.pinterest.com/qezelbaash/',
  ncbiBibliography: 'https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/',
};
