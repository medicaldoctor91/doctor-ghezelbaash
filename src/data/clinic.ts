import { SITE_URL } from './doctor.ts';

export const clinic = {
  id: `${SITE_URL}#clinic`,
  type: 'MedicalClinic',
  name: 'کلینیک زیبایی دکتر سعید قزلباش',
  telephone: '+989308209494',
  telephoneDisplay: '۰۹۳۰ ۸۲۰ ۹۴۹۴',
  email: 'doctor@ghezelbaash.ir',
  address: {
    id: `${SITE_URL}#clinic-address`,
    streetAddress: 'میدان ۱۷ شهریور، ساختمان ویستا',
    addressLocality: 'کرمانشاه',
    addressRegion: 'کرمانشاه',
    postalCode: '6714657412',
    addressCountry: 'IR',
  },
  geo: {
    id: `${SITE_URL}#clinic-geo`,
    latitude: 34.3400698,
    longitude: 47.0852334,
  },
  mapsUrl: 'https://www.google.com/maps?cid=12350483144643112463',
  placeSearchUrl:
    'https://www.google.com/maps/search/?api=1&query=کلینیک%20زیبایی%20دکتر%20قزلباش%20کرمانشاه&query_place_id=ChIJBTOYDOTt-j8RD-7mAPy6Zas',
  identifiers: [
    {
      propertyID: 'Wikidata',
      value: 'Q140288589',
      url: 'https://www.wikidata.org/entity/Q140288589',
    },
    {
      propertyID: 'Google Local Knowledge Graph MID',
      value: '/g/11r3rzdtb3',
      url: 'https://www.google.com/search?kgmid=/g/11r3rzdtb3',
    },
    {
      propertyID: 'Google Maps CID',
      value: '12350483144643112463',
      url: 'https://www.google.com/maps?cid=12350483144643112463',
    },
    {
      propertyID: 'Google Place ID',
      value: 'ChIJBTOYDOTt-j8RD-7mAPy6Zas',
    },
    {
      propertyID: 'OpenStreetMap node',
      value: '13530287096',
      url: 'https://www.openstreetmap.org/node/13530287096',
    },
  ],
  sameAs: [
    'https://www.wikidata.org/entity/Q140288589',
    'https://www.google.com/maps?cid=12350483144643112463',
    'https://www.openstreetmap.org/node/13530287096',
  ],
  employee: `${SITE_URL}#doctor`,
  primaryImageId: `${SITE_URL}#image-clinic-interior`,
} as const;
