import { authoritySignals } from '../data/authoritySignals.mjs';
import { location } from '../data/location.mjs';
import { site } from '../data/site.mjs';
import { getUrlsByUse } from '../lib/sourceClassifier.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.location.astro.v2.source_contract',
    canonicalWebsite: site.canonicalBase + '/',
    address: location.canonicalAddressFa,
    telephone: location.telephone,
    googleMaps: location.googleMapsCid,
    googleMapsPlace: location.googleMapsPlace,
    openStreetMap: location.openStreetMap,
    openStreetMapNodeId: location.openStreetMapNodeId,
    mapProfiles: getUrlsByUse(authoritySignals, 'clinic', 'hasMap')
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
