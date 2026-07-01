export const site = {
  canonicalBase: 'https://www.ghezelbaash.ir',
  nameFa: 'کلینیک زیبایی دکتر سعید قزلباش',
  nameEn: 'Dr. Saeed Ghezelbaash Aesthetic Clinic',
  personFa: 'دکتر سعید قزلباش',
  personEn: 'Dr. Saeed Ghezelbaash',
  instagram: 'https://www.instagram.com/doctor.ghezelbaash/',
  phoneDisplay: '09308209494',
  phoneE164: '+989308209494',
  mapsCid: 'https://www.google.com/maps?cid=12350483144643112463',
  logo: '/logo.png',
  image: '/doctor.jpg',
  locale: 'fa-IR',
  city: 'Kermanshah',
  country: 'IR',
  pages: {
    home: '/',
    person: '/about/',
    clinic: '/about/',
    services: '/services/',
    contact: '/contact/',
    evidence: '/services/',
    kg: '/'
  },
  pageLabels: {
    '/': 'خانه',
    '/about/': 'درباره دکتر و کلینیک',
    '/services/': 'خدمات',
    '/contact/': 'تماس',
    '/botox/': 'بوتاکس',
    '/filler/': 'فیلر',
    '/thread-lift/': 'لیفت نخ',
    '/skin-rejuvenation/': 'جوانسازی پوست'
  },
  sameAs: {
    person: [
      'https://www.wikidata.org/wiki/Q140287622',
      'https://orcid.org/0009-0001-9346-8475',
      'https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/',
      'https://github.com/medicaldoctor91/doctor-ghezelbaash',
      'https://www.instagram.com/doctor.ghezelbaash/'
    ],
    clinic: [
      'https://www.wikidata.org/wiki/Q140288589',
      'https://www.instagram.com/doctor.ghezelbaash/',
      'https://www.google.com/maps?cid=12350483144643112463',
      'https://www.openstreetmap.org/node/13530287096'
    ],
    kg: [
      'https://www.wikidata.org/wiki/Q140304972',
      'https://doi.org/10.5281/zenodo.18765169',
      'https://github.com/medicaldoctor91/doctor-ghezelbaash'
    ]
  }
};

export const absoluteUrl = (path) => new URL(path, site.canonicalBase).toString();
export const canonicalImage = (path = site.image) => absoluteUrl(path);
export const routeLabel = (path) => site.pageLabels[path] || path.replaceAll('/', '').replaceAll('-', ' ') || site.nameFa;
