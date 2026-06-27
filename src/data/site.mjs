export const site = {
  canonicalBase: 'https://www.ghezelbaash.ir',
  nameFa: 'کلینیک زیبایی دکتر سعید قزلباش',
  nameEn: 'Dr. Saeed Ghezelbash Aesthetic Clinic',
  personFa: 'دکتر سعید قزلباش',
  personEn: 'Dr. Saeed Ghezelbash',
  instagram: 'https://www.instagram.com/doctor.ghezelbaash/',
  phoneDisplay: '09308209494',
  phoneE164: '+989308209494',
  mapsCid: 'https://www.google.com/maps?cid=12350483144643112463',
  pages: {
    home: '/',
    person: '/dr-saeed-ghezelbash/',
    clinic: '/dr-saeed-ghezelbash-aesthetic-clinic/',
    services: '/services/',
    contact: '/contact/',
    evidence: '/evidence/',
    kg: '/kg/'
  },
  sameAs: {
    person: [
      'https://www.wikidata.org/wiki/Q140287622',
      'https://orcid.org/0009-0001-9346-8475',
      'https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/',
      'https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e',
      'https://www.linkedin.com/in/saeed-ghezelbash-93310a96/',
      'https://github.com/medicaldoctor91/doctor-ghezelbaash',
      'https://www.instagram.com/doctor.ghezelbaash/'
    ],
    clinic: [
      'https://www.wikidata.org/wiki/Q140288589',
      'https://www.instagram.com/doctor.ghezelbaash/',
      'https://www.google.com/maps?cid=12350483144643112463',
      'https://www.openstreetmap.org/node/13530287096'
    ]
  }
};

export const absoluteUrl = (path) => new URL(path, site.canonicalBase).toString();
