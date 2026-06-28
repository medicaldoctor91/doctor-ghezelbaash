import { absoluteUrl } from '../data/site.mjs';
import { aestheticMedicineSpecialtyId } from './primaryGraphCompletion.mjs';

const PLASTIC_SURGERY = 'https://schema.org/PlasticSurgery';
const ADDITIONAL_PROPERTY_ALLOWED_TYPES = new Set([
  'MerchantReturnPolicy',
  'Offer',
  'Place',
  'Product',
  'QualitativeValue',
  'QuantitativeValue'
]);

function refs(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function keyOf(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value['@id'] || value.url || JSON.stringify(value);
}

function appendRefs(currentValue, additions = []) {
  const current = refs(currentValue);
  const seen = new Set(current.map(keyOf));
  const merged = [...current];

  for (const addition of additions.filter(Boolean)) {
    const key = keyOf(addition);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(addition);
  }

  return merged;
}

function typeList(node) {
  return Array.isArray(node?.['@type']) ? node['@type'] : [node?.['@type']].filter(Boolean);
}

function allowsAdditionalProperty(node) {
  return typeList(node).some((type) => ADDITIONAL_PROPERTY_ALLOWED_TYPES.has(type));
}

function moveUnsupportedAdditionalProperty(node) {
  if (!node?.additionalProperty || allowsAdditionalProperty(node)) return;
  node.identifier = appendRefs(node.identifier, refs(node.additionalProperty));
  delete node.additionalProperty;
}

function normalizeMedicalSpecialty(entity) {
  if (!entity) return;
  const specialtyRefs = refs(entity.medicalSpecialty);
  const kept = specialtyRefs.filter((item) => keyOf(item) !== aestheticMedicineSpecialtyId());
  entity.medicalSpecialty = appendRefs(kept, [PLASTIC_SURGERY]);
  entity.knowsAbout = appendRefs(entity.knowsAbout, [{ '@id': aestheticMedicineSpecialtyId() }]);
}

export function applySchemaOrgCompliancePass(nodes) {
  const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));

  for (const node of nodes) moveUnsupportedAdditionalProperty(node);

  normalizeMedicalSpecialty(byId.get(absoluteUrl('/#physician')));
  normalizeMedicalSpecialty(byId.get(absoluteUrl('/#clinic')));

  return nodes;
}
