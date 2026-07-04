#!/usr/bin/env node
import fs from 'node:fs/promises';

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const PLACE_ID = process.env.GOOGLE_PLACE_ID || 'ChIJBTOYDOTt-j8RD-7mAPy6Zas';

if (!API_KEY) {
  console.error('Missing GOOGLE_MAPS_API_KEY. No files changed.');
  process.exit(1);
}

const endpoint = `https://places.googleapis.com/v1/places/${PLACE_ID}`;
const response = await fetch(endpoint, {
  headers: {
    'X-Goog-Api-Key': API_KEY,
    'X-Goog-FieldMask': 'id,rating,userRatingCount,googleMapsUri,displayName',
  },
});

if (!response.ok) {
  const body = await response.text();
  throw new Error(`Google Places API failed: ${response.status} ${body}`);
}

const place = await response.json();
const ratingValue = Number(place.rating);
const ratingCount = Number(place.userRatingCount);

if (!Number.isFinite(ratingValue) || !Number.isFinite(ratingCount)) {
  throw new Error(`Google Places API response did not include rating/userRatingCount: ${JSON.stringify(place)}`);
}

const googleMapsUrl = place.googleMapsUri || 'https://www.google.com/maps?cid=12350483144643112463';
const today = new Date().toISOString().slice(0, 10);
const displayText = `${ratingValue.toLocaleString('fa-IR')} از ۵ در گوگل‌مپ بر اساس ${ratingCount.toLocaleString('fa-IR')} نظر`;

const ts = `export const googleMapsRating = {
  source: 'Google Maps',
  googleMapsUrl: '${googleMapsUrl}',
  googleMapsSearchUrl:
    'https://www.google.com/maps/search/?api=1&query=کلینیک%20زیبایی%20دکتر%20قزلباش%20کرمانشاه&query_place_id=${PLACE_ID}',
  placeId: '${PLACE_ID}',
  cid: '12350483144643112463',
  ratingValue: ${ratingValue},
  ratingCount: ${ratingCount},
  bestRating: 5,
  worstRating: 1,
  displayText: '${displayText}',
  lastSynced: '${today}',
  syncMode: 'google-places-api-build-time',
  enabledInSchema: true,
} as const;
`;

const json = {
  source: 'Google Maps',
  googleMapsUrl,
  googleMapsSearchUrl: `https://www.google.com/maps/search/?api=1&query=کلینیک%20زیبایی%20دکتر%20قزلباش%20کرمانشاه&query_place_id=${PLACE_ID}`,
  placeId: PLACE_ID,
  cid: '12350483144643112463',
  ratingValue,
  ratingCount,
  bestRating: 5,
  worstRating: 1,
  displayText,
  lastSynced: today,
  syncMode: 'google-places-api-build-time',
  enabledInSchema: true,
};

const updateJsonFile = async (filePath, updater) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    const next = updater(data);
    await fs.writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
};

const updateClinicRatingInGraph = (graphData, ratingJson) => {
  const nodes = Array.isArray(graphData?.['@graph']) ? graphData['@graph'] : [];
  const clinic = nodes.find((node) => node?.['@id'] === 'https://www.ghezelbaash.ir/#clinic');
  if (clinic) {
    clinic.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: ratingJson.ratingValue,
      ratingCount: ratingJson.ratingCount,
      reviewCount: ratingJson.ratingCount,
      bestRating: ratingJson.bestRating,
      worstRating: ratingJson.worstRating,
      url: ratingJson.googleMapsUrl,
    };
    clinic.hasMap = ratingJson.googleMapsUrl;
    const sameAs = Array.isArray(clinic.sameAs) ? clinic.sameAs : clinic.sameAs ? [clinic.sameAs] : [];
    for (const url of [ratingJson.googleMapsUrl, ratingJson.googleMapsSearchUrl]) {
      if (url && !sameAs.includes(url)) sameAs.push(url);
    }
    clinic.sameAs = sameAs;
  }
  const registry = nodes.find((node) => node?.['@id'] === 'https://www.ghezelbaash.ir/graph.json#entity-registry');
  if (registry) registry.dateModified = ratingJson.lastSynced;
  return graphData;
};

const updateRatingInEntityDataset = (dataset, ratingJson) => ({
  ...dataset,
  dateModified: ratingJson.lastSynced,
  googleMapsRating: ratingJson,
});

await fs.writeFile('src/data/googleMapsRating.ts', ts, 'utf8');
await fs.writeFile('public/data/google-maps-rating.json', `${JSON.stringify(json, null, 2)}\n`, 'utf8');

await updateJsonFile('public/data/ghezelbaash-entity-dataset.json', (dataset) =>
  updateRatingInEntityDataset(dataset, json)
);

await updateJsonFile('public/graph.json', (graphData) => updateClinicRatingInGraph(graphData, json));

console.log(`Synced Google Maps rating: ${displayText}`);
