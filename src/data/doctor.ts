export const SITE_URL = 'https://www.ghezelbaash.ir/' as const;

export const doctorContactUrls = {
  instagramProfile: 'https://www.instagram.com/doctor.ghezelbaash/',
  instagramDirect: 'https://ig.me/m/doctor.ghezelbaash',
} as const;

export const doctor = {
  id: `${SITE_URL}#doctor`,
  type: 'Person',
  name: 'دکتر محمدسعید قزلباش',
  publicName: 'دکتر سعید قزلباش',
  givenName: 'محمدسعید',
  familyName: 'قزلباش',
  alternateName: [
    'دکتر سعید قزلباش',
    'دکتر سعید قزل‌باش',
    'دکتر محمد سعید قزلباش',
    'Dr. Saeed Ghezelbaash',
    'Dr. Saeed Ghezelbash',
    'Mohammad Saeed Ghezelbash',
  ],
  honorificPrefix: 'دکتر',
  jobTitle: 'پزشک',
  medicalRegistrationNumber: '167430',
  email: 'doctor@ghezelbaash.ir',
  identifiers: [
    {
      propertyID: 'Wikidata',
      value: 'Q140287622',
      url: 'https://www.wikidata.org/entity/Q140287622',
    },
    {
      propertyID: 'Google Knowledge Graph MID',
      value: '/g/11nqdfk76c',
      url: 'https://www.google.com/search?kgmid=/g/11nqdfk76c',
    },
    {
      propertyID: 'Cloud KG MID',
      value: 'C-02KY8SVQ2',
    },
    {
      propertyID: 'ORCID',
      value: '0009-0001-9346-8475',
      url: 'https://orcid.org/0009-0001-9346-8475',
    },
    {
      propertyID: 'Medical Council of Iran',
      value: '167430',
      url: 'https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e',
    },
  ],
  sameAs: [
    'https://www.wikidata.org/entity/Q140287622',
    'https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e',
    'https://orcid.org/0009-0001-9346-8475',
    'https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/',
    doctorContactUrls.instagramProfile,
    'https://www.linkedin.com/in/saeed-ghezelbash-93310a96',
    'https://www.facebook.com/Ghezelbaash/',
    'https://github.com/Medicaldoctor91',
    'https://www.pinterest.com/qezelbaash/',
    'https://about.me/ghezelbaash',
    'https://linktr.ee/Doctor.ghezelbaash',
    'https://huggingface.co/Ghezelbaash',
    'https://x.com/Qezelbaash',
  ],
  worksFor: `${SITE_URL}#clinic`,
  workLocation: `${SITE_URL}#clinic`,
  primaryImageId: `${SITE_URL}#image-doctor-portrait`,
} as const;

export const doctorIdentityUrls = {
  wikidata: 'https://www.wikidata.org/entity/Q140287622',
  googleKnowledgeGraph: 'https://www.google.com/search?kgmid=/g/11nqdfk76c',
  orcid: 'https://orcid.org/0009-0001-9346-8475',
  ncbi: 'https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/',
  medicalCouncil:
    'https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e',
} as const;
