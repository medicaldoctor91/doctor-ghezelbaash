import { location } from '../data/location.mjs';
import { site, absoluteUrl } from '../data/site.mjs';
import { googleMapsReputation } from '../data/reputation.mjs';

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function toCsv(rows) {
  const headers = [
    'entity',
    'name_fa',
    'name_en',
    'street_address_fa',
    'locality',
    'region',
    'postal_code',
    'country',
    'phone_e164',
    'website',
    'instagram',
    'google_maps_cid',
    'google_maps_place_id',
    'latitude',
    'longitude'
  ];

  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))
  ].join('\n') + '\n';
}

export function GET() {
  const rows = [
    {
      entity: 'clinic',
      name_fa: site.nameFa,
      name_en: site.nameEn,
      street_address_fa: location.canonicalAddressFa,
      locality: location.addressLocality,
      region: location.addressRegion,
      postal_code: location.postalCode,
      country: location.addressCountry,
      phone_e164: location.telephone,
      website: absoluteUrl('/'),
      instagram: site.instagram,
      google_maps_cid: googleMapsReputation.cid,
      google_maps_place_id: googleMapsReputation.placeId,
      latitude: location.geo.latitude,
      longitude: location.geo.longitude
    },
    {
      entity: 'person',
      name_fa: site.personFa,
      name_en: site.personEn,
      street_address_fa: location.canonicalAddressFa,
      locality: location.addressLocality,
      region: location.addressRegion,
      postal_code: location.postalCode,
      country: location.addressCountry,
      phone_e164: location.telephone,
      website: absoluteUrl(site.pages.person),
      instagram: site.instagram,
      google_maps_cid: googleMapsReputation.cid,
      google_maps_place_id: googleMapsReputation.placeId,
      latitude: location.geo.latitude,
      longitude: location.geo.longitude
    }
  ];

  return new Response(toCsv(rows), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8' }
  });
}
