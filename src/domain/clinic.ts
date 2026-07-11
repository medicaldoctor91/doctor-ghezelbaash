import { site } from './entities';

export const clinic = {
  id: `${site.url}#clinic`,
  name: site.clinicName,
  telephone: site.phone,
  address: site.address,
  streetAddress: site.streetAddress,
  city: site.city,
  region: site.region,
  countryCode: site.countryCode,
  hours: site.hours,
  latitude: site.latitude,
  longitude: site.longitude,
  googleMaps: site.maps,
  googlePlaceId: site.googlePlaceId,
  googleCid: site.googleCid,
  openStreetMap: site.openStreetMap,
  openStreetMapNode: site.openStreetMapNode,
  wikidata: site.placeWikidata,
  wikidataId: site.placeWikidataId,
  physicianId: `${site.url}#person`,
  reputationSnapshot: site.googleBusinessProfile,
} as const;
