import { location } from '../data/location.mjs';
import { site } from '../data/site.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.location.astro.v1',
    canonicalWebsite: site.canonicalBase + '/',
    address: location.canonicalAddressFa,
    telephone: location.telephone,
    googleMaps: location.googleMapsCid,
    googleMapsPlace: location.googleMapsPlace,
    openStreetMap: location.openStreetMap,
    openStreetMapNodeId: location.openStreetMapNodeId
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
