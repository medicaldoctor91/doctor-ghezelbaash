import { location } from '../data/location.mjs';
import { googleMapsReputation } from '../data/reputation.mjs';
import { absoluteUrl } from '../data/site.mjs';

function asArray(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function keyOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value['@id'] || value.target || JSON.stringify(value);
}

function appendUnique(currentValue, additions) {
  const current = asArray(currentValue);
  const keys = new Set(current.map(keyOf));
  const merged = [...current];
  for (const addition of additions) {
    const key = keyOf(addition);
    if (!key || keys.has(key)) continue;
    keys.add(key);
    merged.push(addition);
  }
  return merged;
}

function phoneContact(recipientId) {
  return {
    '@type': 'ContactAction',
    name: 'Official phone contact',
    target: `tel:${location.telephone}`,
    recipient: { '@id': recipientId }
  };
}

function appointmentRequest(recipientId) {
  return {
    '@type': 'ReserveAction',
    name: 'Appointment request by official phone',
    target: `tel:${location.telephone}`,
    recipient: { '@id': recipientId }
  };
}

function ratingFor(itemId) {
  return {
    '@type': 'AggregateRating',
    ratingValue: googleMapsReputation.ratingValue,
    ratingCount: googleMapsReputation.ratingCount,
    reviewCount: googleMapsReputation.ratingCount,
    bestRating: googleMapsReputation.bestRating,
    worstRating: googleMapsReputation.worstRating,
    itemReviewed: { '@id': itemId }
  };
}

function clinicOpeningHours() {
  return {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: [
      'https://schema.org/Saturday',
      'https://schema.org/Sunday',
      'https://schema.org/Monday',
      'https://schema.org/Tuesday',
      'https://schema.org/Wednesday',
      'https://schema.org/Thursday'
    ],
    opens: '16:00',
    closes: '22:00'
  };
}

export function applyLocalBusinessActionPass(nodes) {
  const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
  const clinicId = absoluteUrl('/#clinic');
  const clinic = byId.get(clinicId);
  const physician = byId.get(absoluteUrl('/#physician'));
  const actions = [phoneContact(clinicId), appointmentRequest(clinicId)];

  if (clinic) {
    clinic.priceRange = clinic.priceRange || location.priceRange;
    clinic.aggregateRating = clinic.aggregateRating || ratingFor(clinicId);
    clinic.openingHoursSpecification = clinic.openingHoursSpecification || clinicOpeningHours();
    clinic.potentialAction = appendUnique(clinic.potentialAction, actions);
  }

  if (physician) {
    physician.priceRange = physician.priceRange || location.priceRange;
    physician.openingHoursSpecification = physician.openingHoursSpecification || clinicOpeningHours();
    physician.potentialAction = appendUnique(physician.potentialAction, actions);
  }

  return nodes;
}
