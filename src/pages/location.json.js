import { authoritySignals } from '../data/authoritySignals.mjs';
import { location } from '../data/location.mjs';
import { googleMapsReputation } from '../data/reputation.mjs';
import { site } from '../data/site.mjs';
import { getUrlsByUse } from '../lib/sourceClassifier.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.location.astro.v3.reputation_integrated',
    canonicalWebsite: site.canonicalBase + '/',
    address: location.canonicalAddressFa,
    streetAddress: location.streetAddressFa,
    addressLocality: location.addressLocality,
    addressRegion: location.addressRegion,
    postalCode: location.postalCode,
    addressCountry: location.addressCountry,
    telephone: location.telephone,
    priceRange: location.priceRange,
    googleMaps: location.googleMapsCid,
    googleMapsPlace: location.googleMapsPlace,
    openStreetMap: location.openStreetMap,
    openStreetMapNodeId: location.openStreetMapNodeId,
    geo: location.geo,
    googleMapsReputation,
    mapProfiles: getUrlsByUse(authoritySignals, 'clinic', 'hasMap')
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
